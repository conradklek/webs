#ifndef REACTIVITY_H
#define REACTIVITY_H

#include "../core/value.h"

typedef struct Engine Engine;
typedef struct ReactiveEffect ReactiveEffect;
typedef struct EffectDepNode EffectDepNode;
typedef struct EffectDepList EffectDepList;
typedef void (*EffectCallback)(void *user_data);

struct ReactiveEffect {
  EffectCallback fn;
  void *user_data;
  bool active;
  EffectDepNode **deps;
  size_t deps_count;
  size_t deps_capacity;
};

struct EffectDepNode {
  ReactiveEffect *effect;
  EffectDepNode *next;
  EffectDepList *owner_list;
};

struct EffectDepList {
  EffectDepNode *head;
};

typedef struct Ref {
  Value *value;
} Ref;

ReactiveEffect *effect(EffectCallback fn, void *user_data);
void effect_run(Engine *engine, ReactiveEffect *effect);
void effect_stop(ReactiveEffect *effect);
void effect_free(ReactiveEffect *effect);

Value *ref(Value *initial_value);
void ref_free(Ref *ref_val);
Value *ref_get_value(Engine *engine, Value *ref_value);
void ref_set_value(Engine *engine, Value *ref_value, Value *new_value);

Value *reactive(Value *target);
Value *reactive_get(Engine *engine, const Value *proxy, const char *key);
void reactive_set(Engine *engine, Value *proxy, const char *key, Value *value);

void track(Engine *engine, const Value *target, const char *key);
void trigger(Engine *engine, const Value *target, const char *key);

#endif
