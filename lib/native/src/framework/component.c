#include "component.h"
#include "../core/map.h"
#include "../core/object.h"
#include "reactivity.h"
#include <stdlib.h>
#include <string.h>

static int instance_id_counter = 0;

ComponentInstance *component(Engine *engine, VNode *vnode,
                             ComponentInstance *parent) {
  ComponentInstance *instance = calloc(1, sizeof(ComponentInstance));
  if (!instance)
    return NULL;

  instance->uid = instance_id_counter++;
  instance->vnode = vnode;
  instance->parent = parent;
  instance->is_mounted = false;

  instance->type = engine->components->get(engine->components, vnode->type);
  if (!instance->type) {
    engine->console->error(engine->console, "Component '%s' is not registered.",
                           vnode->type);
    free(instance);
    return NULL;
  }

  Value *vnode_props = vnode->props;
  Value *props_options = instance->type->as.object_val->get(
      instance->type->as.object_val, "props");

  Value *resolved_props = object_value();
  instance->attrs = object_value();

  if (vnode_props && vnode_props->type == VALUE_OBJECT) {
    Map *table = vnode_props->as.object_val->map;
    for (size_t i = 0; i < table->capacity; ++i) {
      for (MapEntry *entry = table->entries[i]; entry; entry = entry->next) {
        bool is_prop =
            props_options && props_options->as.object_val->get(
                                 props_options->as.object_val, entry->key);
        if (is_prop) {
          resolved_props->as.object_val->set(resolved_props->as.object_val,
                                             entry->key,
                                             value_clone(entry->value));
        } else {
          instance->attrs->as.object_val->set(instance->attrs->as.object_val,
                                              entry->key,
                                              value_clone(entry->value));
        }
      }
    }
  }

  if (props_options && props_options->type == VALUE_OBJECT) {
    Map *table = props_options->as.object_val->map;
    for (size_t i = 0; i < table->capacity; ++i) {
      for (MapEntry *entry = table->entries[i]; entry; entry = entry->next) {
        if (!resolved_props->as.object_val->get(resolved_props->as.object_val,
                                                entry->key)) {
          Value *prop_def = entry->value;
          Value *default_val =
              prop_def->as.object_val->get(prop_def->as.object_val, "default");
          if (default_val) {
            resolved_props->as.object_val->set(resolved_props->as.object_val,
                                               entry->key,
                                               value_clone(default_val));
          }
        }
      }
    }
  }

  instance->internal_ctx = object_value();
  instance->props = resolved_props;

  instance->ctx = object_value();
  Map *props_table = instance->props->as.object_val->map;
  for (size_t i = 0; i < props_table->capacity; ++i) {
    for (MapEntry *entry = props_table->entries[i]; entry;
         entry = entry->next) {
      instance->ctx->as.object_val->set(instance->ctx->as.object_val,
                                        entry->key, value_clone(entry->value));
    }
  }

  instance->on_mount = NULL;
  instance->on_before_unmount = NULL;

  Value *on_mount_fn = instance->type->as.object_val->get(
      instance->type->as.object_val, "onMount");
  if (on_mount_fn) {
    instance->on_mount = value_clone(on_mount_fn);
  }
  Value *on_before_unmount_fn = instance->type->as.object_val->get(
      instance->type->as.object_val, "onBeforeUnmount");
  if (on_before_unmount_fn) {
    instance->on_before_unmount = value_clone(on_before_unmount_fn);
  }

  return instance;
}

void component_destroy(ComponentInstance *instance) {
  if (!instance)
    return;

  value_free(instance->props);
  value_free(instance->attrs);
  value_free(instance->ctx);
  value_free(instance->internal_ctx);
  value_free(instance->on_mount);
  value_free(instance->on_before_unmount);
  vnode_free(instance->sub_tree);
  free(instance);
}
