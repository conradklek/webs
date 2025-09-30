/**
 * @file json.h
 * @brief Provides functions for JSON parsing, encoding, and querying.
 */

#ifndef JSON_H
#define JSON_H

#include "error.h"
#include "value.h"

/**
 * @brief Parses a JSON string into a `Value` structure.
 * @param json_string The null-terminated JSON string to parse.
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A new `Value` representing the parsed JSON, or NULL on failure.
 * @note The caller is responsible for freeing the returned `Value`.
 */
Value *json_decode(const char *json_string, Status *status);

/**
 * @brief Encodes a `Value` structure into a JSON string.
 * @param value The `Value` to encode.
 * @return A new, heap-allocated JSON string.
 * @note The caller is responsible for freeing the returned string.
 */
char *json_encode(const Value *value);

/**
 * @brief Queries a `Value` structure using a dot-notation path.
 * @param root The root `Value` (must be an object or array) to query.
 * @param path The dot-notation path (e.g., "user.name", "posts[0].title").
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A new `Value` that is a clone of the found value, or NULL if not
 * found or on error.
 * @note The caller is responsible for freeing the returned `Value`.
 */
Value *value_query(const Value *root, const char *path, Status *status);

/**
 * @brief Encodes a `Value` into a colorized, pretty-printed JSON string for
 * terminal display.
 * @param value The `Value` to encode.
 * @return A new, heap-allocated, formatted JSON string.
 * @note The caller is responsible for freeing the returned string.
 */
char *json_pretty_print(const Value *value);

#endif // JSON_H
