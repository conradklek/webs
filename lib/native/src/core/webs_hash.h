#ifndef WEBS_HASH_H
#define WEBS_HASH_H

#include <stddef.h>

typedef struct WebsValue WebsValue;

typedef struct WebsHashEntry {
  char *key;
  WebsValue *value;
  struct WebsHashEntry *next;
} WebsHashEntry;

struct WebsHashTable {
  WebsHashEntry **entries;
  size_t capacity;
  size_t count;
};

typedef struct WebsHashTable WebsHashTable;

WebsHashTable *webs_hash_create(size_t capacity);
void webs_hash_free(WebsHashTable *table);
void webs_hash_set(WebsHashTable *table, const char *key, WebsValue *value);
WebsValue *webs_hash_get(WebsHashTable *table, const char *key);

WebsValue *webs_hash_get_len(WebsHashTable *table, const char *key, size_t len);

#endif
