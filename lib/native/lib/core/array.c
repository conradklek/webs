/**
 * @file array.c
 * @brief Implements the Array type, a dynamic array for `Value` pointers.
 */
#include "array.h"
#include "../webs_api.h"
#include <stdlib.h>

/**
 * @brief Method to push an element onto the array. (Internal)
 */
static Status array_push_method(Array *self, Value *element) {
  if (!self || !element) {
    return ERROR_INVALID_ARG;
  }

  if (self->count >= self->capacity) {
    size_t new_capacity = self->capacity == 0 ? 8 : self->capacity * 2;
    Value **new_elements =
        realloc(self->elements, sizeof(Value *) * new_capacity);
    if (!new_elements) {
      return ERROR_MEMORY;
    }
    self->elements = new_elements;
    self->capacity = new_capacity;
  }

  self->elements[self->count++] = element;
  return OK;
}

/**
 * @brief Creates a new `Value` of type `VALUE_ARRAY`.
 */
Value *array_value(void) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_ARRAY;
  val->as.array = array();
  if (!val->as.array) {
    free(val);
    return NULL;
  }
  return val;
}

/**
 * @brief Creates a new heap-allocated `Array` struct.
 */
Array *array(void) {
  Array *array = malloc(sizeof(Array));
  if (!array)
    return NULL;

  array->count = 0;
  array->capacity = 0;
  array->elements = NULL;
  array->push = array_push_method;
  return array;
}

/**
 * @brief Frees an `Array` struct and all the `Value` elements it contains.
 */
void array_free(Array *array) {
  if (!array)
    return;
  for (size_t i = 0; i < array->count; i++) {
    W->freeValue(array->elements[i]);
  }
  free(array->elements);
  free(array);
}

/**
 * @brief Gets a reference to a `Value` at a specific index in the array.
 */
Value *array_get_ref(const Array *array, size_t index) {
  if (!array) {
    return NULL;
  }
  if (index >= array->count) {
    return NULL;
  }
  return array->elements[index];
}
