#include "boolean.h"
#include <stdlib.h>

Value *boolean(bool b) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_BOOL;
  val->as.boolean_val = b;
  return val;
}
