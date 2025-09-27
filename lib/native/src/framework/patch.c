#include "patch.h"
#include "../core/array.h"
#include "../core/console.h"
#include "../core/map.h"
#include "../core/null.h"
#include "../core/number.h"
#include "../core/object.h"
#include "../core/string.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef enum {
  PATCH_CREATE_NODE,
  PATCH_REMOVE_NODE,
  PATCH_REPLACE_NODE,
  PATCH_UPDATE_PROPS,
  PATCH_SET_TEXT,
  PATCH_REORDER_CHILDREN,
  PATCH_UPDATE_EVENTS,
} PatchType;

typedef struct {
  Value *patches;
  int *node_path;
  int path_depth;
  int path_capacity;
} DiffContext;

static void diff_nodes(DiffContext *ctx, VNode *n1, VNode *n2, int index);
static void diff_children(DiffContext *ctx, VNode *n1, VNode *n2);
static void diff_keyed_children(DiffContext *ctx, Value *c1_val, Value *c2_val);
static void diff_events(DiffContext *ctx, VNode *n1, VNode *n2);
static int *get_lis(int *arr, int n, int *lis_len);

static void path_push(DiffContext *ctx, int index) {
  if (ctx->path_depth >= ctx->path_capacity) {
    ctx->path_capacity = ctx->path_capacity == 0 ? 8 : ctx->path_capacity * 2;
    int *new_path = realloc(ctx->node_path, sizeof(int) * ctx->path_capacity);
    if (!new_path) {
      console()->error(console(),
                       "FATAL: Failed to reallocate VDOM diff path.");
      exit(EXIT_FAILURE);
    }
    ctx->node_path = new_path;
  }
  ctx->node_path[ctx->path_depth++] = index;
}

static void path_pop(DiffContext *ctx) {
  if (ctx->path_depth > 0) {
    ctx->path_depth--;
  }
}

static void add_patch(DiffContext *ctx, PatchType type, Value *data) {
  Value *patch = object_value();
  patch->as.object_val->set(patch->as.object_val, "type", number(type));

  Value *path_array = array_value();
  for (int i = 0; i < ctx->path_depth; i++) {
    path_array->as.array_val->push(path_array->as.array_val,
                                   number(ctx->node_path[i]));
  }
  patch->as.object_val->set(patch->as.object_val, "path", path_array);

  if (data) {
    patch->as.object_val->set(patch->as.object_val, "data", data);
  }
  ctx->patches->as.array_val->push(ctx->patches->as.array_val, patch);
}

Value *webs_diff(VNode *old_vnode, VNode *new_vnode) {
  DiffContext ctx;
  ctx.patches = array_value();
  ctx.node_path = NULL;
  ctx.path_depth = 0;
  ctx.path_capacity = 0;

  diff_nodes(&ctx, old_vnode, new_vnode, 0);

  free(ctx.node_path);

  return ctx.patches;
}

static void diff_props(DiffContext *ctx, VNode *n1, VNode *n2) {
  Value *old_props = n1 ? n1->props : NULL;
  Value *new_props = n2->props;
  Value *patch_data = NULL;

  if (!old_props && !new_props)
    return;

  Map *old_map = old_props ? old_props->as.object_val->map : NULL;
  Map *new_map = new_props ? new_props->as.object_val->map : NULL;

  if (new_map) {
    for (size_t i = 0; i < new_map->capacity; i++) {
      for (MapEntry *entry = new_map->entries[i]; entry; entry = entry->next) {
        if (strcmp(entry->key, "key") == 0)
          continue;
        Value *old_val = old_map ? old_map->get(old_map, entry->key) : NULL;
        if (!old_val || !value_equals(old_val, entry->value)) {
          if (!patch_data)
            patch_data = object_value();
          patch_data->as.object_val->set(patch_data->as.object_val, entry->key,
                                         value_clone(entry->value));
        }
      }
    }
  }

  if (old_map) {
    for (size_t i = 0; i < old_map->capacity; i++) {
      for (MapEntry *entry = old_map->entries[i]; entry; entry = entry->next) {
        if (strcmp(entry->key, "key") == 0)
          continue;
        if (!new_map || !new_map->get(new_map, entry->key)) {
          if (!patch_data)
            patch_data = object_value();
          patch_data->as.object_val->set(patch_data->as.object_val, entry->key,
                                         null());
        }
      }
    }
  }

  if (patch_data) {
    add_patch(ctx, PATCH_UPDATE_PROPS, patch_data);
  }
}

