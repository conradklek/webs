/**
 * @file regex.h
 * @brief Provides a utility to parse JavaScript-style regex literals.
 */

#ifndef REGEX_H
#define REGEX_H

#include "error.h"
#include "value.h"

/**
 * @brief Parses a regex literal string (e.g., "/pattern/flags").
 * @param pattern The regex literal string.
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A `Value` object with `pattern` and `flags` properties, or NULL on
 * failure.
 */
Value *regex_parse(const char *pattern, Status *status);

#endif // REGEX_H
