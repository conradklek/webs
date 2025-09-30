/**
 * @file map.h
 * @brief Defines a hash map implementation for string keys and `Value`
 * pointers.
 *
 * This is the underlying data structure for `Object` values in the framework.
 */

#ifndef MAP_H
#define MAP_H

#include "error.h"
#include <stdbool.h>
#include <stddef.h>

typedef struct Value Value;

/**
 * @struct MapEntry
 * @brief A key-value pair in the hash map.
 *
 * Entries with hash collisions are chained together in a linked list.
 */
typedef struct MapEntry {
  char *key;
  Value *value;
  struct MapEntry *next;
} MapEntry;

/**
 * @struct Map
 * @brief The hash map structure.
 */
typedef struct Map {
  MapEntry **entries;
  size_t capacity;
  size_t count;
  Status (*set)(struct Map *self, const char *key, Value *value);
  Value *(*get)(const struct Map *self, const char *key);
  Value *(*get_len)(const struct Map *self, const char *key, size_t len);
} Map;

/**
 * @brief Creates a new hash map with a given initial capacity.
 * @param capacity The initial number of buckets for the map.
 * @return A new `Map` object, or NULL on allocation failure.
 */
Map *map(size_t capacity);

/**
 * @brief Frees a hash map, including all its keys and values.
 * @param table The `Map` to free.
 */
void map_free(Map *table);

#endif // MAP_H
