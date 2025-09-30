/**
 * @file object.h
 * @brief Defines the Object type, a key-value store based on the `Map`
 * implementation.
 */

#ifndef OBJECT_H
#define OBJECT_H

#include "map.h"
#include "value.h"

/**
 * @struct Object
 * @brief A key-value object structure, essentially a wrapper around the `Map`.
 */
typedef struct Object {
  Map *map;
  Status (*set)(struct Object *self, const char *key, Value *value);
  Value *(*get)(const struct Object *self, const char *key);
} Object;

/**
 * @brief Creates a new `Value` of type `VALUE_OBJECT`.
 * @return A new object `Value`, or NULL on allocation failure.
 */
Value *object_value(void);

/**
 * @brief Creates a new heap-allocated `Object` struct.
 * @return A new `Object`, or NULL on allocation failure.
 */
Object *object(void);

/**
 * @brief Frees an `Object` and its underlying `Map`.
 * @param object The `Object` to free.
 */
void object_free(Object *object);

/**
 * @brief Gets a reference to a `Value` for a given key in the object.
 * @param object The object to query.
 * @param key The property key.
 * @return A pointer to the `Value`, or NULL if the key is not found.
 * @warning Do not free the returned pointer; it is owned by the object.
 */
Value *object_get_ref(const Object *object, const char *key);

#endif // OBJECT_H
