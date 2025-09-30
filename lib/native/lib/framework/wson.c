#include "wson.h"
#include "../core/array.h"
#include "../core/json.h"
#include "../core/object.h"
#include "../core/string.h"
#include "../webs_api.h"
#include "reactivity.h"
#include "vdom.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void encode_wson_value(const Value *value, StringBuilder *sb);

static void encode_wson_object(const Value *value, StringBuilder *sb) {
  const Value *target_value = value;
  if (value->type == VALUE_OBJECT &&
      value->as.object->get(value->as.object, "_is_reactive")) {
    const Value *raw_obj = value->as.object->get(value->as.object, "_raw");
    if (raw_obj)
      target_value = raw_obj;
  }
  W->stringBuilder->appendChar(sb, '{');
  bool first = true;
  const Map *table = target_value->as.object->map;
  for (size_t i = 0; i < table->capacity; i++) {
    const MapEntry *entry = table->entries[i];
    while (entry) {
      if (!first)
        W->stringBuilder->appendChar(sb, ',');
      char *encoded_key = json_encode(string_value(entry->key));
      W->stringBuilder->appendStr(sb, encoded_key);
      free(encoded_key);
      W->stringBuilder->appendChar(sb, ':');
      encode_wson_value(entry->value, sb);
      first = false;
      entry = entry->next;
    }
  }
  W->stringBuilder->appendChar(sb, '}');
}

static void encode_wson_value(const Value *value, StringBuilder *sb) {
  if (!value) {
    W->stringBuilder->appendStr(sb, "null");
    return;
  }
  switch (value->type) {
  case VALUE_REF:
    W->stringBuilder->appendStr(sb, "{\"$$type\":\"ref\",\"value\":");
    encode_wson_value(value->as.ref->value, sb);
    W->stringBuilder->appendChar(sb, '}');
    break;
  case VALUE_VNODE:
    W->stringBuilder->appendStr(sb, "{\"$$type\":\"vnode\",\"component\":\"");
    W->stringBuilder->appendStr(sb, value->as.vnode->type);
    W->stringBuilder->appendStr(sb, "\"}");
    break;
  case VALUE_OBJECT:
    encode_wson_object(value, sb);
    break;
  default: {
    char *json_part = json_encode(value);
    if (json_part) {
      W->stringBuilder->appendStr(sb, json_part);
      free(json_part);
    } else {
      W->stringBuilder->appendStr(sb, "null");
    }
    break;
  }
  }
}

char *wson_encode(const Value *value) {
  StringBuilder sb;
  W->stringBuilder->init(&sb);
  encode_wson_value(value, &sb);
  return W->stringBuilder->toString(&sb);
}

static Value *revive_wson_tree(Engine *engine, Value *value) {
  if (!value)
    return NULL;
  if (value->type == VALUE_OBJECT) {
    Value *type_tag = value->as.object->get(value->as.object, "$$type");
    if (type_tag && type_tag->type == VALUE_STRING) {
      const char *type = type_tag->as.string->chars;
      if (strcmp(type, "ref") == 0) {
        Value *inner_value = value->as.object->get(value->as.object, "value");
        Value *revived_inner =
            revive_wson_tree(engine, value_clone(inner_value));
        Value *new_ref = ref(revived_inner);
        value_free(value);
        return new_ref;
      }
    }
    Map *table = value->as.object->map;
    for (size_t i = 0; i < table->capacity; ++i) {
      for (MapEntry *entry = table->entries[i]; entry; entry = entry->next) {
        Value *revived_child = revive_wson_tree(engine, entry->value);
        if (revived_child != entry->value)
          entry->value = revived_child;
      }
    }
  } else if (value->type == VALUE_ARRAY) {
    for (size_t i = 0; i < value->as.array->count; ++i) {
      Value *original_element = value->as.array->elements[i];
      Value *revived_element = revive_wson_tree(engine, original_element);
      if (revived_element != original_element)
        value->as.array->elements[i] = revived_element;
    }
  }
  return value;
}

Value *wson_decode(Engine *engine, const char *wson_string, char **error) {
  if (error)
    *error = NULL;
  if (!wson_string || strlen(wson_string) == 0) {
    if (error)
      *error = strdup("WSON decode failed: input is empty or null.");
    return NULL;
  }
  Status status;
  Value *parsed_tree = json_decode(wson_string, &status);
  if (status != OK) {
    if (error) {
      const char *status_string = W->statusToString(status);
      char message[256];
      snprintf(message, sizeof(message), "WSON decode failed: %s",
               status_string);
      *error = strdup(message);
    }
    if (parsed_tree)
      value_free(parsed_tree);
    return NULL;
  }
  return revive_wson_tree(engine, parsed_tree);
}
