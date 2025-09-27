#include "engine.h"
#include "../core/console.h"
#include "../core/value.h"
#include "reactivity.h"
#include "scheduler.h"
#include <stdlib.h>

Engine *engine() {
  Engine *engine = calloc(1, sizeof(Engine));
  if (!engine)
    return NULL;

  engine->console = console();
  if (!engine->console) {
    free(engine);
    return NULL;
  }

  engine->target_map = map(8);
  if (!engine->target_map) {
    console_destroy(engine->console);
    free(engine);
    return NULL;
  }

  engine->components = map(8);
  if (!engine->components) {
    map_free(engine->target_map);
    console_destroy(engine->console);
    free(engine);
    return NULL;
  }

  engine->scheduler = scheduler();
  if (!engine->scheduler) {
    map_free(engine->components);
    map_free(engine->target_map);
    console_destroy(engine->console);
    free(engine);
    return NULL;
  }

  engine->console->info(engine->console, "Engine created successfully.");
  return engine;
}

void engine_register_component(Engine *engine, const char *name,
                               const Value *definition) {
  if (!engine || !name || !definition)
    return;
  engine->components->set(engine->components, name, value_clone(definition));
  engine->console->debug(engine->console, "Registered component: %s", name);
}

static void free_target_map(Map *target_map) {
  if (!target_map)
    return;

  for (size_t i = 0; i < target_map->capacity; i++) {
    for (MapEntry *target_entry = target_map->entries[i]; target_entry;
         target_entry = target_entry->next) {
      Value *deps_map_wrapper = target_entry->value;
      if (deps_map_wrapper && deps_map_wrapper->type == VALUE_POINTER) {
        Map *deps_map = (Map *)deps_map_wrapper->as.pointer_val;

        for (size_t j = 0; j < deps_map->capacity; j++) {
          for (MapEntry *dep_entry = deps_map->entries[j]; dep_entry;
               dep_entry = dep_entry->next) {
            Value *dep_list_wrapper = dep_entry->value;
            if (dep_list_wrapper && dep_list_wrapper->type == VALUE_POINTER) {
              free(dep_list_wrapper->as.pointer_val);
            }
          }
        }
        map_free(deps_map);
      }
    }
  }
  map_free(target_map);
}

void engine_destroy(Engine *engine) {
  if (!engine)
    return;

  engine->console->info(engine->console, "Destroying Engine.");

  free_target_map(engine->target_map);

  map_free(engine->components);
  free(engine->effect_stack);
  scheduler_destroy(engine->scheduler);

  console_destroy(engine->console);
  free(engine);
}
