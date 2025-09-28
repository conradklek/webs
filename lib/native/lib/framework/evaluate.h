#ifndef EVALUATE_H
#define EVALUATE_H

#include "../core/value.h"

Value *evaluate_expression(const Value *node, const Value *scope);

#endif
