/**
 * @file pointer.h
 * @brief Provides a function to create a raw pointer `Value`.
 *
 * This is useful for passing opaque pointers through the value system,
 * especially for interacting with external libraries or FFI callbacks.
 */

#ifndef POINTER_H
#define POINTER_H

#include "value.h"

/**
 * @brief Creates a new `Value` of type `VALUE_POINTER`.
 * @param p The raw pointer to wrap.
 * @return A new pointer `Value`, or NULL on allocation failure.
 */
Value *pointer(void *p);

#endif // POINTER_H
