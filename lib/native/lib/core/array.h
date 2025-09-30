/**
 * @file array.h
 * @brief Defines the Array type, a dynamic array for `Value` pointers.
 */

#ifndef ARRAY_H
#define ARRAY_H

#include "value.h"

/**
 * @struct Array
 * @brief A dynamic array implementation for storing `Value` pointers.
 */
typedef struct Array {
  Value **elements;
  size_t count;
  size_t capacity;
  Status (*push)(struct Array *self, Value *element);
} Array;

/**
 * @brief Creates a new `Value` of type `VALUE_ARRAY`.
 * @return A new array `Value`, or NULL on allocation failure.
 */
Value *array_value(void);

/**
 * @brief Creates a new heap-allocated `Array` struct.
 * @return A new `Array` object, or NULL on allocation failure.
 */
Array *array(void);

/**
 * @brief Frees an `Array` struct and all the `Value` elements it contains.
 * @param array The `Array` to free.
 */
void array_free(Array *array);

/**
 * @brief Gets a reference to a `Value` at a specific index in the array.
 * @param array The array to access.
 * @param index The index of the element.
 * @return A pointer to the `Value` at the index, or NULL if out of bounds.
 * @warning Do not free the returned pointer; it is owned by the array.
 */
Value *array_get_ref(const Array *array, size_t index);

#endif // ARRAY_H
