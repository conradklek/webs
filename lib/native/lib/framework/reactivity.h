/**
 * @file reactivity.h
 * @brief Defines the core reactivity system of the Webs framework.
 *
 * This system allows the framework to automatically track dependencies and
 * re-run effects (like rendering) when the underlying data changes. It is
 * inspired by modern JavaScript frameworks.
 */

#ifndef REACTIVITY_H
#define REACTIVITY_H

#include "../core/value.h"

typedef struct Engine Engine;
typedef struct ReactiveEffect ReactiveEffect;

/**
 * @brief A function pointer for code that should be run reactively.
 * @param user_data Optional user data passed to the callback.
 */
typedef void (*EffectCallback)(void *user_data);

/**
 * @struct ReactiveEffect
 * @brief Encapsulates a function that can be re-executed when its dependencies
 * change.
 */
struct ReactiveEffect {
  EffectCallback fn;
  void *user_data;
  bool active;
  struct EffectDepNode **deps;
  size_t deps_count;
  size_t deps_capacity;
};

typedef struct EffectDepNode {
  ReactiveEffect *effect;
  struct EffectDepNode *next;
  struct EffectDepList *owner_list;
} EffectDepNode;

typedef struct EffectDepList {
  EffectDepNode *head;
} EffectDepList;

/**
 * @struct Ref
 * @brief A reactive wrapper for a single `Value`.
 */
typedef struct Ref {
  Value *value;
} Ref;

/**
 * @brief Creates a new reactive effect.
 * @param fn The callback function to run.
 * @param user_data Optional data to pass to the callback.
 * @return A new `ReactiveEffect` instance.
 */
ReactiveEffect *effect(EffectCallback fn, void *user_data);

/**
 * @brief Runs an effect function immediately and registers it as the active
 * effect to track dependencies.
 * @param engine The framework engine instance.
 * @param effect The effect to run.
 */
void effect_run(Engine *engine, ReactiveEffect *effect);

/**
 * @brief Stops an effect from running again and cleans up its dependencies.
 * @param effect The effect to stop.
 */
void effect_stop(ReactiveEffect *effect);

void effect_free(ReactiveEffect *effect);

/**
 * @brief Creates a reactive reference (a "ref").
 *
 * Accessing the value inside a `ref` within a reactive effect will create a
 * dependency on that `ref`.
 * @param initial_value The initial `Value` to wrap.
 * @return A new `Value` of type `VALUE_REF`.
 */
Value *ref(Value *initial_value);

/**
 * @brief Frees a Ref struct and its inner value. (Internal use)
 * @param ref_val The Ref to free.
 */
void ref_free(Ref *ref_val);

/**
 * @brief Gets the inner value of a `ref` and tracks it as a dependency.
 * @param engine The framework engine instance.
 * @param ref_value The ref `Value`.
 * @return The inner `Value`.
 */
Value *ref_get_value(Engine *engine, Value *ref_value);

/**
 * @brief Sets the inner value of a `ref` and triggers any dependent effects.
 * @param engine The framework engine instance.
 * @param ref_value The ref `Value` to update.
 * @param new_value The new inner `Value`.
 */
void ref_set_value(Engine *engine, Value *ref_value, Value *new_value);

/**
 * @brief Creates a reactive proxy for an object.
 *
 * Getting or setting properties on this object within an effect will create
 * dependencies on those specific properties.
 * @param target The object `Value` to make reactive.
 * @return A new reactive proxy `Value`.
 */
Value *reactive(Value *target);

Value *reactive_get(Engine *engine, const Value *proxy, const char *key);
void reactive_set(Engine *engine, Value *proxy, const char *key, Value *value);

void track(Engine *engine, const Value *target, const char *key);
void trigger(Engine *engine, const Value *target, const char *key);

#endif // REACTIVITY_H
