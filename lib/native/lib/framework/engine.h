#ifndef ENGINE_H
#define ENGINE_H

#include "../core/map.h"
#include "reactivity.h"
#include "scheduler.h"
#include <stddef.h>

typedef struct Engine {
  ReactiveEffect *active_effect;
  ReactiveEffect **effect_stack;
  size_t stack_size;
  size_t stack_capacity;

  Map *target_map;
  Map *components;

  Scheduler *scheduler;

} Engine;

Engine *engine();

void engine_destroy(Engine *engine);

void engine_register_component(Engine *engine, const char *name,
                               const Value *definition);

#endif
