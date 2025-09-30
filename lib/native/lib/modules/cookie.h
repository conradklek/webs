#ifndef COOKIE_H
#define COOKIE_H

#include "../core/value.h"

/**
 * @brief Parses a 'Cookie' header string into a Value object.
 * @param cookie_header The raw string from the Cookie HTTP header.
 * @return A new `Value` of type `VALUE_OBJECT` mapping cookie names to values.
 */
Value *cookie_parse(const char *cookie_header);

/**
 * @brief Serializes a cookie name, value, and options into a 'Set-Cookie'
 * header string.
 * @param name The name of the cookie.
 * @param value The value of the cookie.
 * @param options A `Value` object with options (e.g., HttpOnly, Path, Max-Age).
 * @return A new, heap-allocated string for the 'Set-Cookie' header.
 */
char *cookie_serialize(const char *name, const char *value, Value *options);

#endif // COOKIE_H
