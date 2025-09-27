#include "array.h"
#include <stdlib.h>

static Status array_push_method(Array *self, Value *element) {
  if (!self || !element) {
    return ERROR_INVALID_ARG;
  }

  if (self->count >= self->capacity) {
    size_t new_capacity = self->capacity * 2;
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

Value *array_value(void) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_ARRAY;
  val->as.array_val = array();
  if (!val->as.array_val) {
    free(val);
    return NULL;
  }
  return val;
}

Array *array(void) {
  Array *array = malloc(sizeof(Array));
  if (!array)
    return NULL;
  array->count = 0;
  array->capacity = 8;
  array->elements = malloc(sizeof(Value *) * array->capacity);
  if (!array->elements) {
    free(array);
    return NULL;
  }
  array->push = array_push_method;
  return array;
}

void array_free(Array *array) {
  if (!array)
    return;
  for (size_t i = 0; i < array->count; i++) {
    value_free(array->elements[i]);
  }
  free(array->elements);
  free(array);
}

Value *array_get(const Array *array, size_t index) {
  if (!array) {
    return NULL;
  }
  if (index >= array->count) {
    return NULL;
  }
  return array->elements[index];
}
