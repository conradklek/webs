#include "http_stream.h"
#include <stdio.h>
#include <string.h>
#include <unistd.h>

void http_stream_begin(int client_fd, int status_code,
                       const char *content_type) {
  char header_buffer[256];
  int len = snprintf(header_buffer, sizeof(header_buffer),
                     "HTTP/1.1 %d OK\r\n"
                     "Content-Type: %s\r\n"
                     "Transfer-Encoding: chunked\r\n"
                     "Connection: close\r\n\r\n",
                     status_code, content_type);
  if (len > 0) {
    write(client_fd, header_buffer, len);
  }
}

void http_stream_write_chunk(int client_fd, const char *data, size_t len) {
  if (len == 0)
    return;
  char chunk_header[16];
  int header_len = snprintf(chunk_header, sizeof(chunk_header), "%zx\r\n", len);
  if (header_len > 0) {
    write(client_fd, chunk_header, header_len);
    write(client_fd, data, len);
    write(client_fd, "\r\n", 2);
  }
}

void http_stream_end(int client_fd) {
  const char *end_chunk = "0\r\n\r\n";
  write(client_fd, end_chunk, strlen(end_chunk));
}
