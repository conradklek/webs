/**
 * @file number.h
 * @brief Provides a function to create a number `Value`.
 */

#ifndef NUMBER_H
#define NUMBER_H

#include "value.h"

/**
 * @brief Creates a new `Value` of type `VALUE_NUMBER`.
 * @param n The double-precision number to wrap.
 * @return A new number `Value`, or NULL on allocation failure.
 */
Value *number(double n);

#endif // NUMBER_H
