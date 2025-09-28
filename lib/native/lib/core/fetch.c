#include "fetch.h"
#include "../webs_api.h"
#include <arpa/inet.h>
#include <ctype.h>
#include <errno.h>
#include <netdb.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

static void set_fetch_error(char **error, const char *msg) {
  if (error && msg) {
    if (*error == NULL) {
      *error = strdup(msg);
    }
  }
}

typedef struct {
  char *host;
  char *path;
  int port;
} ParsedUrl;

static ParsedUrl *parse_url_for_fetch(const char *url, char **error) {
  char *url_copy = strdup(url);
  if (!url_copy) {
    set_fetch_error(error, "Memory allocation failed for URL parsing.");
    return NULL;
  }

  char *original_url_copy_ptr = url_copy;

  const char *scheme_separator = "://";
  char *scheme_ptr = strstr(url_copy, scheme_separator);
  if (!scheme_ptr) {
    set_fetch_error(error, "Invalid URL: scheme missing.");
    free(original_url_copy_ptr);
    return NULL;
  }

  *scheme_ptr = '\0';
  char *scheme = url_copy;

  int port;
  if (strcmp(scheme, "http") == 0) {
    port = 80;
  } else if (strcmp(scheme, "https") == 0) {
    set_fetch_error(error, "HTTPS is not supported.");
    free(original_url_copy_ptr);
    return NULL;
  } else {
    set_fetch_error(error, "Unsupported scheme.");
    free(original_url_copy_ptr);
    return NULL;
  }

  char *host_start = scheme_ptr + strlen(scheme_separator);

  char *fragment_start = strchr(host_start, '#');
  if (fragment_start) {
    *fragment_start = '\0';
  }

  char *path_start = strchr(host_start, '/');

  ParsedUrl *parsed = malloc(sizeof(ParsedUrl));
  if (!parsed) {
    free(original_url_copy_ptr);
    set_fetch_error(error, "Memory allocation failed.");
    return NULL;
  }

  if (path_start) {
    parsed->path = strdup(path_start);
    *path_start = '\0';
  } else {
    parsed->path = strdup("/");
  }

  char *port_ptr = strchr(host_start, ':');
  if (port_ptr) {
    *port_ptr = '\0';
    port = atoi(port_ptr + 1);
  }

  parsed->host = strdup(host_start);
  parsed->port = port;

  free(original_url_copy_ptr);
  return parsed;
}

static void free_parsed_url(ParsedUrl *parsed) {
  if (parsed) {
    free(parsed->host);
    free(parsed->path);
    free(parsed);
  }
}

