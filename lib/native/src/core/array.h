#ifndef ARRAY_H
#define ARRAY_H

#include "value.h"

typedef struct Array {
  Value **elements;
  size_t count;
  size_t capacity;
  Status (*push)(struct Array *self, Value *element);
} Array;

Value *array_value(void);
Array *array(void);
void array_free(Array *array);
Value *array_get(const Array *array, size_t index);

#endif