static void diff_events(DiffContext *ctx, VNode *n1, VNode *n2) {
  Value *old_events = n1 ? n1->events : NULL;
  Value *new_events = n2 ? n2->events : NULL;
  Value *patch_data = NULL;

  if (!old_events && !new_events)
    return;

  Map *old_map = old_events ? old_events->as.object_val->map : NULL;
  Map *new_map = new_events ? new_events->as.object_val->map : NULL;

  if (new_map) {
    for (size_t i = 0; i < new_map->capacity; i++) {
      for (MapEntry *entry = new_map->entries[i]; entry; entry = entry->next) {
        Value *old_val = old_map ? old_map->get(old_map, entry->key) : NULL;
        if (!old_val || !value_equals(old_val, entry->value)) {
          if (!patch_data)
            patch_data = object_value();
          patch_data->as.object_val->set(patch_data->as.object_val, entry->key,
                                         value_clone(entry->value));
        }
      }
    }
  }

  if (old_map) {
    for (size_t i = 0; i < old_map->capacity; i++) {
      for (MapEntry *entry = old_map->entries[i]; entry; entry = entry->next) {
        if (!new_map || !new_map->get(new_map, entry->key)) {
          if (!patch_data)
            patch_data = object_value();
          patch_data->as.object_val->set(patch_data->as.object_val, entry->key,
                                         null());
        }
      }
    }
  }

  if (patch_data) {
    add_patch(ctx, PATCH_UPDATE_EVENTS, patch_data);
  }
}

static void diff_nodes(DiffContext *ctx, VNode *n1, VNode *n2, int index) {
  path_push(ctx, index);

  if (n1 == NULL) {
    if (n2 != NULL) {
      Value *vnode_val = vnode_to_value(n2);
      add_patch(ctx, PATCH_CREATE_NODE, vnode_val);
    }
    path_pop(ctx);
    return;
  }

  if (n2 == NULL) {
    add_patch(ctx, PATCH_REMOVE_NODE, NULL);
    path_pop(ctx);
    return;
  }

  bool same_type = strcmp(n1->type, n2->type) == 0;
  bool same_key = (!n1->key && !n2->key) ||
                  (n1->key && n2->key && value_equals(n1->key, n2->key));

  if (!same_type || !same_key) {
    Value *vnode_val = vnode_to_value(n2);
    add_patch(ctx, PATCH_REPLACE_NODE, vnode_val);
    path_pop(ctx);
    return;
  }

  if (n2->node_type == VNODE_TYPE_TEXT) {
    if (!value_equals(n1->children, n2->children)) {
      add_patch(ctx, PATCH_SET_TEXT, value_clone(n2->children));
    }
  } else {
    diff_props(ctx, n1, n2);
    diff_events(ctx, n1, n2);
    diff_children(ctx, n1, n2);
  }

  path_pop(ctx);
}

static bool has_key(Value *children) {
  if (!children || children->type != VALUE_ARRAY) {
    return false;
  }
  for (size_t i = 0; i < children->as.array_val->count; i++) {
    Value *child_wrapper = array_get(children->as.array_val, i);
    if (!child_wrapper || child_wrapper->type != VALUE_POINTER) {
      continue;
    }
    VNode *child = (VNode *)child_wrapper->as.pointer_val;
    if (child->key != NULL)
      return true;
  }
  return false;
}

