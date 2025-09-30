/**
 * @file http.h
 * @brief Defines the HTTP request parser.
 *
 * This module is responsible for parsing a raw HTTP request string into a
 * structured `Value` object.
 */

#ifndef HTTP_H
#define HTTP_H

#include "../core/error.h"
#include "../core/value.h"

/**
 * @brief Parses a raw HTTP request string into a structured `Value`.
 *
 * The resulting object will have keys such as "method", "path", "version",
 * "query", "headers" (as a nested object), and "body".
 *
 * @param raw_request The null-terminated string containing the raw HTTP
 * request.
 * @param[out] error A pointer to a char pointer that will be set to an error
 * message on failure.
 * @return A new object `Value` representing the parsed request, or NULL on
 * parsing failure.
 */
Value *webs_http_parse_request(const char *raw_request, char **error);

#endif // HTTP_H
