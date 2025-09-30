#include "http.h"
#include "../core/object.h"
#include "../core/string.h"
#include "../webs_api.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

Value *webs_http_parse_request(const char *raw_request, char **error) {
  *error = NULL;
  if (!raw_request) {
    *error = strdup("Request is null.");
    return NULL;
  }

  const char *start = raw_request;
  while (*start && isspace((unsigned char)*start))
    start++;
  if (*start == '\0') {
    *error = strdup("Request is empty or malformed");
    return NULL;
  }

  const char *body_separator = "\r\n\r\n";
  const char *body_start_ptr = strstr(start, body_separator);
  size_t headers_len =
      body_start_ptr ? (size_t)(body_start_ptr - start) : strlen(start);
  char *headers_part = strndup(start, headers_len);
  if (!headers_part) {
    *error = strdup("Failed to allocate memory for headers.");
    return NULL;
  }

  Value *request_obj_val = object_value();
  Object *request_obj = request_obj_val->as.object;
  Value *headers_obj_val = object_value();
  request_obj->set(request_obj, "headers", headers_obj_val);
  Object *headers_obj = headers_obj_val->as.object;

  char *line_saveptr = NULL;
  char *line = strtok_r(headers_part, "\r\n", &line_saveptr);
  if (!line) {
    *error = strdup("Malformed request line: missing request line.");
    goto cleanup;
  }

  char *method = line;
  char *path_full = strchr(method, ' ');
  if (!path_full) {
    *error = strdup("Malformed request line: missing path.");
    goto cleanup;
  }
  *path_full++ = '\0';
  char *version = strchr(path_full, ' ');
  if (!version) {
    *error = strdup("Malformed request line: missing HTTP version.");
    goto cleanup;
  }
  *version++ = '\0';

  char *query_string = strchr(path_full, '?');
  if (query_string) {
    *query_string++ = '\0';
    request_obj->set(request_obj, "query", string_value(query_string));
  } else {
    request_obj->set(request_obj, "query", string_value(""));
  }

  request_obj->set(request_obj, "method", string_value(method));
  request_obj->set(request_obj, "version", string_value(version));
  request_obj->set(request_obj, "path", string_value(path_full));

  long content_length = -1;
  while ((line = strtok_r(NULL, "\r\n", &line_saveptr))) {
    char *colon = strchr(line, ':');
    if (colon) {
      *colon = '\0';
      char *key = line;
      char *value_start = colon + 1;
      while (*value_start && isspace((unsigned char)*value_start))
        value_start++;
      char *value_end = value_start + strlen(value_start) - 1;
      while (value_end > value_start && isspace((unsigned char)*value_end))
        *value_end-- = '\0';

      char *lower_key = strdup(key);
      for (int i = 0; lower_key[i]; i++) {
        lower_key[i] = tolower(lower_key[i]);
      }
      headers_obj->set(headers_obj, lower_key, string_value(value_start));
      if (strcasecmp(key, "Content-Length") == 0)
        content_length = atol(value_start);
      free(lower_key);
    }
  }

  if (body_start_ptr) {
    const char *body_content_start = body_start_ptr + strlen(body_separator);
    size_t actual_body_len = strlen(body_content_start);
    if (content_length > 0 && actual_body_len > 0) {
      size_t len_to_copy = actual_body_len < (size_t)content_length
                               ? actual_body_len
                               : (size_t)content_length;
      char *body_str = strndup(body_content_start, len_to_copy);
      request_obj->set(request_obj, "body", string_value(body_str));
      free(body_str);
    } else {
      request_obj->set(request_obj, "body", string_value(""));
    }
  } else {
    request_obj->set(request_obj, "body", string_value(""));
  }

  free(headers_part);
  return request_obj_val;

cleanup:
  value_free(request_obj_val);
  free(headers_part);
  return NULL;
}
