#include "http.h"
#include "../core/object.h"
#include "../core/string.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

Value *webs_http_parse_request(const char *raw_request, Status *status) {
  char *request_copy = NULL;
  Value *request_obj_val = NULL;
  *status = OK;

  if (!raw_request || *raw_request == '\0') {
    *status = ERROR_PARSE;
    goto cleanup;
  }

  request_copy = strdup(raw_request);
  if (!request_copy) {
    *status = ERROR_MEMORY;
    goto cleanup;
  }

  request_obj_val = object_value();
  if (!request_obj_val) {
    *status = ERROR_MEMORY;
    goto cleanup;
  }
  Object *request_obj = request_obj_val->as.object_val;

  Value *headers_obj_val = object_value();
  if (!headers_obj_val) {
    *status = ERROR_MEMORY;
    goto cleanup;
  }
  Object *headers_obj = headers_obj_val->as.object_val;
  request_obj->set(request_obj, "headers", headers_obj_val);

  char *line_saveptr = NULL;
  char *line = strtok_r(request_copy, "\r\n", &line_saveptr);

  if (line) {
    char *method = line;
    char *path = strchr(method, ' ');
    if (path) {
      *path = '\0';
      path++;
      while (*path && isspace((unsigned char)*path))
        path++;

      char *version = strrchr(path, ' ');
      if (version) {
        *version = '\0';
        version++;
        while (*version && isspace((unsigned char)*version))
          version++;
        request_obj->set(request_obj, "version", string_value(version));
      }
      request_obj->set(request_obj, "path", string_value(path));
    }
    request_obj->set(request_obj, "method", string_value(method));
    line = strtok_r(NULL, "\r\n", &line_saveptr);
  } else {
    *status = ERROR_PARSE;
    goto cleanup;
  }

  while (line) {
    char *colon = strchr(line, ':');
    if (colon) {
      *colon = '\0';
      char *key = line;
      char *value = colon + 1;

      string_trim_end(key);
      char *trimmed_value = string_trim(value);

      headers_obj->set(headers_obj, key, string_value(trimmed_value));
    }
    line = strtok_r(NULL, "\r\n", &line_saveptr);
  }

cleanup:
  if (request_copy) {
    free(request_copy);
  }
  if (*status != OK) {
    if (request_obj_val) {
      value_free(request_obj_val);
      request_obj_val = NULL;
    }
  }

  return request_obj_val;
}
