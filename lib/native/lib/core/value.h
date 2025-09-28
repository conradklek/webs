#ifndef VALUE_H
#define VALUE_H

#include "types.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h>

typedef struct String String;
typedef struct Array Array;
typedef struct Object Object;
typedef struct VNode VNode;
typedef struct Ref Ref;

typedef struct Value {
  ValueType type;
  union {
    double number;
    bool boolean;
    String *string;
    Array *array;
    Object *object;
    void *pointer;
    VNode *vnode;
    Ref *ref;
  } as;
} Value;

typedef struct {
  int capacity;
  int count;
  Value *values;
} ValueArray;

void initValueArray(ValueArray *array);
void writeValueArray(ValueArray *array, Value *value);
void freeValueArray(ValueArray *array);

void value_free(Value *value);
Value *value_clone(const Value *original);
int value_compare(const Value *a, const Value *b);
bool value_equals(const Value *a, const Value *b);
void printValue(Value *value);

#endif
