#include "number.h"
#include <stdlib.h>

Value *number(double n) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_NUMBER;
  val->as.number_val = n;
  return val;
}
