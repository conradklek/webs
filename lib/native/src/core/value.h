#ifndef VALUE_H
#define VALUE_H

#include "error.h"
#include <stdbool.h>
#include <stddef.h>
#include <stdint.h> // For uint8_t

// Forward declarations for complex types
typedef struct String String;
typedef struct Array Array;
typedef struct Object Object;
typedef struct VNode VNode;
typedef struct Ref Ref;

// Enum for the different types a Value can hold
typedef enum {
  VALUE_NUMBER,
  VALUE_BOOL,
  VALUE_NULL,
  VALUE_UNDEFINED,
  VALUE_STRING,
  VALUE_ARRAY,
  VALUE_OBJECT,
  VALUE_POINTER,
  VALUE_VNODE,
  VALUE_REF,
  VALUE_FREED,
} ValueType;

// The core tagged union for dynamic values
typedef struct Value {
  ValueType type;
  union {
    double number_val;
    bool boolean_val;
    String *string_val;
    Array *array_val;
    Object *object_val;
    void *pointer_val;
    VNode *vnode_val;
    Ref *ref_val;
  } as;
} Value;

// A dynamic array specifically for holding Value structs (for constant pools)
typedef struct {
  int capacity;
  int count;
  Value *values;
} ValueArray;

// Functions for managing ValueArrays
void initValueArray(ValueArray *array);
void writeValueArray(ValueArray *array, Value *value);
void freeValueArray(ValueArray *array);

// Core Value functions
void value_free(Value *value);
Value *value_clone(const Value *original);
int value_compare(const Value *a, const Value *b);
bool value_equals(const Value *a, const Value *b);
void printValue(Value *value); // New function for debugging

#endif
