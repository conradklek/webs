/**
 * @file undefined.h
 * @brief Provides a function to create an undefined `Value`.
 */

#ifndef UNDEFINED_H
#define UNDEFINED_H

#include "value.h"

/**
 * @brief Creates a new `Value` of type `VALUE_UNDEFINED`.
 * @return A new undefined `Value`, or NULL on allocation failure.
 */
Value *undefined(void);

#endif // UNDEFINED_H
