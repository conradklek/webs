#ifndef TERMINAL_H
#define TERMINAL_H

#include <stdio.h>

#define T_RESET "\x1B[0m"
#define T_RED "\x1B[31m"
#define T_GREEN "\x1B[32m"
#define T_YELLOW "\x1B[33m"
#define T_BLUE "\x1B[34m"
#define T_GRAY "\x1B[90m"
#define T_BOLD "\x1B[1m"

void term_fprint_colored(FILE *stream, const char *color, const char *format,
                         ...);

void term_print_colored(const char *color, const char *format, ...);

#endif