char *webs_fetch_sync(const char *url, const char *options_json, char **error) {
  const WebsApi *w = webs();
  ParsedUrl *parsed_url = parse_url_for_fetch(url, error);
  if (!parsed_url) {
    return NULL;
  }

  Value *options = NULL;
  const char *method = "GET";
  const char *body = "";
  char *result_json = NULL;
  char *response_buffer = NULL;
  char *request_buf = NULL;
  int sockfd = -1;

  if (options_json && strlen(options_json) > 0) {
    Status status;
    options = w->json->parse(options_json, &status);
    if (status != OK) {
      char err_buf[512];
      snprintf(err_buf, sizeof(err_buf), "Failed to parse options JSON.");
      set_fetch_error(error, err_buf);
      goto cleanup;
    }
    if (options && w->valueGetType(options) == VALUE_OBJECT) {
      Value *method_val = w->objectGet(options, "method");
      if (method_val && w->valueGetType(method_val) == VALUE_STRING) {
        method = w->valueAsString(method_val);
      }
      Value *body_val = w->objectGet(options, "body");
      if (body_val && w->valueGetType(body_val) == VALUE_STRING) {
        body = w->valueAsString(body_val);
      }
    }
  }

  struct addrinfo hints, *res, *p;
  char port_str[6];
  snprintf(port_str, sizeof(port_str), "%d", parsed_url->port);

  memset(&hints, 0, sizeof hints);
  hints.ai_family = AF_UNSPEC;
  hints.ai_socktype = SOCK_STREAM;

  int status = getaddrinfo(parsed_url->host, port_str, &hints, &res);
  if (status != 0) {
    char err_buf[256];
    snprintf(err_buf, sizeof(err_buf), "getaddrinfo failed: %s",
             gai_strerror(status));
    set_fetch_error(error, err_buf);
    goto cleanup;
  }

  for (p = res; p != NULL; p = p->ai_next) {
    sockfd = socket(p->ai_family, p->ai_socktype, p->ai_protocol);
    if (sockfd < 0) {
      continue;
    }

    if (connect(sockfd, p->ai_addr, p->ai_addrlen) == -1) {
      close(sockfd);
      sockfd = -1;
      continue;
    }

    break;
  }

  freeaddrinfo(res);

  if (sockfd < 0) {
    char err_buf[256];
    snprintf(err_buf, sizeof(err_buf), "Connection failed: %s",
             strerror(errno));
    set_fetch_error(error, err_buf);
    goto cleanup;
  }

  size_t content_length = strlen(body);
  int header_len = snprintf(NULL, 0,
                            "%s %s HTTP/1.1\r\n"
                            "Host: %s:%d\r\n"
                            "Content-Length: %zu\r\n"
                            "Connection: close\r\n\r\n",
                            method, parsed_url->path, parsed_url->host,
                            parsed_url->port, content_length);

  size_t request_size = header_len + content_length;
  request_buf = malloc(request_size + 1);

  if (!request_buf) {
    set_fetch_error(error, "Failed to allocate memory for request.");
    close(sockfd);
    goto cleanup;
  }

  snprintf(request_buf, request_size + 1,
           "%s %s HTTP/1.1\r\n"
           "Host: %s:%d\r\n"
           "Content-Length: %zu\r\n"
           "Connection: close\r\n\r\n",
           method, parsed_url->path, parsed_url->host, parsed_url->port,
           content_length);

  if (content_length > 0) {
    memcpy(request_buf + header_len, body, content_length);
  }

  if (send(sockfd, request_buf, request_size, 0) < 0) {
    set_fetch_error(error, "Failed to send request.");
    close(sockfd);
    goto cleanup;
  }
  free(request_buf);
  request_buf = NULL;

  size_t capacity = 8192;
  response_buffer = malloc(capacity);
  size_t total_read = 0;
  ssize_t n;
  while ((n = recv(sockfd, response_buffer + total_read,
                   capacity - total_read - 1, 0)) > 0) {
    total_read += n;
    if (capacity - total_read < 2) {
      capacity *= 2;
      response_buffer = realloc(response_buffer, capacity);
    }
  }
  response_buffer[total_read] = '\0';
  close(sockfd);
  sockfd = -1;

  char *header_end = strstr(response_buffer, "\r\n\r\n");
  if (!header_end) {
    set_fetch_error(error, "Invalid HTTP response: Missing header separator.");
    goto cleanup;
  }
  *header_end = '\0';
  char *response_body = header_end + 4;

  char *saveptr_headers;
  char *status_line = strtok_r(response_buffer, "\r\n", &saveptr_headers);
  if (!status_line) {
    set_fetch_error(error, "Invalid HTTP response: Missing status line.");
    goto cleanup;
  }

  char *saveptr_status;
  strtok_r(status_line, " ", &saveptr_status);
  char *status_code_str = strtok_r(NULL, " ", &saveptr_status);
  char *status_text_str = strtok_r(NULL, "", &saveptr_status);

  Value *result_obj = w->object();
  w->objectSet(result_obj, "status",
               w->number(status_code_str ? atoi(status_code_str) : 0));
  w->objectSet(result_obj, "statusText",
               w->string(status_text_str ? status_text_str : ""));
  w->objectSet(result_obj, "body", w->string(response_body));

  Value *headers_obj = w->object();
  char *header_line = strtok_r(NULL, "\r\n", &saveptr_headers);
  while (header_line) {
    char *colon = strchr(header_line, ':');
    if (colon) {
      *colon = '\0';
      char *value = colon + 1;
      while (*value && isspace((unsigned char)*value))
        value++;
      w->objectSet(headers_obj, header_line, w->string(value));
    }
    header_line = strtok_r(NULL, "\r\n", &saveptr_headers);
  }
  w->objectSet(result_obj, "headers", headers_obj);

  result_json = w->json->encode(result_obj);
  w->freeValue(result_obj);

cleanup:
  if (sockfd != -1)
    close(sockfd);
  if (options)
    w->freeValue(options);
  if (response_buffer)
    free(response_buffer);
  if (request_buf)
    free(request_buf);
  free_parsed_url(parsed_url);

  return (*error) ? NULL : result_json;
}
