#include "null.h"
#include <stdlib.h>

Value *null(void) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_NULL;
  return val;
}
