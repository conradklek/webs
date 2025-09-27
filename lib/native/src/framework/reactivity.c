#include "reactivity.h"
#include "../core/boolean.h"
#include "../core/console.h"
#include "../core/map.h"
#include "../core/object.h"
#include "../core/pointer.h"
#include "engine.h"
#include "scheduler.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void effect_stack_push(Engine *engine, ReactiveEffect *effect) {
  if (engine->stack_size >= engine->stack_capacity) {
    engine->stack_capacity =
        engine->stack_capacity == 0 ? 8 : engine->stack_capacity * 2;
    engine->effect_stack =
        realloc(engine->effect_stack,
                sizeof(ReactiveEffect *) * engine->stack_capacity);
  }
  engine->effect_stack[engine->stack_size++] = effect;
}

static ReactiveEffect *effect_stack_pop(Engine *engine) {
  if (engine->stack_size == 0)
    return NULL;
  return engine->effect_stack[--engine->stack_size];
}

static void add_dep_to_effect(ReactiveEffect *effect, EffectDepNode *dep_node) {
  if (effect->deps_count >= effect->deps_capacity) {
    effect->deps_capacity =
        effect->deps_capacity == 0 ? 8 : effect->deps_capacity * 2;
    effect->deps =
        realloc(effect->deps, sizeof(EffectDepNode *) * effect->deps_capacity);
  }
  effect->deps[effect->deps_count++] = dep_node;
}

static void cleanup_effect(ReactiveEffect *effect) {
  for (size_t i = 0; i < effect->deps_count; i++) {
    EffectDepNode *node = effect->deps[i];
    EffectDepList *list = node->owner_list;

    if (list->head == node) {
      list->head = node->next;
    } else {
      EffectDepNode *current = list->head;
      while (current && current->next != node) {
        current = current->next;
      }
      if (current) {
        current->next = node->next;
      }
    }
    free(node);
  }
  effect->deps_count = 0;
}

void track(Engine *engine, const Value *target, const char *key) {
  if (!engine->active_effect)
    return;

  engine->console->debug(engine->console, "TRACK: target=%p, key='%s'",
                         (const void *)target, key);

  char target_key_str[32];
  snprintf(target_key_str, sizeof(target_key_str), "%p", (const void *)target);

  Value *deps_map_val =
      engine->target_map->get(engine->target_map, target_key_str);
  Map *deps_map;
  if (!deps_map_val) {
    deps_map = map(8);
    Value *deps_map_wrapper = pointer(deps_map);
    engine->target_map->set(engine->target_map, target_key_str,
                            deps_map_wrapper);
  } else {
    deps_map = (Map *)deps_map_val->as.pointer_val;
  }

  Value *dep_list_val = deps_map->get(deps_map, key);
  EffectDepList *dep_list;
  if (!dep_list_val) {
    dep_list = calloc(1, sizeof(EffectDepList));
    Value *dep_list_wrapper = pointer(dep_list);
    deps_map->set(deps_map, key, dep_list_wrapper);
  } else {
    dep_list = (EffectDepList *)dep_list_val->as.pointer_val;
  }

  EffectDepNode *current = dep_list->head;
  while (current) {
    if (current->effect == engine->active_effect)
      return;
    current = current->next;
  }

  EffectDepNode *node = calloc(1, sizeof(EffectDepNode));
  node->effect = engine->active_effect;
  node->owner_list = dep_list;
  node->next = dep_list->head;
  dep_list->head = node;

  add_dep_to_effect(engine->active_effect, node);
}

void trigger(Engine *engine, const Value *target, const char *key) {
  engine->console->debug(engine->console, "TRIGGER: target=%p, key='%s'",
                         (const void *)target, key);

  char target_key_str[32];
  snprintf(target_key_str, sizeof(target_key_str), "%p", (const void *)target);

  Value *deps_map_val =
      engine->target_map->get(engine->target_map, target_key_str);
  if (!deps_map_val)
    return;
  Map *deps_map = (Map *)deps_map_val->as.pointer_val;

  Value *dep_list_val = deps_map->get(deps_map, key);
  if (!dep_list_val)
    return;
  EffectDepList *dep_list = (EffectDepList *)dep_list_val->as.pointer_val;

  EffectDepNode *current = dep_list->head;
  while (current) {
    if (current->effect != engine->active_effect && current->effect->active) {
      engine->console->debug(engine->console,
                             "Queueing effect %p due to trigger",
                             (void *)current->effect);
      scheduler_queue_job(engine->scheduler, current->effect);
    }
    current = current->next;
  }
}

