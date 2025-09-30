#include "asset.h"
#include "../webs_api.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *extract_tag_content(const char *source, const char *tag) {
  char start_tag[256];
  char end_tag[256];
  snprintf(start_tag, sizeof(start_tag), "<%s>", tag);
  snprintf(end_tag, sizeof(end_tag), "</%s>", tag);

  const char *start = strstr(source, start_tag);
  if (!start)
    return strdup("");

  start += strlen(start_tag);
  const char *end = strstr(start, end_tag);
  if (!end)
    return strdup("");

  size_t len = end - start;
  char *content = malloc(len + 1);
  if (!content)
    return NULL;

  strncpy(content, start, len);
  content[len] = '\0';
  char *trimmed = W->stringTrim(content);
  free(content);
  return trimmed;
}

static AssetType get_asset_type(const char *file_path) {
  const char *dot = strrchr(file_path, '.');
  if (!dot || dot == file_path)
    return ASSET_UNKNOWN;
  if (strcmp(dot, ".js") == 0)
    return ASSET_JS;
  if (strcmp(dot, ".css") == 0)
    return ASSET_CSS;
  if (strcmp(dot, ".html") == 0)
    return ASSET_HTML;
  if (strcmp(dot, ".webs") == 0)
    return ASSET_WEBS;
  return ASSET_UNKNOWN;
}

static void find_js_dependencies(const char *content, Value *dependencies,
                                 Value *exports) {
  const char *p = content;

  while ((p = strstr(p, "from"))) {
    p += 4;
    while (*p && isspace((unsigned char)*p))
      p++;

    if (*p == '\'' || *p == '"') {
      char quote = *p;
      p++;
      const char *start = p;
      while (*p && *p != quote) {
        if (*p == '\\') {
          p++;
        }
        if (*p)
          p++;
      }
      if (*p == quote) {
        char *dep_path = strndup(start, p - start);
        if (dep_path) {
          W->arrayPush(dependencies, W->string(dep_path));
          free(dep_path);
        }
        p++;
      }
    }
  }

  p = content;
  if (strstr(p, "export")) {
    if (W->arrayCount(exports) == 0) {
      W->arrayPush(exports, W->string("found"));
    }
  }
}

char *walk_asset(const char *file_path, char **error) {
  *error = NULL;

  char *content = NULL;
  char *read_error = NULL;
  Status status = W->fs->readFile(file_path, &content, &read_error);

  if (status != OK) {
    asprintf(error, "Failed to read file: %s. Details: %s", file_path,
             read_error ? read_error : "Unknown I/O error");
    if (read_error)
      W->freeString(read_error);
    if (content)
      W->freeString(content);
    return NULL;
  }

  Value *dependencies = W->array();
  Value *exports = W->array();
  AssetType asset_type = get_asset_type(file_path);

  if (asset_type == ASSET_JS) {
    find_js_dependencies(content, dependencies, exports);
  } else if (asset_type == ASSET_WEBS) {
    char *script_content = extract_tag_content(content, "script");
    if (script_content) {
      find_js_dependencies(script_content, dependencies, exports);
      free(script_content);
    }
  }

  W->freeString(content);

  Value *asset_obj = W->object();
  W->objectSet(asset_obj, "path", W->string(file_path));
  W->objectSet(asset_obj, "type", W->number(asset_type));
  W->objectSet(asset_obj, "dependencies", dependencies);
  W->objectSet(asset_obj, "exports", exports);

  char *json_result = W->json->encode(asset_obj);
  W->freeValue(asset_obj);

  return json_result;
}
