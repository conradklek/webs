#include "bundler.h"
#include "../core/string_builder.h"
#include "../webs_api.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static char *extract_tag_content(const char *source, const char *tag) {
  const WebsApi *w = webs();
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
  char *trimmed = w->stringTrim(content);
  free(content);
  return trimmed;
}

static char *get_component_name(const char *path) {
  const char *last_slash = strrchr(path, '/');
  const char *start = last_slash ? last_slash + 1 : path;
  const char *dot = strrchr(start, '.');
  size_t len = dot ? (size_t)(dot - start) : strlen(start);

  char *name = malloc(len + 1);
  if (!name)
    return NULL;
  strncpy(name, start, len);
  name[len] = '\0';
  return name;
}

Status webs_bundle_directory(const char *input_dir, const char *output_dir,
                             char **error) {
  *error = NULL;
  Status status = OK;
  const WebsApi *w = webs();
  char *api_error = NULL;
  char *glob_pattern = NULL;
  char *file_list_json = NULL;
  Value *file_list_val = NULL;
  StringBuilder js_bundle_sb;
  StringBuilder css_bundle_sb;
  sb_init(&js_bundle_sb);
  sb_init(&css_bundle_sb);

  if (!w->fs->exists(output_dir)) {
    api_error = w->fs->createDir(output_dir);
    if (api_error) {
      *error = api_error;
      status = ERROR_IO;
      goto cleanup;
    }
  }

  size_t pattern_len = strlen(input_dir) + strlen("/*.webs") + 1;
  glob_pattern = malloc(pattern_len);
  snprintf(glob_pattern, pattern_len, "%s/*.webs", input_dir);

  file_list_json = w->fs->glob(glob_pattern);
  if (!file_list_json || file_list_json[0] != '[') {
    *error = file_list_json ? file_list_json
                            : strdup("Glob operation failed returning null.");
    file_list_json = NULL;
    status = ERROR_IO;
    goto cleanup;
  }

  Status parse_status;
  file_list_val = w->json->parse(file_list_json, &parse_status);
  if (parse_status != OK || !file_list_val ||
      w->valueGetType(file_list_val) != VALUE_ARRAY) {
    *error = strdup("Failed to parse glob result.");
    status = ERROR_PARSE;
    goto cleanup;
  }

  for (size_t i = 0; i < w->arrayCount(file_list_val); i++) {
    Value *path_val = w->arrayGet(file_list_val, i);
    const char *path = w->valueAsString(path_val);

    char *file_content = w->fs->readFile(path);
    if (!file_content || strstr(file_content, "\"error\"")) {
      asprintf(error, "Failed to read component file '%s'. Details: %s", path,
               file_content ? file_content : "N/A");
      w->freeString(file_content);
      status = ERROR_IO;
      goto cleanup;
    }

    char *template_str = extract_tag_content(file_content, "template");
    char *script_str = extract_tag_content(file_content, "script");
    char *style_str = extract_tag_content(file_content, "style");
    char *component_name = get_component_name(path);

    Value *def_obj =
        w->json->parse(script_str && *script_str ? script_str : "{}", &status);
    if (status != OK) {
      asprintf(error, "Failed to parse script block in component '%s'",
               component_name);
      free(file_content);
      free(template_str);
      free(script_str);
      free(style_str);
      free(component_name);
      goto cleanup;
    }

    w->objectSet(def_obj, "template", w->string(template_str));
    char *def_json = w->json->encode(def_obj);

    sb_append_str(&js_bundle_sb, "webs.registerComponent('");
    sb_append_str(&js_bundle_sb, component_name);
    sb_append_str(&js_bundle_sb, "', ");
    sb_append_str(&js_bundle_sb, def_json);
    sb_append_str(&js_bundle_sb, ");\n");

    if (style_str && *style_str) {
      sb_append_str(&css_bundle_sb, style_str);
      sb_append_char(&css_bundle_sb, '\n');
    }

    free(file_content);
    free(template_str);
    free(script_str);
    free(style_str);
    free(component_name);
    w->freeValue(def_obj);
    w->freeString(def_json);
  }

  char js_output_path[1024];
  snprintf(js_output_path, sizeof(js_output_path), "%s/bundle.js", output_dir);
  char *js_bundle_content = sb_to_string(&js_bundle_sb);

  api_error = w->fs->writeFile(js_output_path, js_bundle_content);
  if (api_error) {
    *error = api_error;
    status = ERROR_IO;
  }
  free(js_bundle_content);

  char css_output_path[1024];
  snprintf(css_output_path, sizeof(css_output_path), "%s/bundle.css",
           output_dir);
  char *css_bundle_content = sb_to_string(&css_bundle_sb);
  if (css_bundle_content && *css_bundle_content) {
    api_error = w->fs->writeFile(css_output_path, css_bundle_content);
    if (api_error) {
      *error = api_error;
      status = ERROR_IO;
    }
  }
  free(css_bundle_content);

cleanup:
  free(glob_pattern);
  w->freeString(file_list_json);
  w->freeValue(file_list_val);
  sb_free(&js_bundle_sb);
  sb_free(&css_bundle_sb);
  return status;
}
