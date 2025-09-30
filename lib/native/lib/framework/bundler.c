#include "bundler.h"
#include "../core/map.h"
#include "../core/string_builder.h"
#include "../modules/path.h"
#include "../webs_api.h"
#include "asset.h"
#include <ctype.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct AssetNode {
  char *path;
  Value *asset_info;
  bool visited;
  bool in_stack;
} AssetNode;

typedef struct AssetGraph {
  AssetNode **nodes;
  size_t count;
  size_t capacity;
  Map *path_to_node_map;
} AssetGraph;

static char *extract_tag_content(const char *source, const char *tag);
static char *get_component_name(const char *path);
static void topological_sort_visit(AssetNode *node, AssetGraph *graph,
                                   Value *sorted_list, char **error);
static char *process_webs_script(const char *script_str,
                                 const char *template_str);

Status webs_bundle_from_entry(const char *entry_file, const char *output_dir,
                              char **error) {
  *error = NULL;
  Status status = OK;

  AssetGraph graph = {.nodes = NULL, .count = 0, .capacity = 16};
  graph.path_to_node_map = map(16);
  graph.nodes = malloc(sizeof(AssetNode *) * graph.capacity);
  Value *processing_queue = W->array();
  Value *sorted_assets = W->array();
  StringBuilder js_bundle_sb, css_bundle_sb;
  sb_init(&js_bundle_sb);
  sb_init(&css_bundle_sb);

  if(!graph.nodes || !processing_queue || !sorted_assets) {
      status = ERROR_MEMORY;
      goto cleanup;
  }

  W->arrayPush(processing_queue, W->string(entry_file));
  size_t head = 0;
  while (head < W->arrayCount(processing_queue)) {
    Value *path_val = W->arrayGetRef(processing_queue, head++);
    char *current_path = strdup(W->valueAsString(path_val));

    if (graph.path_to_node_map->get(graph.path_to_node_map, current_path)) {
      free(current_path);
      continue;
    }

    char *asset_json = NULL;
    char *walk_error = NULL;
    status = W->asset->walk(current_path, &asset_json, &walk_error);
    if (status != OK) {
      asprintf(error, "Failed to walk asset %s: %s", current_path, walk_error);
      W->freeString(walk_error);
      free(current_path);
      goto cleanup;
    }

    Value *asset_info = NULL;
    char *parse_error = NULL;
    status = W->json->parse(asset_json, &asset_info, &parse_error);
    W->freeString(asset_json);
    if (status != OK) {
      asprintf(error, "Failed to parse asset info for %s: %s", current_path,
               parse_error);
      W->freeString(parse_error);
      free(current_path);
      if (asset_info)
        W->freeValue(asset_info);
      goto cleanup;
    }

    AssetNode *node = calloc(1, sizeof(AssetNode));
    node->path = current_path;
    node->asset_info = asset_info;

    if (graph.count >= graph.capacity) {
      graph.capacity *= 2;
      graph.nodes = realloc(graph.nodes, sizeof(AssetNode *) * graph.capacity);
    }
    graph.nodes[graph.count++] = node;
    graph.path_to_node_map->set(graph.path_to_node_map, current_path,
                                W->pointer(node));

    Value *dependencies = W->objectGetRef(asset_info, "dependencies");
    for (size_t i = 0; i < W->arrayCount(dependencies); i++) {
      const char *relative_dep =
          W->valueAsString(W->arrayGetRef(dependencies, i));
      char *absolute_dep_path = path_resolve(current_path, relative_dep);
      if (absolute_dep_path) {
        W->arrayPush(processing_queue, W->string(absolute_dep_path));
        free(absolute_dep_path);
      }
    }
  }

  for (size_t i = 0; i < graph.count; i++) {
    if (!graph.nodes[i]->visited) {
      topological_sort_visit(graph.nodes[i], &graph, sorted_assets, error);
      if (*error) {
        status = ERROR_PARSE;
        goto cleanup;
      }
    }
  }

  for (size_t i = 0; i < W->arrayCount(sorted_assets); i++) {
    Value *asset_ptr_val = W->arrayGetRef(sorted_assets, i);
    AssetNode *node = (AssetNode *)asset_ptr_val->as.pointer;
    AssetType type =
        (AssetType)W->valueAsNumber(W->objectGetRef(node->asset_info, "type"));

    char *file_content = NULL;
    char *read_error = NULL;
    if (W->fs->readFile(node->path, &file_content, &read_error) != OK) {
      asprintf(error, "Could not re-read file for bundling: %s. Reason: %s",
               node->path, read_error);
      status = ERROR_IO;
      if(read_error) W->freeString(read_error);
      goto cleanup;
    }

    if (type == ASSET_WEBS) {
      char *template_str = extract_tag_content(file_content, "template");
      char *script_str = extract_tag_content(file_content, "script");
      char *style_str = extract_tag_content(file_content, "style");
      char *component_name = get_component_name(node->path);
      char *final_component_def = process_webs_script(script_str, template_str);

      sb_append_str(&js_bundle_sb, "webs.registerComponent('");
      sb_append_str(&js_bundle_sb, component_name);
      sb_append_str(&js_bundle_sb, "', ");
      sb_append_str(&js_bundle_sb, final_component_def);
      sb_append_str(&js_bundle_sb, ");\n");

      free(final_component_def);
      if (style_str && *style_str) {
        sb_append_str(&css_bundle_sb, style_str);
        sb_append_char(&css_bundle_sb, '\n');
      }
      free(template_str);
      free(script_str);
      free(style_str);
      free(component_name);
    } else if (type == ASSET_JS) {
      sb_append_str(&js_bundle_sb, file_content);
      sb_append_char(&js_bundle_sb, '\n');
    } else if (type == ASSET_CSS) {
      sb_append_str(&css_bundle_sb, file_content);
      sb_append_char(&css_bundle_sb, '\n');
    }
    W->freeString(file_content);
  }

  if (!W->fs->exists(output_dir))
    W->fs->createDir(output_dir, NULL);
  char js_output_path[PATH_MAX];
  char css_output_path[PATH_MAX];
  snprintf(js_output_path, sizeof(js_output_path), "%s/bundle.js", output_dir);
  snprintf(css_output_path, sizeof(css_output_path), "%s/bundle.css",
           output_dir);

  char *js_bundle = sb_to_string(&js_bundle_sb);
  W->fs->writeFile(js_output_path, js_bundle, NULL);
  free(js_bundle);

  char *css_bundle = sb_to_string(&css_bundle_sb);
  if (strlen(css_bundle) > 0) {
    W->fs->writeFile(css_output_path, css_bundle, NULL);
  }
  free(css_bundle);

cleanup:
  if(processing_queue) W->freeValue(processing_queue);
  if(sorted_assets) W->freeValue(sorted_assets);
  if(graph.nodes) {
    for (size_t i = 0; i < graph.count; i++) {
        if(graph.nodes[i]) {
            free(graph.nodes[i]->path);
            W->freeValue(graph.nodes[i]->asset_info);
            free(graph.nodes[i]);
        }
    }
    free(graph.nodes);
  }
  if(graph.path_to_node_map) map_free(graph.path_to_node_map);
  return status;
}

