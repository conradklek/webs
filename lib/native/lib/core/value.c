#include "value.h"
#include "../framework/reactivity.h"
#include "../framework/vdom.h"
#include "array.h"
#include "boolean.h"
#include "console.h"
#include "map.h"
#include "memory.h"
#include "null.h"
#include "number.h"
#include "object.h"
#include "pointer.h"
#include "string.h"
#include "undefined.h"
#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void printValue(Value *value) {
  switch (value->type) {
  case VALUE_NUMBER:
    printf("%g", value->as.number);
    break;
  case VALUE_BOOL:
    printf(value->as.boolean ? "true" : "false");
    break;
  case VALUE_NULL:
    printf("null");
    break;
  case VALUE_STRING:
    printf("%s", value->as.string->chars);
    break;
  default:
    printf("Value");
    break;
  }
}

void initValueArray(ValueArray *array) {
  array->values = NULL;
  array->capacity = 0;
  array->count = 0;
}

void writeValueArray(ValueArray *array, Value *value) {
  if (array->capacity < array->count + 1) {
    int oldCapacity = array->capacity;
    int newCapacity = GROW_CAPACITY(oldCapacity);
    Value *new_values =
        GROW_ARRAY(Value, array->values, oldCapacity, newCapacity);

    if (!new_values) {
      console()->error(console(), "MEMORY_ERROR: Could not grow ValueArray.");
      free(value);
      return;
    }
    array->values = new_values;
    array->capacity = newCapacity;
  }
  array->values[array->count] = *value;
  array->count++;
  free(value);
}

void freeValueArray(ValueArray *array) {
  if (!array)
    return;

  for (int i = 0; i < array->count; i++) {
  }
  FREE_ARRAY(Value, array->values, array->capacity);
  initValueArray(array);
}

void value_free(Value *value) {
  if (!value)
    return;

  switch (value->type) {
  case VALUE_STRING:
    string_free(value->as.string);
    break;
  case VALUE_ARRAY:
    array_free(value->as.array);
    break;
  case VALUE_OBJECT:
    object_free(value->as.object);
    break;
  case VALUE_VNODE:
    vnode_free(value->as.vnode);
    break;
  case VALUE_REF:
    ref_free(value->as.ref);
    break;
  default:
    break;
  }
  free(value);
}

Value *value_clone(const Value *original) {
  if (!original)
    return NULL;

  switch (original->type) {
  case VALUE_NUMBER:
    return number(original->as.number);
  case VALUE_BOOL:
    return boolean(original->as.boolean);
  case VALUE_NULL:
    return null();
  case VALUE_UNDEFINED:
    return undefined();
  case VALUE_STRING:
    return string_value(original->as.string->chars);
  case VALUE_ARRAY: {
    Value *clone = array_value();
    for (size_t i = 0; i < original->as.array->count; ++i) {
      clone->as.array->push(clone->as.array,
                            value_clone(original->as.array->elements[i]));
    }
    return clone;
  }
  case VALUE_OBJECT: {
    Value *clone = object_value();
    const Map *table = original->as.object->map;
    for (size_t i = 0; i < table->capacity; ++i) {
      MapEntry *entry = table->entries[i];
      while (entry) {
        clone->as.object->set(clone->as.object, entry->key,
                              value_clone(entry->value));
        entry = entry->next;
      }
    }
    return clone;
  }
  case VALUE_POINTER:
    return pointer(original->as.pointer);
  case VALUE_REF:
    return ref(value_clone(original->as.ref->value));
  case VALUE_VNODE:
    return NULL;
  case VALUE_FREED:
  default:
    return NULL;
  }
}

int value_compare(const Value *a, const Value *b) {
  if (a == b)
    return 0;
  if (!a && b)
    return -1;
  if (a && !b)
    return 1;
  if (a->type != b->type)
    return a->type - b->type;

  switch (a->type) {
  case VALUE_NULL:
  case VALUE_UNDEFINED:
    return 0;
  case VALUE_BOOL:
    return a->as.boolean - b->as.boolean;
  case VALUE_NUMBER:
    if (fabs(a->as.number - b->as.number) < 1e-9)
      return 0;
    return a->as.number > b->as.number ? 1 : -1;
  case VALUE_STRING:
    return strcmp(a->as.string->chars, b->as.string->chars);
  case VALUE_POINTER:
    return a->as.pointer == b->as.pointer ? 0 : 1;
  case VALUE_REF:
    return value_compare(a->as.ref->value, b->as.ref->value);
  case VALUE_OBJECT:
  case VALUE_ARRAY:
  case VALUE_VNODE:
    return a == b ? 0 : 1;
  case VALUE_FREED:
    return 1;
  }
  return 1;
}

bool value_equals(const Value *a, const Value *b) {
  return value_compare(a, b) == 0;
}
