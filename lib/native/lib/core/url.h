/**
 * @file url.h
 * @brief Provides functions for URL parsing, decoding, and route matching.
 */

#ifndef URL_H
#define URL_H

#include "../core/error.h"
#include "../core/value.h"

/**
 * @brief Decodes a URL-encoded string (query string or full URL) into a
 * `Value`.
 *
 * For a query string, it produces an object. For a full URL, it produces an
 * object with keys like `scheme`, `host`, `path`, `query`, etc.
 * @param url_string The string to decode.
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A new `Value` (typically an object) representing the parsed data, or
 * NULL on error.
 */
Value *url_decode(const char *url_string, Status *status);

/**
 * @brief Matches a URL path against a route pattern and extracts parameters.
 *
 * The pattern can contain dynamic segments like `[id]` and catch-all segments
 * like `[...filepath]`.
 * @param pattern The route pattern.
 * @param path The URL path to match against the pattern.
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A `Value` object containing the extracted parameters, an empty object
 * for a static match, or NULL if there is no match or an error occurs.
 */
Value *url_match_route(const char *pattern, const char *path, Status *status);

#endif // URL_H
