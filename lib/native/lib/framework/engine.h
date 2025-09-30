/**
 * @file engine.h
 * @brief Defines the main framework engine.
 *
 * The `Engine` is the central orchestrator that holds the state for the
 * reactivity system, the scheduler, and the registry of defined components.
 * An instance of the engine is required for most framework operations.
 */

#ifndef ENGINE_H
#define ENGINE_H

#include "../core/map.h"
#include "reactivity.h"
#include "scheduler.h"
#include <stddef.h>

// Forward declare to avoid circular dependency
typedef struct ComponentInstance ComponentInstance;

/**
 * @struct Engine
 * @brief The central state manager for the Webs framework.
 */
typedef struct Engine {
  ReactiveEffect *active_effect;
  Map *target_map;
  Map *components;
  Scheduler *scheduler;
  ReactiveEffect **effect_stack;
  size_t stack_size;
  size_t stack_capacity;
  ComponentInstance *current_instance; // The component being initialized
} Engine;

/**
 * @brief Creates a new framework engine instance.
 * @return A new `Engine`, or NULL on allocation failure.
 */
Engine *engine();

/**
 * @brief Frees all resources associated with an engine instance.
 * @param engine The engine to destroy.
 */
void engine_destroy(Engine *engine);

/**
 * @brief Registers a component definition with the engine.
 * @param engine The engine instance.
 * @param name The name of the component.
 * @param definition An object `Value` containing the component's options
 * (template, props, etc.).
 */
void engine_register_component(Engine *engine, const char *name,
                               const Value *definition);

#endif // ENGINE_H
