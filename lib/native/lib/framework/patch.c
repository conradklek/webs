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
  if (ctx->status != OK) {
    if (data)
      W->freeValue(data);
    return;
  }
  Value *patch = W->object();
  W->objectSet(patch, "type", W->number(type));
  Value *path_array = W->array();
  for (int i = 0; i < ctx->path_depth; i++) {
    W->arrayPush(path_array, W->number(ctx->node_path[i]));
  }
  W->objectSet(patch, "path", path_array);
  if (data) {
    W->objectSet(patch, "data", data);
  }
  W->arrayPush(ctx->patches, patch);
}

Value *webs_diff(VNode *old_vnode, VNode *new_vnode) {
  DiffContext ctx;
  ctx.patches = W->array();
  ctx.node_path = NULL;
  ctx.path_depth = 0;
  ctx.path_capacity = 0;
  ctx.status = OK;
  diff_nodes(&ctx, old_vnode, new_vnode, 0);
  free(ctx.node_path);
  if (ctx.status != OK) {
    W->log->error("Diffing failed due to memory error.");
  }
  return ctx.patches;
}

static void diff_props(DiffContext *ctx, VNode *n1, VNode *n2) {
  if (ctx->status != OK)
    return;
  Value *old_props = n1 ? n1->props : NULL;
  Value *new_props = n2->props;
  Value *patch_data = NULL;
  if (!old_props && !new_props)
    return;

  Value *new_keys = W->objectKeys(new_props);
  if (new_keys) {
    for (size_t i = 0; i < W->arrayCount(new_keys); i++) {
      Value *key_val = W->arrayGetRef(new_keys, i);
      const char *key = W->valueAsString(key_val);
      if (W->stringCompare(key, "key") == 0)
        continue;
      Value *new_val = W->objectGetRef(new_props, key);
      Value *old_val = old_props ? W->objectGetRef(old_props, key) : NULL;
      if (!old_val || !W->valueEquals(old_val, new_val)) {
        if (!patch_data)
          patch_data = W->object();
        W->objectSet(patch_data, key, W->valueClone(new_val));
      }
    }
    W->freeValue(new_keys);
  }

  Value *old_keys = W->objectKeys(old_props);
  if (old_keys) {
    for (size_t i = 0; i < W->arrayCount(old_keys); i++) {
      Value *key_val = W->arrayGetRef(old_keys, i);
      const char *key = W->valueAsString(key_val);
      if (W->stringCompare(key, "key") == 0)
        continue;
      if (!new_props || !W->objectGetRef(new_props, key)) {
        if (!patch_data)
          patch_data = W->object();
        W->objectSet(patch_data, key, W->null());
      }
    }
    W->freeValue(old_keys);
  }

  if (patch_data) {
    add_patch(ctx, PATCH_UPDATE_PROPS, patch_data);
  }
}

static void diff_events(DiffContext *ctx, VNode *n1, VNode *n2) {
  if (ctx->status != OK)
    return;
  Value *old_events = n1 ? n1->events : NULL;
  Value *new_events = n2 ? n2->events : NULL;
  Value *patch_data = NULL;
  if (!old_events && !new_events)
    return;

  Value *new_keys = W->objectKeys(new_events);
  if (new_keys) {
    for (size_t i = 0; i < W->arrayCount(new_keys); i++) {
      Value *key_val = W->arrayGetRef(new_keys, i);
      const char *key = W->valueAsString(key_val);
      Value *new_val = W->objectGetRef(new_events, key);
      Value *old_val = old_events ? W->objectGetRef(old_events, key) : NULL;
      if (!old_val || !W->valueEquals(old_val, new_val)) {
        if (!patch_data)
          patch_data = W->object();
        W->objectSet(patch_data, key, W->valueClone(new_val));
      }
    }
    W->freeValue(new_keys);
  }

  Value *old_keys = W->objectKeys(old_events);
  if (old_keys) {
    for (size_t i = 0; i < W->arrayCount(old_keys); i++) {
      Value *key_val = W->arrayGetRef(old_keys, i);
      const char *key = W->valueAsString(key_val);
      if (!new_events || !W->objectGetRef(new_events, key)) {
        if (!patch_data)
          patch_data = W->object();
        W->objectSet(patch_data, key, W->null());
      }
    }
    W->freeValue(old_keys);
  }

  if (patch_data) {
    add_patch(ctx, PATCH_UPDATE_EVENTS, patch_data);
  }
}

