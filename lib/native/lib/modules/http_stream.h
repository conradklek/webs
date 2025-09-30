/**
 * @file http_stream.h
 * @brief Provides functions for sending chunked HTTP responses.
 *
 * This allows for sending large responses without knowing the total content
 * length in advance.
 */

#ifndef HTTP_STREAM_H
#define HTTP_STREAM_H

#include <stddef.h>

/**
 * @brief Sends the initial HTTP headers for a chunked response.
 * @param client_fd The client's socket file descriptor.
 * @param status_code The HTTP status code (e.g., 200).
 * @param content_type The MIME type of the response (e.g., "text/plain").
 */
void http_stream_begin(int client_fd, int status_code,
                       const char *content_type);

/**
 * @brief Writes a single chunk of data as part of a chunked response.
 * @param client_fd The client's socket file descriptor.
 * @param data A pointer to the data to send.
 * @param len The length of the data in bytes.
 */
void http_stream_write_chunk(int client_fd, const char *data, size_t len);

/**
 * @brief Sends the final zero-length chunk to terminate the response stream.
 * @param client_fd The client's socket file descriptor.
 */
void http_stream_end(int client_fd);

#endif // HTTP_STREAM_H
