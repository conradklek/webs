#include "http.h"
#include "../core/object.h"
#include "../core/string.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

Value *webs_http_parse_request(const char *raw_request, char **error) {
  char *request_copy = NULL;
  Value *request_obj_val = NULL;
  *error = NULL;

  if (!raw_request || *raw_request == '\0') {
    *error = strdup("Request is empty or malformed.");
    goto cleanup;
  }

  request_copy = strdup(raw_request);
  if (!request_copy) {
    *error = strdup("Failed to allocate memory for request copy.");
    goto cleanup;
  }

  request_obj_val = object_value();
  if (!request_obj_val) {
    *error = strdup("Failed to allocate memory for request object.");
    goto cleanup;
  }
  Object *request_obj = request_obj_val->as.object;

  Value *headers_obj_val = object_value();
  if (!headers_obj_val) {
    *error = strdup("Failed to allocate memory for headers object.");
    goto cleanup;
  }
  Object *headers_obj = headers_obj_val->as.object;
  request_obj->set(request_obj, "headers", headers_obj_val);

  char *line_saveptr = NULL;
  char *line = strtok_r(request_copy, "\r\n", &line_saveptr);

  if (!line) {
    *error = strdup("Request is empty or malformed.");
    goto cleanup;
  }

  char *method = line;
  char *path = strchr(method, ' ');
  if (!path) {
    *error = strdup("Malformed request line: missing path.");
    goto cleanup;
  }
  *path = '\0';
  path++;

  char *version = strchr(path, ' ');
  if (!version) {
    *error = strdup("Malformed request line: missing HTTP version.");
    goto cleanup;
  }
  *version = '\0';
  version++;

  request_obj->set(request_obj, "method", string_value(method));
  request_obj->set(request_obj, "version", string_value(version));

  char *query = strchr(path, '?');
  if (query) {
    *query = '\0';
    request_obj->set(request_obj, "query", string_value(query + 1));
  } else {
    request_obj->set(request_obj, "query", string_value(""));
  }
  request_obj->set(request_obj, "path", string_value(path));

  line = strtok_r(NULL, "\r\n", &line_saveptr);
  while (line) {
    char *colon = strchr(line, ':');
    if (colon) {
      *colon = '\0';
      char *key = line;
      char *value = colon + 1;

      while (*value && isspace((unsigned char)*value))
        value++;
      char *end = value + strlen(value) - 1;
      while (end > value && isspace((unsigned char)*end))
        end--;
      *(end + 1) = '\0';

      headers_obj->set(headers_obj, key, string_value(value));
    }
    line = strtok_r(NULL, "\r\n", &line_saveptr);
  }

cleanup:
  if (request_copy) {
    free(request_copy);
  }
  if (*error) {
    if (request_obj_val) {
      value_free(request_obj_val);
      request_obj_val = NULL;
    }
  }

  return request_obj_val;
}
