/**
 * @file engine.c
 * @brief Implements the main framework engine.
 */
#include "engine.h"
#include "../webs_api.h"
#include "reactivity.h"
#include "scheduler.h"
#include <stdlib.h>

Engine *engine() {
  Engine *engine = calloc(1, sizeof(Engine));
  if (!engine)
    return NULL;

  engine->target_map = map(8);
  if (!engine->target_map) {
    free(engine);
    return NULL;
  }

  engine->components = map(8);
  if (!engine->components) {
    map_free(engine->target_map);
    free(engine);
    return NULL;
  }

  engine->scheduler = scheduler();
  if (!engine->scheduler) {
    map_free(engine->components);
    map_free(engine->target_map);
    free(engine);
    return NULL;
  }

  engine->current_instance = NULL;

  W->log->info("Engine created successfully.");
  return engine;
}

void engine_register_component(Engine *engine, const char *name,
                               const Value *definition) {
  if (!engine || !name || !definition)
    return;
  engine->components->set(engine->components, name, W->valueClone(definition));
  W->log->debug("Registered component: %s", name);
}

static void free_target_map(Map *target_map) {
  if (!target_map)
    return;
  for (size_t i = 0; i < target_map->capacity; i++) {
    for (MapEntry *target_entry = target_map->entries[i]; target_entry;
         target_entry = target_entry->next) {
      Value *deps_map_wrapper = target_entry->value;
      if (deps_map_wrapper &&
          W->valueGetType(deps_map_wrapper) == VALUE_POINTER) {
        Map *deps_map = (Map *)deps_map_wrapper->as.pointer;
        for (size_t j = 0; j < deps_map->capacity; j++) {
          for (MapEntry *dep_entry = deps_map->entries[j]; dep_entry;
               dep_entry = dep_entry->next) {
            Value *dep_list_wrapper = dep_entry->value;
            if (dep_list_wrapper &&
                W->valueGetType(dep_list_wrapper) == VALUE_POINTER) {
              free(dep_list_wrapper->as.pointer);
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
  W->log->info("Destroying Engine.");
  free_target_map(engine->target_map);
  map_free(engine->components);
  free(engine->effect_stack);
  scheduler_destroy(engine->scheduler);
  free(engine);
}
