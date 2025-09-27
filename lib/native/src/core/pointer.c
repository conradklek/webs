#include "pointer.h"
#include <stdlib.h>

Value *pointer(void *p) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_POINTER;
  val->as.pointer_val = p;
  return val;
}
