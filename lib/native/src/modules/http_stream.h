#ifndef HTTP_STREAM_H
#define HTTP_STREAM_H

#include <stddef.h>

typedef struct {
  int client_fd;
} HttpStream;

void http_stream_begin(HttpStream *stream, int client_fd, int status_code,
                       const char *content_type);
void http_stream_write_chunk(HttpStream *stream, const char *data, size_t len);
void http_stream_end(HttpStream *stream);

#endif