static void diff_nodes(DiffContext *ctx, VNode *n1, VNode *n2, int index) {
  path_push(ctx, index);
  if (ctx->status != OK) {
    path_pop(ctx);
    return;
  }

  if (n1 == NULL) {
    if (n2 != NULL)
      add_patch(ctx, PATCH_CREATE_NODE, W->vnodeToValue(n2));
    path_pop(ctx);
    return;
  }
  if (n2 == NULL) {
    add_patch(ctx, PATCH_REMOVE_NODE, NULL);
    path_pop(ctx);
    return;
  }

  bool same_type = W->stringCompare(n1->type, n2->type) == 0;

  if (!same_type) {
    add_patch(ctx, PATCH_REPLACE_NODE, W->vnodeToValue(n2));
    path_pop(ctx);
    return;
  }

  if (n2->node_type == VNODE_TYPE_TEXT) {
    if (!W->valueEquals(n1->children, n2->children)) {
      add_patch(ctx, PATCH_SET_TEXT, W->valueClone(n2->children));
    }
  } else {
    diff_props(ctx, n1, n2);
    diff_events(ctx, n1, n2);
    diff_children(ctx, n1, n2);
  }
  path_pop(ctx);
}

static bool has_key(Value *children) {
  if (!children || W->valueGetType(children) != VALUE_ARRAY)
    return false;
  for (size_t i = 0; i < W->arrayCount(children); i++) {
    Value *child_wrapper = W->arrayGetRef(children, i);
    if (!child_wrapper || W->valueGetType(child_wrapper) != VALUE_POINTER)
      continue;
    VNode *child = (VNode *)child_wrapper->as.pointer;
    if (child->key != NULL)
      return true;
  }
  return false;
}

static void diff_children(DiffContext *ctx, VNode *n1, VNode *n2) {
  if (ctx->status != OK)
    return;
  Value *c1 = n1->children;
  Value *c2 = n2->children;

  if (has_key(c1) || has_key(c2)) {
    diff_keyed_children(ctx, c1, c2);
  } else {
    size_t old_len = c1 ? W->arrayCount(c1) : 0;
    size_t new_len = c2 ? W->arrayCount(c2) : 0;
    size_t common_len = old_len < new_len ? old_len : new_len;
    for (size_t i = 0; i < common_len; i++) {
      diff_nodes(ctx, (VNode *)W->arrayGetRef(c1, i)->as.pointer,
                 (VNode *)W->arrayGetRef(c2, i)->as.pointer, i);
    }
    if (new_len > old_len) {
      for (size_t i = old_len; i < new_len; i++) {
        diff_nodes(ctx, NULL, (VNode *)W->arrayGetRef(c2, i)->as.pointer, i);
      }
    } else if (old_len > new_len) {
      for (size_t i = new_len; i < old_len; i++) {
        diff_nodes(ctx, (VNode *)W->arrayGetRef(c1, i)->as.pointer, NULL, i);
      }
    }
  }
}

static void diff_keyed_children(DiffContext *ctx, Value *c1_val,
                                Value *c2_val) {
  if (ctx->status != OK)
    return;

  size_t c1_len = c1_val ? W->arrayCount(c1_val) : 0;
  size_t c2_len = c2_val ? W->arrayCount(c2_val) : 0;

  Value *key_to_old_idx = W->object();
  for (size_t i = 0; i < c1_len; i++) {
    VNode *child = (VNode *)W->arrayGetRef(c1_val, i)->as.pointer;
    if (child->key) {
      W->objectSet(key_to_old_idx, W->valueAsString(child->key), W->number(i));
    }
  }

  for (size_t i = 0; i < c2_len; i++) {
    VNode *new_child = (VNode *)W->arrayGetRef(c2_val, i)->as.pointer;
    VNode *old_child = NULL;
    Value *old_idx_val =
        new_child->key
            ? W->objectGetRef(key_to_old_idx, W->valueAsString(new_child->key))
            : NULL;

    if (old_idx_val) {
      old_child =
          (VNode *)W->arrayGetRef(c1_val, (size_t)W->valueAsNumber(old_idx_val))
              ->as.pointer;
      diff_nodes(ctx, old_child, new_child, i);
    } else {
      diff_nodes(ctx, NULL, new_child, i);
    }
  }

  Value *reorder_op = W->object();
  W->objectSet(reorder_op, "type", W->string("reorder"));
  add_patch(ctx, PATCH_REORDER_CHILDREN, reorder_op);

  W->freeValue(key_to_old_idx);
}
