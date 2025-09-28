#ifndef HTTP_STREAM_H
#define HTTP_STREAM_H

#include <stddef.h>

void http_stream_begin(int client_fd, int status_code,
                       const char *content_type);

void http_stream_write_chunk(int client_fd, const char *data, size_t len);

void http_stream_end(int client_fd);

#endif
