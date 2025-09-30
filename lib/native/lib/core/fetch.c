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
  if (W->stringCompare(scheme, "http") == 0) {
    port = 80;
  } else if (W->stringCompare(scheme, "https") == 0) {
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
  ParsedUrl *parsed_url = NULL;
  Value *options = NULL;
  char *result_json = NULL;
  char *response_buffer = NULL;
  char *request_buf = NULL;
  int sockfd = -1;
  struct addrinfo *res = NULL;

  const char *method = "GET";
  const char *body = "";
  struct addrinfo hints, *p;

  parsed_url = parse_url_for_fetch(url, error);
  if (!parsed_url) {
    goto cleanup;
  }

  if (options_json && strlen(options_json) > 0) {
    Status status;
    char *parse_error = NULL;
    status = W->json->parse(options_json, &options, &parse_error);
    if (status != OK) {
      char err_buf[512];
      snprintf(err_buf, sizeof(err_buf), "Failed to parse options JSON: %s",
               parse_error ? parse_error : "Unknown error");
      set_fetch_error(error, err_buf);
      if (parse_error)
        W->freeString(parse_error);
      goto cleanup;
    }

    if (options && W->valueGetType(options) == VALUE_OBJECT) {
      Value *method_val = W->objectGetRef(options, "method");
      if (method_val && W->valueGetType(method_val) == VALUE_STRING) {
        method = W->valueAsString(method_val);
      }
      Value *body_val = W->objectGetRef(options, "body");
      if (body_val && W->valueGetType(body_val) == VALUE_STRING) {
        body = W->valueAsString(body_val);
      }
    }
  }

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
  res = NULL;

  if (sockfd < 0) {
    char err_buf[256];
    snprintf(err_buf, sizeof(err_buf), "Connection failed: %s",
             strerror(errno));
    set_fetch_error(error, err_buf);
    goto cleanup;
  }

  size_t content_length = strlen(body);
  StringBuilder custom_headers_sb;
  W->stringBuilder->init(&custom_headers_sb);

  if (options && W->valueGetType(options) == VALUE_OBJECT) {
    Value *headers_val = W->objectGetRef(options, "headers");
    if (headers_val && W->valueGetType(headers_val) == VALUE_OBJECT) {
      Value *keys = W->objectKeys(headers_val);
      for (size_t i = 0; i < W->arrayCount(keys); ++i) {
        const char *key = W->valueAsString(W->arrayGetRef(keys, i));
        const char *value = W->valueAsString(W->objectGetRef(headers_val, key));
        W->stringBuilder->appendStr(&custom_headers_sb, key);
        W->stringBuilder->appendStr(&custom_headers_sb, ": ");
        W->stringBuilder->appendStr(&custom_headers_sb, value);
        W->stringBuilder->appendStr(&custom_headers_sb, "\r\n");
      }
      W->freeValue(keys);
    }
  }
  char *custom_headers_str = W->stringBuilder->toString(&custom_headers_sb);

  size_t request_size =
      snprintf(NULL, 0,
               "%s %s HTTP/1.1\r\n"
               "Host: %s:%d\r\n"
               "Content-Length: %zu\r\n"
               "Connection: close\r\n"
               "%s\r\n",
               method, parsed_url->path, parsed_url->host, parsed_url->port,
               content_length, custom_headers_str) +
      content_length + 1;

  request_buf = malloc(request_size);
  if (!request_buf) {
    set_fetch_error(error, "Failed to allocate memory for request.");
    W->freeString(custom_headers_str);
    goto cleanup;
  }

  int written_len =
      sprintf(request_buf,
              "%s %s HTTP/1.1\r\n"
              "Host: %s:%d\r\n"
              "Content-Length: %zu\r\n"
              "Connection: close\r\n"
              "%s\r\n",
              method, parsed_url->path, parsed_url->host, parsed_url->port,
              content_length, custom_headers_str);
  W->freeString(custom_headers_str);

  if (content_length > 0) {
    memcpy(request_buf + written_len, body, content_length);
    written_len += content_length;
  }

  if (send(sockfd, request_buf, written_len, 0) < 0) {
    set_fetch_error(error, "Failed to send request.");
    goto cleanup;
  }

  size_t capacity = 8192;
  response_buffer = malloc(capacity);
  if (!response_buffer) {
    set_fetch_error(error, "Failed to allocate memory for response buffer.");
    goto cleanup;
  }

  size_t total_read = 0;
  ssize_t n;
  while ((n = recv(sockfd, response_buffer + total_read,
                   capacity - total_read - 1, 0)) > 0) {
    total_read += n;
    if (capacity - total_read < 2) {
      capacity *= 2;
      char *new_buffer = realloc(response_buffer, capacity);
      if (!new_buffer) {
        set_fetch_error(error, "Failed to reallocate response buffer.");
        goto cleanup;
      }
      response_buffer = new_buffer;
    }
  }

  close(sockfd);
  sockfd = -1;

  response_buffer[total_read] = '\0';

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

  Value *headers_obj = W->object();
  if (!headers_obj) {
    set_fetch_error(error, "Memory allocation failed for headers object.");
    goto cleanup;
  }

  char *header_line = strtok_r(NULL, "\r\n", &saveptr_headers);
  while (header_line) {
    char *colon = strchr(header_line, ':');
    if (colon) {
      *colon = '\0';
      char *value = colon + 1;
      while (*value && isspace((unsigned char)*value))
        value++;
      W->objectSet(headers_obj, header_line, W->string(value));
    }
    header_line = strtok_r(NULL, "\r\n", &saveptr_headers);
  }

  Value *result_obj = W->objectOf(
      "status", W->number(status_code_str ? atoi(status_code_str) : 0),
      "statusText", W->string(status_text_str ? status_text_str : ""), "body",
      W->string(response_body), "headers", headers_obj, NULL);

  if (!result_obj) {
    set_fetch_error(error, "Memory allocation failed for result object.");
    W->freeValue(headers_obj);
    goto cleanup;
  }

  result_json = W->json->encode(result_obj);
  W->freeValue(result_obj);

  if (!result_json) {
    set_fetch_error(error, "Failed to encode result JSON.");
  }

cleanup:
  if (sockfd != -1)
    close(sockfd);
  if (options)
    W->freeValue(options);
  if (response_buffer)
    free(response_buffer);
  if (request_buf)
    free(request_buf);
  if (res)
    freeaddrinfo(res);
  free_parsed_url(parsed_url);

  return (*error) ? NULL : result_json;
}
