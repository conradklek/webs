/**
 * @file boolean.h
 * @brief Provides a function to create a boolean `Value`.
 */

#ifndef BOOLEAN_H
#define BOOLEAN_H

#include "value.h"

/**
 * @brief Creates a new `Value` of type `VALUE_BOOL`.
 * @param b The boolean value to wrap.
 * @return A new boolean `Value`, or NULL on allocation failure.
 */
Value *boolean(bool b);

#endif // BOOLEAN_H
