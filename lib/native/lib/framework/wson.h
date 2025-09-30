/**
 * @file wson.h
 * @brief Defines the Webs Serialized Object Notation (WSON)
 * serializer/deserializer.
 *
 * WSON is a superset of JSON designed to handle framework-specific reactive
 * types like `ref` and `reactive` during serialization and deserialization.
 */

#ifndef WSON_H
#define WSON_H

#include "../core/value.h"
#include "engine.h"

/**
 * @brief Encodes a `Value` into a WSON string.
 *
 * It extends JSON encoding to handle special types like `ref`.
 * @param value The `Value` to encode.
 * @return A new, heap-allocated WSON string. The caller must free it.
 */
char *wson_encode(const Value *value);

/**
 * @brief Decodes a WSON string back into a `Value`, reviving special types.
 * @param engine The framework engine instance, required for reviving reactive
 * objects.
 * @param wson_string The WSON string to decode.
 * @param[out] error A pointer to a char pointer that will be set on parsing
 * failure.
 * @return A new `Value` representing the decoded data, or NULL on failure.
 */
Value *wson_decode(Engine *engine, const char *wson_string, char **error);

#endif // WSON_H
