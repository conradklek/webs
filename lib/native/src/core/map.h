#ifndef MAP_H
#define MAP_H

#include "error.h"
#include <stdbool.h>
#include <stddef.h>

typedef struct Value Value;

typedef struct MapEntry {
  char *key;
  Value *value;
  struct MapEntry *next;
} MapEntry;

typedef struct Map Map;

struct Map {
  MapEntry **entries;
  size_t capacity;
  size_t count;
  Status (*set)(Map *self, const char *key, Value *value);
  Value *(*get)(const Map *self, const char *key);
  Value *(*get_len)(const Map *self, const char *key, size_t len);
};

Map *map(size_t capacity);
void map_free(Map *table);

#endif
