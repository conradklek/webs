/**
 * @file fetch.h
 * @brief Defines an HTTP client interface similar to the web Fetch API.
 */

#ifndef FETCH_H
#define FETCH_H

#include "../framework/reactivity.h"
#include "value.h"

/**
 * @brief Performs a synchronous HTTP request.
 * @param url The URL to request.
 * @param options_json A JSON string with options (e.g., method, body, headers).
 * @param[out] error A pointer to a char pointer that will be set to an error
 * message on failure.
 * @return A JSON string representing the response (status, headers, body), or
 * NULL on failure.
 */
char *webs_fetch_sync(const char *url, const char *options_json, char **error);

#endif // FETCH_H
