#include "number.h"
#include "null.h"
#include <math.h>
#include <stdlib.h>

Value *number(double n) {
  if (isnan(n) || isinf(n)) {
    return null();
  }
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;

  val->type = VALUE_NUMBER;
  val->as.number = n;
  return val;
}