static void topological_sort_visit(AssetNode *node, AssetGraph *graph,
                                   Value *sorted_list, char **error) {
  node->visited = true;
  node->in_stack = true;

  Value *dependencies = W->objectGetRef(node->asset_info, "dependencies");
  for (size_t i = 0; i < W->arrayCount(dependencies); i++) {
    const char *relative_dep =
        W->valueAsString(W->arrayGetRef(dependencies, i));
    char *absolute_dep_path = path_resolve(node->path, relative_dep);
    if (!absolute_dep_path)
      continue;

    Value *dep_node_ptr_val = graph->path_to_node_map->get(
        graph->path_to_node_map, absolute_dep_path);
    if (dep_node_ptr_val) {
      AssetNode *dep_node = (AssetNode *)dep_node_ptr_val->as.pointer;
      if (dep_node->in_stack) {
        asprintf(error, "Circular dependency detected: %s -> %s", node->path,
                 dep_node->path);
        free(absolute_dep_path);
        return;
      }
      if (!dep_node->visited) {
        topological_sort_visit(dep_node, graph, sorted_list, error);
        if (*error) {
          free(absolute_dep_path);
          return;
        }
      }
    }
    free(absolute_dep_path);
  }

  node->in_stack = false;
  W->arrayPush(sorted_list, W->pointer(node));
}

static char *extract_tag_content(const char *source, const char *tag) {
  char start_tag[256], end_tag[256];
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

static char *process_webs_script(const char *script_str,
                                 const char *template_str) {
  char *mutable_script = strdup(script_str);
  if (!mutable_script)
    return strdup("{ template: `` }");
  char *current_pos = mutable_script;
  while ((current_pos = strstr(current_pos, "import"))) {
    char *end_of_line = strchr(current_pos, '\n');
    if (end_of_line) {
      memmove(current_pos, end_of_line + 1, strlen(end_of_line + 1) + 1);
    } else {
      *current_pos = '\0';
      break;
    }
  }
  char *processed_content;
  char *export_default = strstr(mutable_script, "export default");
  if (export_default) {
    processed_content = export_default + strlen("export default");
  } else {
    processed_content = mutable_script;
  }
  char *trimmed_script = W->stringTrim(processed_content);
  free(mutable_script);
  if (strlen(trimmed_script) > 0 && trimmed_script[strlen(trimmed_script) - 1] == ';') {
    trimmed_script[strlen(trimmed_script) - 1] = '\0';
  }
  char *trimmed_again = W->stringTrim(trimmed_script);
  free(trimmed_script);
  trimmed_script = trimmed_again;
  char *last_brace = strrchr(trimmed_script, '}');
  if (!last_brace) {
    free(trimmed_script);
    trimmed_script = strdup("{}");
    last_brace = trimmed_script + 1;
  }
  StringBuilder final_def_sb;
  sb_init(&final_def_sb);
  char *part1 = strndup(trimmed_script, last_brace - trimmed_script);
  sb_append_str(&final_def_sb, part1);
  free(part1);
  char *p = last_brace - 1;
  bool needs_comma = false;
  while (p > trimmed_script) {
    if (!isspace((unsigned char)*p)) {
      if (*p != '{') {
        needs_comma = true;
      }
      break;
    }
    p--;
  }
  if (needs_comma) {
    sb_append_char(&final_def_sb, ',');
  }
  sb_append_str(&final_def_sb, " template: `");
  const char *t_ptr = template_str;
  while (*t_ptr) {
    if (*t_ptr == '`' || *t_ptr == '\\') {
      sb_append_char(&final_def_sb, '\\');
    }
    sb_append_char(&final_def_sb, *t_ptr);
    t_ptr++;
  }
  sb_append_str(&final_def_sb, "` }");
  free(trimmed_script);
  return sb_to_string(&final_def_sb);
}


