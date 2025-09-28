#include "patch.h"
#include "../webs_api.h"
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
  Status status;
} DiffContext;

static void diff_nodes(DiffContext *ctx, VNode *n1, VNode *n2, int index);
static void diff_children(DiffContext *ctx, VNode *n1, VNode *n2);
static void diff_keyed_children(DiffContext *ctx, Value *c1_val, Value *c2_val);
static void diff_events(DiffContext *ctx, VNode *n1, VNode *n2);
static int *get_lis(int *arr, int n, int *lis_len);

static void path_push(DiffContext *ctx, int index) {
  if (ctx->status != OK)
    return;

  if (ctx->path_depth >= ctx->path_capacity) {
    ctx->path_capacity = ctx->path_capacity == 0 ? 8 : ctx->path_capacity * 2;
    int *new_path = realloc(ctx->node_path, sizeof(int) * ctx->path_capacity);
    if (!new_path) {
      webs()->log->error("FATAL: Failed to reallocate VDOM diff path.");
      ctx->status = ERROR_MEMORY;
      return;
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
  const WebsApi *w = webs();
  if (ctx->status != OK) {
    if (data)
      w->freeValue(data);
    return;
  }

  Value *patch = w->object();
  w->objectSet(patch, "type", w->number(type));

  Value *path_array = w->array();
  for (int i = 0; i < ctx->path_depth; i++) {
    w->arrayPush(path_array, w->number(ctx->node_path[i]));
  }
  w->objectSet(patch, "path", path_array);

  if (data) {
    w->objectSet(patch, "data", data);
  }
  w->arrayPush(ctx->patches, patch);
}

Value *webs_diff(VNode *old_vnode, VNode *new_vnode) {
  const WebsApi *w = webs();
  DiffContext ctx;
  ctx.patches = w->array();
  ctx.node_path = NULL;
  ctx.path_depth = 0;
  ctx.path_capacity = 0;
  ctx.status = OK;

  diff_nodes(&ctx, old_vnode, new_vnode, 0);

  free(ctx.node_path);

  if (ctx.status != OK) {
    w->log->error("Diffing failed due to memory error.");
  }

  return ctx.patches;
}

static void diff_props(DiffContext *ctx, VNode *n1, VNode *n2) {
  const WebsApi *w = webs();
  if (ctx->status != OK)
    return;

  Value *old_props = n1 ? n1->props : NULL;
  Value *new_props = n2->props;
  Value *patch_data = NULL;

  if (!old_props && !new_props)
    return;

  Value *new_keys = w->objectKeys(new_props);
  if (new_keys) {
    for (size_t i = 0; i < w->arrayCount(new_keys); i++) {
      Value *key_val = w->arrayGet(new_keys, i);
      const char *key = w->valueAsString(key_val);
      if (strcmp(key, "key") == 0)
        continue;
      Value *new_val = w->objectGet(new_props, key);
      Value *old_val = old_props ? w->objectGet(old_props, key) : NULL;
      if (!old_val || !w->valueEquals(old_val, new_val)) {
        if (!patch_data)
          patch_data = w->object();
        w->objectSet(patch_data, key, w->valueClone(new_val));
      }
    }
    w->freeValue(new_keys);
  }

  Value *old_keys = w->objectKeys(old_props);
  if (old_keys) {
    for (size_t i = 0; i < w->arrayCount(old_keys); i++) {
      Value *key_val = w->arrayGet(old_keys, i);
      const char *key = w->valueAsString(key_val);
      if (strcmp(key, "key") == 0)
        continue;
      if (!new_props || !w->objectGet(new_props, key)) {
        if (!patch_data)
          patch_data = w->object();
        w->objectSet(patch_data, key, w->null());
      }
    }
    w->freeValue(old_keys);
  }

  if (patch_data) {
    add_patch(ctx, PATCH_UPDATE_PROPS, patch_data);
  }
}

static void diff_events(DiffContext *ctx, VNode *n1, VNode *n2) {
  const WebsApi *w = webs();
  if (ctx->status != OK)
    return;

  Value *old_events = n1 ? n1->events : NULL;
  Value *new_events = n2 ? n2->events : NULL;
  Value *patch_data = NULL;

  if (!old_events && !new_events)
    return;

  Value *new_keys = w->objectKeys(new_events);
  if (new_keys) {
    for (size_t i = 0; i < w->arrayCount(new_keys); i++) {
      Value *key_val = w->arrayGet(new_keys, i);
      const char *key = w->valueAsString(key_val);
      Value *new_val = w->objectGet(new_events, key);
      Value *old_val = old_events ? w->objectGet(old_events, key) : NULL;
      if (!old_val || !w->valueEquals(old_val, new_val)) {
        if (!patch_data)
          patch_data = w->object();
        w->objectSet(patch_data, key, w->valueClone(new_val));
      }
    }
    w->freeValue(new_keys);
  }

  Value *old_keys = w->objectKeys(old_events);
  if (old_keys) {
    for (size_t i = 0; i < w->arrayCount(old_keys); i++) {
      Value *key_val = w->arrayGet(old_keys, i);
      const char *key = w->valueAsString(key_val);
      if (!new_events || !w->objectGet(new_events, key)) {
        if (!patch_data)
          patch_data = w->object();
        w->objectSet(patch_data, key, w->null());
      }
    }
    w->freeValue(old_keys);
  }

  if (patch_data) {
    add_patch(ctx, PATCH_UPDATE_EVENTS, patch_data);
  }
}

static void diff_nodes(DiffContext *ctx, VNode *n1, VNode *n2, int index) {
  const WebsApi *w = webs();
  path_push(ctx, index);
  if (ctx->status != OK) {
    path_pop(ctx);
    return;
  }

  if (n1 == NULL) {
    if (n2 != NULL) {
      Value *vnode_val = w->vnodeToValue(n2);
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
                  (n1->key && n2->key && w->valueEquals(n1->key, n2->key));

  if (!same_type || !same_key) {
    Value *vnode_val = w->vnodeToValue(n2);
    add_patch(ctx, PATCH_REPLACE_NODE, vnode_val);
    path_pop(ctx);
    return;
  }

  if (n2->node_type == VNODE_TYPE_TEXT) {
    if (!w->valueEquals(n1->children, n2->children)) {
      add_patch(ctx, PATCH_SET_TEXT, w->valueClone(n2->children));
    }
  } else {
    diff_props(ctx, n1, n2);
    diff_events(ctx, n1, n2);
    diff_children(ctx, n1, n2);
  }

  path_pop(ctx);
}

static bool has_key(Value *children) {
  const WebsApi *w = webs();
  if (!children || w->valueGetType(children) != VALUE_ARRAY) {
    return false;
  }
  for (size_t i = 0; i < w->arrayCount(children); i++) {
    Value *child_wrapper = w->arrayGet(children, i);
    if (!child_wrapper || w->valueGetType(child_wrapper) != VALUE_POINTER) {
      continue;
    }
    VNode *child = (VNode *)child_wrapper->as.pointer;
    if (child->key != NULL)
      return true;
  }
  return false;
}

static void diff_children(DiffContext *ctx, VNode *n1, VNode *n2) {
  const WebsApi *w = webs();
  if (ctx->status != OK)
    return;

  Value *c1 = n1->children;
  Value *c2 = n2->children;

  if (has_key(c1) || has_key(c2)) {
    diff_keyed_children(ctx, c1, c2);
  } else {
    size_t old_len = c1 ? w->arrayCount(c1) : 0;
    size_t new_len = c2 ? w->arrayCount(c2) : 0;
    size_t common_len = old_len < new_len ? old_len : new_len;

    for (size_t i = 0; i < common_len; i++) {
      VNode *child1 = (VNode *)w->arrayGet(c1, i)->as.pointer;
      VNode *child2 = (VNode *)w->arrayGet(c2, i)->as.pointer;
      diff_nodes(ctx, child1, child2, i);
    }

    if (new_len > old_len) {
      for (size_t i = old_len; i < new_len; i++) {
        diff_nodes(ctx, NULL, (VNode *)w->arrayGet(c2, i)->as.pointer, i);
      }
    } else if (old_len > new_len) {
      for (size_t i = new_len; i < old_len; i++) {
        diff_nodes(ctx, (VNode *)w->arrayGet(c1, i)->as.pointer, NULL, i);
      }
    }
  }
}

static void diff_keyed_children(DiffContext *ctx, Value *c1_val,
                                Value *c2_val) {
  const WebsApi *w = webs();
  if (ctx->status != OK)
    return;

  size_t c1_len = c1_val ? w->arrayCount(c1_val) : 0;
  size_t c2_len = c2_val ? w->arrayCount(c2_val) : 0;

  size_t i = 0;
  long e1 = c1_len > 0 ? c1_len - 1 : -1;
  long e2 = c2_len > 0 ? c2_len - 1 : -1;

  if (c1_len == 0 && c2_len > 0) {
    for (i = 0; i <= (size_t)e2; i++) {
      diff_nodes(ctx, NULL, (VNode *)w->arrayGet(c2_val, i)->as.pointer, i);
    }
    return;
  }
  if (c2_len == 0 && c1_len > 0) {
    for (i = 0; i <= (size_t)e1; i++) {
      diff_nodes(ctx, (VNode *)w->arrayGet(c1_val, i)->as.pointer, NULL, i);
    }
    return;
  }

  while (i <= (size_t)e1 && i <= (size_t)e2) {
    VNode *n1 = (VNode *)w->arrayGet(c1_val, i)->as.pointer;
    VNode *n2 = (VNode *)w->arrayGet(c2_val, i)->as.pointer;
    if (n1->key && n2->key && w->valueEquals(n1->key, n2->key)) {
      diff_nodes(ctx, n1, n2, i);
    } else {
      break;
    }
    i++;
  }

  while (i <= (size_t)e1 && i <= (size_t)e2) {
    VNode *n1 = (VNode *)w->arrayGet(c1_val, e1)->as.pointer;
    VNode *n2 = (VNode *)w->arrayGet(c2_val, e2)->as.pointer;
    if (n1->key && n2->key && w->valueEquals(n1->key, n2->key)) {
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
        diff_nodes(ctx, NULL, (VNode *)w->arrayGet(c2_val, j)->as.pointer, j);
      }
    }
  } else if ((long)i > e2) {
    for (size_t j = i; j <= (size_t)e1; j++) {
      diff_nodes(ctx, (VNode *)w->arrayGet(c1_val, j)->as.pointer, NULL, j);
    }
  } else {
    size_t s1 = i;
    size_t s2 = i;
    Value *key_to_index_map = w->object();
    for (size_t j = s2; j <= (size_t)e2; j++) {
      VNode *next_child = (VNode *)w->arrayGet(c2_val, j)->as.pointer;
      if (next_child->key) {
        w->objectSet(key_to_index_map, w->valueAsString(next_child->key),
                     w->number(j));
      }
    }

    size_t patched = 0;
    size_t to_be_patched = e2 - s2 + 1;
    int *new_index_to_old_index_map = calloc(to_be_patched, sizeof(int));
    bool moved = false;
    size_t max_index_so_far = 0;

    for (size_t j = s1; j <= (size_t)e1; j++) {
      VNode *prev_child = (VNode *)w->arrayGet(c1_val, j)->as.pointer;
      if (patched >= to_be_patched) {
        diff_nodes(ctx, prev_child, NULL, j);
        continue;
      }
      Value *new_index_val = NULL;
      if (prev_child->key) {
        new_index_val =
            w->objectGet(key_to_index_map, w->valueAsString(prev_child->key));
      }
      if (new_index_val == NULL) {
        diff_nodes(ctx, prev_child, NULL, j);
      } else {
        size_t new_index = (size_t)w->valueAsNumber(new_index_val);
        if (new_index >= max_index_so_far) {
          max_index_so_far = new_index;
        } else {
          moved = true;
        }
        new_index_to_old_index_map[new_index - s2] = j + 1;
        VNode *next_child = (VNode *)w->arrayGet(c2_val, new_index)->as.pointer;
        diff_nodes(ctx, prev_child, next_child, new_index);
        patched++;
      }
    }

    w->freeValue(key_to_index_map);

    int lis_len = 0;
    int *lis_indices =
        moved ? get_lis(new_index_to_old_index_map, to_be_patched, &lis_len)
              : NULL;

    Value *reorder_data = w->array();

    int lis_ptr = lis_len - 1;
    for (int k = to_be_patched - 1; k >= 0; k--) {
      size_t new_index = s2 + k;
      int old_index_map_val = new_index_to_old_index_map[k];

      if (old_index_map_val == 0) {
        diff_nodes(ctx, NULL,
                   (VNode *)w->arrayGet(c2_val, new_index)->as.pointer,
                   new_index);
      } else if (moved) {
        if (lis_ptr < 0 || k != lis_indices[lis_ptr]) {
          Value *op = w->object();
          w->objectSet(op, "type", w->string("move"));
          w->objectSet(op, "from", w->number(old_index_map_val - 1));
          w->objectSet(op, "to", w->number(new_index));
          w->arrayPush(reorder_data, op);
        } else {
          lis_ptr--;
        }
      }
    }

    if (w->arrayCount(reorder_data) > 0) {
      add_patch(ctx, PATCH_REORDER_CHILDREN, reorder_data);
    } else {
      w->freeValue(reorder_data);
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
