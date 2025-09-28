#include "terminal.h"
#include <stdarg.h>

void term_fprint_colored(FILE *stream, const char *color, const char *format,
                         ...) {
  va_list args;
  va_start(args, format);
  fprintf(stream, "%s", color);
  vfprintf(stream, format, args);
  fprintf(stream, "%s", T_RESET);
  va_end(args);
}

void term_print_colored(const char *color, const char *format, ...) {
  va_list args;
  va_start(args, format);
  printf("%s", color);
  vprintf(format, args);
  printf("%s", T_RESET);
  va_end(args);
}
