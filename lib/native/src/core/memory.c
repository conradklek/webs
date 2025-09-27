#include "memory.h"
#include "console.h"
#include <stdio.h>
#include <stdlib.h>

void *reallocate(void *pointer, size_t oldSize, size_t newSize) {
  if (newSize == 0) {
    free(pointer);
    return NULL;
  }

  void *result = realloc(pointer, newSize);

  if (result == NULL) {
    console()->error(console(), "FATAL: realloc failed to allocate %zu bytes",
                     newSize);
  }

  return result;
}
