#include "error.h"

const char *webs_status_to_string(Status status) {
  switch (status) {
  case OK:
    return "Success";
  case ERROR:
    return "Generic error";
  case ERROR_MEMORY:
    return "Memory allocation error";
  case ERROR_IO:
    return "I/O error";
  case ERROR_PARSE:
    return "Parsing error";
  case ERROR_NOT_FOUND:
    return "Not found";
  case ERROR_INVALID_ARG:
    return "Invalid argument";
  case ERROR_INVALID_STATE:
    return "Invalid state";
  default:
    return "Unknown error";
  }
}
