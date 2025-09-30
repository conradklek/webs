/**
 * @file component.c
 * @brief Implements the component instance lifecycle.
 */
#include "component.h"
#include "../webs_api.h"
#include "renderer.h"
#include <stdio.h>
#include <stdlib.h>

static int next_uid = 0;

static void update_component(void *user_data) {
  ComponentInstance *instance = (ComponentInstance *)user_data;

  Value *template_val = W->objectGetRef(instance->type, "template");
  if (!template_val || W->valueGetType(template_val) != VALUE_STRING) {
    return;
  }

  Status template_status;
  Value *template_ast =
      W->parseTemplate(W->valueAsString(template_val), &template_status);
  if (template_status != OK || !template_ast) {
    if (template_ast)
      W->freeValue(template_ast);
    return;
  }

  VNode *new_sub_tree = render_template(template_ast, instance->ctx);
  W->freeValue(template_ast);

  if (instance->sub_tree) {
    W->freeVNode(instance->sub_tree);
  }
  instance->sub_tree = new_sub_tree;
}

ComponentInstance *component(Engine *engine, VNode *vnode,
                             ComponentInstance *parent) {
  ComponentInstance *instance = calloc(1, sizeof(ComponentInstance));
  if (!instance)
    return NULL;

  instance->uid = next_uid++;
  instance->vnode = vnode;
  instance->parent = parent;

  Value *component_def =
      engine->components->get(engine->components, vnode->type);
  if (!component_def) {
    free(instance);
    return NULL;
  }
  instance->type = W->valueClone(component_def);
  instance->props = W->valueClone(vnode->props);

  // Initialize new fields
  instance->slots = W->object();
  instance->provides = W->object();
  instance->attrs = W->object();
  instance->on_mount_hooks = W->array();
  instance->on_unmount_hooks = W->array();

  Value *internal_ctx = NULL;

  // --- Setup function logic ---
  Value *setup_fn_val = W->objectGetRef(instance->type, "setup");
  if (setup_fn_val && W->valueGetType(setup_fn_val) == VALUE_POINTER) {
    typedef Value *(*SetupFunc)(Value *props, Value *context);
    SetupFunc setup = (SetupFunc)setup_fn_val->as.pointer;

    Value *setup_context =
        W->objectOf("attrs", W->valueClone(instance->attrs), "slots",
                    W->valueClone(instance->slots), NULL);

    engine->current_instance = instance;
    internal_ctx = setup(instance->props, setup_context);
    engine->current_instance = NULL;

    W->freeValue(setup_context);
  }

  // Create the final reactive render context
  Value *render_ctx = W->object();

  // 1. Add state from setup()
  if (internal_ctx && W->valueGetType(internal_ctx) == VALUE_OBJECT) {
    Value *setup_keys = W->objectKeys(internal_ctx);
    if (setup_keys) {
      for (size_t i = 0; i < W->arrayCount(setup_keys); i++) {
        Value *key_val = W->arrayGetRef(setup_keys, i);
        const char *key = W->valueAsString(key_val);
        Value *val = W->objectGetRef(internal_ctx, key);
        W->objectSet(render_ctx, key, W->valueClone(val));
      }
      W->freeValue(setup_keys);
    }
  }
  if (internal_ctx) {
    W->freeValue(internal_ctx);
  }

  // 2. Add props (props have priority over setup state if names collide)
  Value *prop_keys = W->objectKeys(instance->props);
  if (prop_keys) {
    for (size_t i = 0; i < W->arrayCount(prop_keys); i++) {
      Value *key_val = W->arrayGetRef(prop_keys, i);
      const char *key = W->valueAsString(key_val);
      Value *val = W->objectGetRef(instance->props, key);
      W->objectSet(render_ctx, key, W->valueClone(val));
    }
    W->freeValue(prop_keys);
  }

  // Make the final context reactive
  instance->ctx = render_ctx; // No longer reactive for SSR

  instance->effect = effect(update_component, instance);

  effect_run(engine, instance->effect);

  return instance;
}

void component_destroy(ComponentInstance *instance) {
  if (!instance)
    return;

  effect_stop(instance->effect);
  effect_free(instance->effect);

  W->freeVNode(instance->sub_tree);
  W->freeValue(instance->type);
  W->freeValue(instance->props);
  W->freeValue(instance->ctx);

  // --- Free new fields ---
  W->freeValue(instance->slots);
  W->freeValue(instance->provides);
  W->freeValue(instance->attrs);
  W->freeValue(instance->on_mount_hooks);
  W->freeValue(instance->on_unmount_hooks);

  free(instance);
}
