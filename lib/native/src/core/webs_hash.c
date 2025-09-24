#include "webs_hash.h"
#include "webs_value.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

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

WebsHashTable *webs_hash_create(size_t capacity) {
  WebsHashTable *table = malloc(sizeof(WebsHashTable));
  if (!table)
    return NULL;

  table->capacity = capacity > 0 ? capacity : 16;
  table->count = 0;
  table->entries = calloc(table->capacity, sizeof(WebsHashEntry *));
  if (!table->entries) {
    free(table);
    return NULL;
  }
  return table;
}

void webs_hash_free(WebsHashTable *table) {
  if (!table)
    return;
  for (size_t i = 0; i < table->capacity; i++) {
    WebsHashEntry *entry = table->entries[i];
    while (entry) {
      WebsHashEntry *next = entry->next;
      free(entry->key);
      webs_value_free(entry->value);
      free(entry);
      entry = next;
    }
  }
  free(table->entries);
  free(table);
}

static void webs_hash_resize(WebsHashTable *table) {
  size_t new_capacity = table->capacity * 2;
  WebsHashEntry **new_entries = calloc(new_capacity, sizeof(WebsHashEntry *));
  if (!new_entries) {
    fprintf(stderr, "Webs Hash: Failed to allocate memory for resize.\n");
    return;
  }

  for (size_t i = 0; i < table->capacity; i++) {
    WebsHashEntry *entry = table->entries[i];
    while (entry) {
      WebsHashEntry *next = entry->next;

      size_t index = hash_key(entry->key) % new_capacity;

      entry->next = new_entries[index];
      new_entries[index] = entry;

      entry = next;
    }
  }

  free(table->entries);
  table->entries = new_entries;
  table->capacity = new_capacity;
}

void webs_hash_set(WebsHashTable *table, const char *key, WebsValue *value) {
  if (table->count >= table->capacity * 0.75) {
    webs_hash_resize(table);
  }

  size_t index = hash_key(key) % table->capacity;
  WebsHashEntry *entry = table->entries[index];

  while (entry) {
    if (strcmp(entry->key, key) == 0) {
      webs_value_free(entry->value);
      entry->value = value;
      return;
    }
    entry = entry->next;
  }

  WebsHashEntry *new_entry = malloc(sizeof(WebsHashEntry));
  if (!new_entry)
    return;

  new_entry->key = strdup(key);
  if (!new_entry->key) {
    free(new_entry);
    return;
  }
  new_entry->value = value;

  new_entry->next = table->entries[index];
  table->entries[index] = new_entry;
  table->count++;
}

WebsValue *webs_hash_get(WebsHashTable *table, const char *key) {
  if (!table || !key)
    return NULL;
  size_t index = hash_key(key) % table->capacity;
  WebsHashEntry *entry = table->entries[index];

  while (entry) {
    if (strcmp(entry->key, key) == 0) {
      return entry->value;
    }
    entry = entry->next;
  }
  return NULL;
}

WebsValue *webs_hash_get_len(WebsHashTable *table, const char *key,
                             size_t len) {
  if (!table || !key)
    return NULL;
  size_t index = hash_key_len(key, len) % table->capacity;
  WebsHashEntry *entry = table->entries[index];

  while (entry) {
    if (strlen(entry->key) == len && strncmp(entry->key, key, len) == 0) {
      return entry->value;
    }
    entry = entry->next;
  }
  return NULL;
}
