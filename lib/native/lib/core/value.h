/**
 * @file value.h
 * @brief Defines the core dynamic value system for the Webs framework.
 *
 * This file contains the definition for the `Value` struct, a tagged union that
 * allows for representing various data types (number, string, boolean, object,
 * etc.) in a type-safe manner within C. It is the cornerstone of the
 * framework's data handling.
 */

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
typedef struct Value Value;

/**
 * @struct Value
 * @brief A tagged union representing a dynamic type.
 *
 * This struct can hold various types of data, and its `type` field
 * must be checked before accessing the `as` union to ensure type safety.
 */
struct Value {
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
};

/**
 * @struct ValueArray
 * @brief A simple dynamic array for holding Value structs directly.
 * @note This is different from the main Array type which holds Value pointers.
 */
typedef struct {
  Value *values;
  int capacity;
  int count;
} ValueArray;

/**
 * @brief Frees the memory allocated for a Value and its contents.
 *
 * This function is type-aware and will recursively free nested data structures
 * like strings, arrays, and objects.
 * @param value The Value to free.
 */
void value_free(Value *value);

/**
 * @brief Creates a deep clone of a Value.
 * @param original The Value to clone.
 * @return A new Value that is a deep copy of the original, or NULL on failure.
 * @note The caller is responsible for freeing the returned Value.
 */
Value *value_clone(const Value *original);

/**
 * @brief Compares two Value structs for ordering.
 *
 * Provides a consistent ordering for different types and values.
 * @param a The first Value.
 * @param b The second Value.
 * @return An integer less than, equal to, or greater than zero if a is found,
 * respectively, to be less than, to match, or be greater than b.
 */
int value_compare(const Value *a, const Value *b);

/**
 * @brief Checks if two Value structs are deeply equal.
 * @param a The first Value.
 * @param b The second Value.
 * @return `true` if the values are equal, `false` otherwise.
 */
bool value_equals(const Value *a, const Value *b);

/**
 * @brief Prints a representation of the Value to stdout. For debugging.
 * @param value The Value to print.
 */
void printValue(const Value *value);

void initValueArray(ValueArray *array);
void writeValueArray(ValueArray *array, Value *value);
void freeValueArray(ValueArray *array);

#endif // VALUE_H