static void diff_children(DiffContext *ctx, VNode *n1, VNode *n2) {
  Value *c1 = n1->children;
  Value *c2 = n2->children;

  if (has_key(c1) || has_key(c2)) {
    diff_keyed_children(ctx, c1, c2);
  } else {
    size_t old_len = c1 ? c1->as.array_val->count : 0;
    size_t new_len = c2 ? c2->as.array_val->count : 0;
    size_t common_len = old_len < new_len ? old_len : new_len;

    for (size_t i = 0; i < common_len; i++) {
      VNode *child1 = (VNode *)c1->as.array_val->elements[i]->as.pointer_val;
      VNode *child2 = (VNode *)c2->as.array_val->elements[i]->as.pointer_val;
      diff_nodes(ctx, child1, child2, i);
    }

    if (new_len > old_len) {
      for (size_t i = old_len; i < new_len; i++) {
        diff_nodes(ctx, NULL,
                   (VNode *)c2->as.array_val->elements[i]->as.pointer_val, i);
      }
    } else if (old_len > new_len) {
      for (size_t i = new_len; i < old_len; i++) {
        diff_nodes(ctx, (VNode *)c1->as.array_val->elements[i]->as.pointer_val,
                   NULL, i);
      }
    }
  }
}

static void diff_keyed_children(DiffContext *ctx, Value *c1_val,
                                Value *c2_val) {
  Value **c1 = c1_val ? c1_val->as.array_val->elements : NULL;
  size_t c1_len = c1_val ? c1_val->as.array_val->count : 0;

  Value **c2 = c2_val ? c2_val->as.array_val->elements : NULL;
  size_t c2_len = c2_val ? c2_val->as.array_val->count : 0;

  size_t i = 0;
  long e1 = c1_len > 0 ? c1_len - 1 : -1;
  long e2 = c2_len > 0 ? c2_len - 1 : -1;

  if (c1_len == 0 && c2_len > 0) {
    for (i = 0; i <= (size_t)e2; i++) {
      diff_nodes(ctx, NULL, (VNode *)c2[i]->as.pointer_val, i);
    }
    return;
  }
  if (c2_len == 0 && c1_len > 0) {
    for (i = 0; i <= (size_t)e1; i++) {
      diff_nodes(ctx, (VNode *)c1[i]->as.pointer_val, NULL, i);
    }
    return;
  }

  while (i <= (size_t)e1 && i <= (size_t)e2) {
    VNode *n1 = (VNode *)c1[i]->as.pointer_val;
    VNode *n2 = (VNode *)c2[i]->as.pointer_val;
    if (n1->key && n2->key && value_equals(n1->key, n2->key)) {
      diff_nodes(ctx, n1, n2, i);
    } else {
      break;
    }
    i++;
  }

  while (i <= (size_t)e1 && i <= (size_t)e2) {
    VNode *n1 = (VNode *)c1[e1]->as.pointer_val;
    VNode *n2 = (VNode *)c2[e2]->as.pointer_val;
    if (n1->key && n2->key && value_equals(n1->key, n2->key)) {
      diff_nodes(ctx, n1, n2, e2);
    } else {
      break;
    }
    e1--;
    e2--;
  }

  if ((long)i > e1) {
    if ((long)i <= e2) {
      for (size_t j = i; j <= (size_t)e2; j++) {
        diff_nodes(ctx, NULL, (VNode *)c2[j]->as.pointer_val, j);
      }
    }
  } else if ((long)i > e2) {
    for (size_t j = i; j <= (size_t)e1; j++) {
      diff_nodes(ctx, (VNode *)c1[j]->as.pointer_val, NULL, j);
    }
  } else {
    size_t s1 = i;
    size_t s2 = i;
    Map *key_to_index_map = map(e2 - s2 + 1);
    for (size_t j = s2; j <= (size_t)e2; j++) {
      VNode *next_child = (VNode *)c2[j]->as.pointer_val;
      if (next_child->key) {
        key_to_index_map->set(key_to_index_map,
                              next_child->key->as.string_val->chars, number(j));
      }
    }

    size_t patched = 0;
    size_t to_be_patched = e2 - s2 + 1;
    int *new_index_to_old_index_map = calloc(to_be_patched, sizeof(int));
    bool moved = false;
    size_t max_index_so_far = 0;

    for (size_t j = s1; j <= (size_t)e1; j++) {
      VNode *prev_child = (VNode *)c1[j]->as.pointer_val;
      if (patched >= to_be_patched) {
        diff_nodes(ctx, prev_child, NULL, j);
        continue;
      }
      Value *new_index_val = NULL;
      if (prev_child->key) {
        new_index_val = key_to_index_map->get(
            key_to_index_map, prev_child->key->as.string_val->chars);
      }
      if (new_index_val == NULL) {
        diff_nodes(ctx, prev_child, NULL, j);
      } else {
        size_t new_index = (size_t)new_index_val->as.number_val;
        if (new_index >= max_index_so_far) {
          max_index_so_far = new_index;
        } else {
          moved = true;
        }
        new_index_to_old_index_map[new_index - s2] = j + 1;
        VNode *next_child = (VNode *)c2[new_index]->as.pointer_val;
        diff_nodes(ctx, prev_child, next_child, new_index);
        patched++;
      }
    }

    map_free(key_to_index_map);

    int lis_len = 0;
    int *lis_indices =
        moved ? get_lis(new_index_to_old_index_map, to_be_patched, &lis_len)
              : NULL;

    Value *reorder_data = array_value();

    int lis_ptr = lis_len - 1;
    for (int k = to_be_patched - 1; k >= 0; k--) {
      size_t new_index = s2 + k;
      int old_index_map_val = new_index_to_old_index_map[k];

      if (old_index_map_val == 0) {
        diff_nodes(ctx, NULL, (VNode *)c2[new_index]->as.pointer_val,
                   new_index);
      } else if (moved) {
        if (lis_ptr < 0 || k != lis_indices[lis_ptr]) {
          Value *op = object_value();
          op->as.object_val->set(op->as.object_val, "type",
                                 string_value("move"));
          op->as.object_val->set(op->as.object_val, "from",
                                 number(old_index_map_val - 1));
          op->as.object_val->set(op->as.object_val, "to", number(new_index));
          reorder_data->as.array_val->push(reorder_data->as.array_val, op);
        } else {
          lis_ptr--;
        }
      }
    }

    if (reorder_data->as.array_val->count > 0) {
      add_patch(ctx, PATCH_REORDER_CHILDREN, reorder_data);
    } else {
      value_free(reorder_data);
    }

    free(new_index_to_old_index_map);
    if (lis_indices)
      free(lis_indices);
  }
}

static int *get_lis(int *arr, int n, int *lis_len) {
  if (n == 0) {
    *lis_len = 0;
    return NULL;
  }

  int *p = calloc(n, sizeof(int));
  int *m = calloc(n + 1, sizeof(int));
  if (!p || !m) {
    free(p);
    free(m);
    *lis_len = 0;
    return NULL;
  }

  int L = 0;
  for (int i = 0; i < n; i++) {
    if (arr[i] == 0)
      continue;

    int lo = 1;
    int hi = L;
    while (lo <= hi) {
      int mid = lo + (hi - lo) / 2;
      if (arr[m[mid]] < arr[i]) {
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    int newL = lo;
    p[i] = m[newL - 1];
    m[newL] = i;

    if (newL > L) {
      L = newL;
    }
  }

  *lis_len = L;
  if (L == 0) {
    free(p);
    free(m);
    return NULL;
  }

  int *result = malloc(L * sizeof(int));
  if (!result) {
    free(p);
    free(m);
    *lis_len = 0;
    return NULL;
  }

  int k = m[L];
  for (int i = L - 1; i >= 0; i--) {
    result[i] = k;
    k = p[k];
  }

  free(p);
  free(m);
  return result;
}
