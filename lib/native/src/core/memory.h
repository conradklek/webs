#ifndef memory_h
#define memory_h

#include "value.h"

// Macro to calculate the new capacity for a dynamic array
#define GROW_CAPACITY(capacity) ((capacity) < 8 ? 8 : (capacity) * 2)

// Macro to grow a dynamic array
#define GROW_ARRAY(type, pointer, oldCount, newCount)                          \
  (type *)reallocate(pointer, sizeof(type) * (oldCount),                       \
                     sizeof(type) * (newCount))

// Macro to free an array's memory
#define FREE_ARRAY(type, pointer, oldCount)                                    \
  reallocate(pointer, sizeof(type) * (oldCount), 0)

// The core memory management function
void *reallocate(void *pointer, size_t oldSize, size_t newSize);

#endif
