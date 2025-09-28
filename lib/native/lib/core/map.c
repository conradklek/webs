#include "map.h"
#include "console.h"
#include "value.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static Status map_set_method(Map *self, const char *key, Value *value);
static Value *map_get_method(const Map *self, const char *key);
static Value *map_get_len_method(const Map *self, const char *key, size_t len);

static size_t hash_key(const char *key) {
  size_t hash = 2166136261u;
  for (const char *p = key; *p; p++) {
    hash ^= (size_t)(*p);
    hash *= 16777619;
  }
  return hash;
}

static size_t hash_key_len(const char *key, size_t len) {
  size_t hash = 2166136261u;
  for (size_t i = 0; i < len; i++) {
    hash ^= (size_t)key[i];
    hash *= 16777619;
  }
  return hash;
}

Map *map(size_t capacity) {
  Map *table = malloc(sizeof(Map));
  if (!table)
    return NULL;

  table->capacity = capacity > 0 ? capacity : 16;
  table->count = 0;
  table->entries = calloc(table->capacity, sizeof(MapEntry *));
  if (!table->entries) {
    free(table);
    return NULL;
  }

  table->set = map_set_method;
  table->get = map_get_method;
  table->get_len = map_get_len_method;

  return table;
}

void map_free(Map *table) {
  if (!table)
    return;
  for (size_t i = 0; i < table->capacity; i++) {
    MapEntry *entry = table->entries[i];
    while (entry) {
      MapEntry *next = entry->next;
      free(entry->key);
      value_free(entry->value);
      free(entry);
      entry = next;
    }
  }
  free(table->entries);
  free(table);
}

static Status map_resize(Map *table) {
  size_t new_capacity = table->capacity * 2;
  MapEntry **new_entries = calloc(new_capacity, sizeof(MapEntry *));
  if (!new_entries) {
    console()->error(console(), "Map: Failed to allocate memory for resize.");
    return ERROR_MEMORY;
  }

  for (size_t i = 0; i < table->capacity; i++) {
    MapEntry *entry = table->entries[i];
    while (entry) {
      MapEntry *next = entry->next;

      size_t index = hash_key(entry->key) % new_capacity;

      entry->next = new_entries[index];
      new_entries[index] = entry;

      entry = next;
    }
  }

  free(table->entries);
  table->entries = new_entries;
  table->capacity = new_capacity;
  return OK;
}

static Status map_set_method(Map *self, const char *key, Value *value) {
  if (!self || !key || !value) {
    if (value)
      value_free(value);
    return ERROR_INVALID_ARG;
  }

  if (self->count >= self->capacity * 0.75) {
    if (map_resize(self) != OK) {
      value_free(value);
      return ERROR_MEMORY;
    }
  }

  size_t index = hash_key(key) % self->capacity;
  MapEntry *entry = self->entries[index];

  while (entry) {
    if (strcmp(entry->key, key) == 0) {
      value_free(entry->value);
      entry->value = value;
      return OK;
    }
    entry = entry->next;
  }

  MapEntry *new_entry = malloc(sizeof(MapEntry));
  if (!new_entry) {
    value_free(value);
    return ERROR_MEMORY;
  }

  new_entry->key = strdup(key);
  if (!new_entry->key) {
    free(new_entry);
    value_free(value);
    return ERROR_MEMORY;
  }
  new_entry->value = value;

  new_entry->next = self->entries[index];
  self->entries[index] = new_entry;
  self->count++;
  return OK;
}

static Value *map_get_method(const Map *self, const char *key) {
  if (!self || !key)
    return NULL;
  size_t index = hash_key(key) % self->capacity;
  MapEntry *entry = self->entries[index];

  while (entry) {
    if (strcmp(entry->key, key) == 0) {
      return entry->value;
    }
    entry = entry->next;
  }
  return NULL;
}

static Value *map_get_len_method(const Map *self, const char *key, size_t len) {
  if (!self || !key)
    return NULL;
  size_t index = hash_key_len(key, len) % self->capacity;
  MapEntry *entry = self->entries[index];

  while (entry) {
    if (strlen(entry->key) == len && strncmp(entry->key, key, len) == 0) {
      return entry->value;
    }
    entry = entry->next;
  }
  return NULL;
}
