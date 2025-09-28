#include "wson.h"
#include "../framework/reactivity.h"
#include "../framework/vdom.h"
#include "array.h"
#include "json.h"
#include "object.h"
#include "string.h"
#include "string_builder.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static void encode_wson_value(const Value *value, StringBuilder *sb);

static void encode_wson_object(const Value *value, StringBuilder *sb) {
  sb_append_char(sb, '{');
  bool first = true;
  const Map *table = value->as.object->map;
  for (size_t i = 0; i < table->capacity; i++) {
    const MapEntry *entry = table->entries[i];
    while (entry) {
      if (!first) {
        sb_append_char(sb, ',');
      }
      char *encoded_key = json_encode(string_value(entry->key));
      sb_append_str(sb, encoded_key);
      free(encoded_key);

      sb_append_char(sb, ':');
      encode_wson_value(entry->value, sb);
      first = false;
      entry = entry->next;
    }
  }
  sb_append_char(sb, '}');
}

static void encode_wson_value(const Value *value, StringBuilder *sb) {
  if (!value) {
    sb_append_str(sb, "null");
    return;
  }

  switch (value->type) {
  case VALUE_REF: {
    sb_append_str(sb, "{\""
                      "$$type"
                      "\":\"ref\",\"value\":");
    encode_wson_value(value->as.ref->value, sb);
    sb_append_char(sb, '}');
    break;
  }
  case VALUE_VNODE: {
    sb_append_str(sb, "{\""
                      "$$type"
                      "\":\"vnode\",\"component\":\"");
    sb_append_str(sb, value->as.vnode->type);
    sb_append_str(sb, "\"}");
    break;
  }
  case VALUE_OBJECT:
    encode_wson_object(value, sb);
    break;
  default: {
    char *json_part = json_encode(value);
    if (json_part) {
      sb_append_str(sb, json_part);
      free(json_part);
    } else {
      sb_append_str(sb, "null");
    }
    break;
  }
  }
}

char *webs_wson_encode(const Value *value) {
  StringBuilder sb;
  sb_init(&sb);
  encode_wson_value(value, &sb);
  return sb_to_string(&sb);
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
        if (revived_child != entry->value) {
          entry->value = revived_child;
        }
      }
    }
  } else if (value->type == VALUE_ARRAY) {
    for (size_t i = 0; i < value->as.array->count; ++i) {
      Value *original_element = value->as.array->elements[i];
      Value *revived_element = revive_wson_tree(engine, original_element);
      if (revived_element != original_element) {
        value->as.array->elements[i] = revived_element;
      }
    }
  }
  return value;
}

Value *webs_wson_decode(Engine *engine, const char *wson_string, char **error) {
  Status status;
  Value *parsed_tree = json_decode(wson_string, &status);
  if (status != OK) {
    if (error) {
      const char *status_string = webs_status_to_string(status);
      char message[256];
      snprintf(message, sizeof(message),
               "WSON decode failed during JSON parse: %s", status_string);
      *error = strdup(message);
    }
    return NULL;
  }
  return revive_wson_tree(engine, parsed_tree);
}
