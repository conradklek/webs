/**
 * @file object.c
 * @brief Implements the Object type, a key-value store.
 */
#include "object.h"
#include "../webs_api.h"
#include <stdlib.h>

static Status object_set_method(Object *self, const char *key, Value *value);
static Value *object_get_method(const Object *self, const char *key);

/**
 * @brief Creates a new `Value` of type `VALUE_OBJECT`.
 */
Value *object_value(void) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_OBJECT;
  val->as.object = object();
  if (!val->as.object) {
    free(val);
    return NULL;
  }
  return val;
}

/**
 * @brief Creates a new heap-allocated `Object` struct.
 */
Object *object(void) {
  Object *object = malloc(sizeof(Object));
  if (!object)
    return NULL;
  object->map = map(8);
  if (!object->map) {
    free(object);
    return NULL;
  }
  object->set = object_set_method;
  object->get = object_get_method;
  return object;
}

/**
 * @brief Frees an `Object` and its underlying `Map`.
 */
void object_free(Object *object) {
  if (!object)
    return;
  map_free(object->map);
  free(object);
}

/**
 * @brief Sets a key-value pair in the object. (Internal method)
 */
static Status object_set_method(Object *self, const char *key, Value *value) {
  if (!self || !key) {
    if (value)
      W->freeValue(value);
    return ERROR_INVALID_ARG;
  }
  return self->map->set(self->map, key, value);
}

/**
 * @brief Gets a value from the object by key. (Internal method)
 */
static Value *object_get_method(const Object *self, const char *key) {
  if (!self || !key) {
    return NULL;
  }
  return self->map->get(self->map, key);
}

/**
 * @brief Gets a reference to a `Value` for a given key in the object.
 */
Value *object_get_ref(const Object *object, const char *key) {
  if (!object || !key) {
    return NULL;
  }
  return object->map->get(object->map, key);
}
