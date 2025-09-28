#include "undefined.h"
#include <stdlib.h>

Value *undefined(void) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_UNDEFINED;
  return val;
}
