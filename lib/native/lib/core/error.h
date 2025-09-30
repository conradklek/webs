/**
 * @file error.h
 * @brief Provides error handling utilities for the Webs framework.
 */

#ifndef ERROR_H
#define ERROR_H

#include "types.h"

/**
 * @brief Converts a Status enum to its string representation.
 * @param status The status code to convert.
 * @return A constant string describing the status.
 */
const char *webs_status_to_string(Status status);

#endif // ERROR_H
