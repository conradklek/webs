#ifndef ERROR_H
#define ERROR_H

typedef enum {
  OK,
  ERROR,
  ERROR_MEMORY,
  ERROR_IO,
  ERROR_PARSE,
  ERROR_NOT_FOUND,
  ERROR_INVALID_ARG,
  ERROR_INVALID_STATE
} Status;

const char *webs_status_to_string(Status status);

#endif
