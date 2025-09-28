#include "component.h"
#include "../core/map.h"
#include "../core/object.h"
#include "../webs_api.h"
#include "reactivity.h"
#include <stdlib.h>
#include <string.h>

static int instance_id_counter = 0;

ComponentInstance *component(Engine *engine, VNode *vnode,
                             ComponentInstance *parent) {
  if (!engine || !vnode) {
    return NULL;
  }

  ComponentInstance *instance = calloc(1, sizeof(ComponentInstance));
  if (!instance)
    return NULL;

  instance->uid = instance_id_counter++;
  instance->vnode = vnode;
  instance->parent = parent;
  instance->is_mounted = false;

  if (!engine->components) {
    free(instance);
    return NULL;
  }
  instance->type = engine->components->get(engine->components, vnode->type);
  if (!instance->type) {
    webs()->log->error("Component '%s' is not registered.", vnode->type);
    free(instance);
    return NULL;
  }

  Value *vnode_props = vnode->props;
  Value *props_options =
      instance->type->as.object->get(instance->type->as.object, "props");

  Value *resolved_props = object_value();
  instance->attrs = object_value();

  if (vnode_props && vnode_props->type == VALUE_OBJECT) {
    Map *table = vnode_props->as.object->map;
    for (size_t i = 0; i < table->capacity; ++i) {
      for (MapEntry *entry = table->entries[i]; entry; entry = entry->next) {
        bool is_prop =
            props_options &&
            props_options->as.object->get(props_options->as.object, entry->key);
        if (is_prop) {
          resolved_props->as.object->set(resolved_props->as.object, entry->key,
                                         value_clone(entry->value));
        } else {
          instance->attrs->as.object->set(instance->attrs->as.object,
                                          entry->key,
                                          value_clone(entry->value));
        }
      }
    }
  }

  if (props_options && props_options->type == VALUE_OBJECT) {
    Map *table = props_options->as.object->map;
    for (size_t i = 0; i < table->capacity; ++i) {
      for (MapEntry *entry = table->entries[i]; entry; entry = entry->next) {
        if (!resolved_props->as.object->get(resolved_props->as.object,
                                            entry->key)) {
          Value *prop_def = entry->value;
          Value *default_val =
              prop_def->as.object->get(prop_def->as.object, "default");
          if (default_val) {
            resolved_props->as.object->set(resolved_props->as.object,
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
  Map *props_table = instance->props->as.object->map;
  for (size_t i = 0; i < props_table->capacity; ++i) {
    for (MapEntry *entry = props_table->entries[i]; entry;
         entry = entry->next) {
      instance->ctx->as.object->set(instance->ctx->as.object, entry->key,
                                    value_clone(entry->value));
    }
  }

  instance->on_mount = NULL;
  instance->on_before_unmount = NULL;

  Value *on_mount_fn =
      instance->type->as.object->get(instance->type->as.object, "onMount");
  if (on_mount_fn) {
    instance->on_mount = value_clone(on_mount_fn);
  }
  Value *on_before_unmount_fn = instance->type->as.object->get(
      instance->type->as.object, "onBeforeUnmount");
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