ReactiveEffect *effect(EffectCallback fn, void *user_data) {
  ReactiveEffect *effect = calloc(1, sizeof(ReactiveEffect));
  effect->fn = fn;
  effect->user_data = user_data;
  effect->active = true;
  return effect;
}

void effect_run(Engine *engine, ReactiveEffect *effect) {
  if (!effect || !effect->active)
    return;

  cleanup_effect(effect);

  effect_stack_push(engine, engine->active_effect);
  engine->active_effect = effect;

  if (effect->fn) {
    effect->fn(effect->user_data);
  }

  engine->active_effect = effect_stack_pop(engine);
}

void effect_stop(ReactiveEffect *effect) {
  if (effect && effect->active) {
    cleanup_effect(effect);
    effect->active = false;
  }
}

void effect_free(ReactiveEffect *effect) {
  if (effect) {
    effect_stop(effect);
    free(effect->deps);
    free(effect);
  }
}

Value *ref(Value *initial_value) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;

  Ref *ref_val = malloc(sizeof(Ref));
  if (!ref_val) {
    free(val);
    return NULL;
  }

  ref_val->value = initial_value;
  val->type = VALUE_REF;
  val->as.ref_val = ref_val;

  return val;
}

void ref_free(Ref *ref_val) {
  if (ref_val) {
    value_free(ref_val->value);
    free(ref_val);
  }
}

Value *ref_get_value(Engine *engine, Value *ref_value) {
  if (!ref_value || ref_value->type != VALUE_REF)
    return NULL;
  track(engine, ref_value, "value");
  return ref_value->as.ref_val->value;
}

void ref_set_value(Engine *engine, Value *ref_value, Value *new_value) {
  if (!ref_value || ref_value->type != VALUE_REF) {
    if (new_value)
      value_free(new_value);
    return;
  }
  Value *old_value = ref_value->as.ref_val->value;
  if (value_compare(old_value, new_value) != 0) {
    value_free(old_value);
    ref_value->as.ref_val->value = new_value;
    trigger(engine, ref_value, "value");
  } else {
    value_free(new_value);
  }
}

Value *reactive(Value *target) {
  Value *proxy = object_value();
  Object *proxy_obj = proxy->as.object_val;
  proxy_obj->set(proxy_obj, "_is_reactive", boolean(true));
  proxy_obj->set(proxy_obj, "_raw", target);
  return proxy;
}

Value *reactive_get(Engine *engine, const Value *proxy, const char *key) {
  if (!proxy || proxy->type != VALUE_OBJECT)
    return NULL;

  const Object *proxy_obj = proxy->as.object_val;
  const Value *raw = proxy_obj->get(proxy_obj, "_raw");
  if (!raw)
    return NULL;

  track(engine, raw, key);
  const Object *raw_obj = raw->as.object_val;
  return raw_obj->get(raw_obj, key);
}

void reactive_set(Engine *engine, Value *proxy, const char *key, Value *value) {
  if (!proxy || proxy->type != VALUE_OBJECT) {
    if (value)
      value_free(value);
    return;
  }
  Object *proxy_obj = proxy->as.object_val;
  Value *raw = proxy_obj->get(proxy_obj, "_raw");
  if (!raw) {
    if (value)
      value_free(value);
    return;
  }

  Object *raw_obj = raw->as.object_val;
  Value *old_value = raw_obj->get(raw_obj, key);
  if (value_compare(old_value, value) != 0) {
    raw_obj->set(raw_obj, key, value);
    trigger(engine, raw, key);
  } else {
    value_free(value);
  }
}
