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
    printf("%g", value->as.number_val);
    break;
  case VALUE_BOOL:
    printf(value->as.boolean_val ? "true" : "false");
    break;
  case VALUE_NULL:
    printf("null");
    break;
  case VALUE_STRING:
    printf("%s", value->as.string_val->chars);
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
    string_free(value->as.string_val);
    break;
  case VALUE_ARRAY:
    array_free(value->as.array_val);
    break;
  case VALUE_OBJECT:
    object_free(value->as.object_val);
    break;
  case VALUE_VNODE:
    vnode_free(value->as.vnode_val);
    break;
  case VALUE_REF:
    ref_free(value->as.ref_val);
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
    return number(original->as.number_val);
  case VALUE_BOOL:
    return boolean(original->as.boolean_val);
  case VALUE_NULL:
    return null();
  case VALUE_UNDEFINED:
    return undefined();
  case VALUE_STRING:
    return string_value(original->as.string_val->chars);
  case VALUE_ARRAY: {
    Value *clone = array_value();
    for (size_t i = 0; i < original->as.array_val->count; ++i) {
      clone->as.array_val->push(
          clone->as.array_val,
          value_clone(original->as.array_val->elements[i]));
    }
    return clone;
  }
  case VALUE_OBJECT: {
    Value *clone = object_value();
    const Map *table = original->as.object_val->map;
    for (size_t i = 0; i < table->capacity; ++i) {
      MapEntry *entry = table->entries[i];
      while (entry) {
        clone->as.object_val->set(clone->as.object_val, entry->key,
                                  value_clone(entry->value));
        entry = entry->next;
      }
    }
    return clone;
  }
  case VALUE_POINTER:
    return pointer(original->as.pointer_val);
  case VALUE_REF:
    return ref(value_clone(original->as.ref_val->value));
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
    return a->as.boolean_val - b->as.boolean_val;
  case VALUE_NUMBER:
    if (fabs(a->as.number_val - b->as.number_val) < 1e-9)
      return 0;
    return a->as.number_val > b->as.number_val ? 1 : -1;
  case VALUE_STRING:
    return strcmp(a->as.string_val->chars, b->as.string_val->chars);
  case VALUE_POINTER:
    return a->as.pointer_val == b->as.pointer_val ? 0 : 1;
  case VALUE_REF:
    return value_compare(a->as.ref_val->value, b->as.ref_val->value);
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
