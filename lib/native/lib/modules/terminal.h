/**
 * @file terminal.h
 * @brief Provides utilities for colorized terminal output.
 */

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

/**
 * @brief Prints a formatted, colored string to a specified file stream.
 * @param stream The stream to print to (e.g., `stdout`, `stderr`).
 * @param color The ANSI color code string.
 * @param format The printf-style format string.
 * @param ... Variable arguments for the format string.
 */
void term_fprint_colored(FILE *stream, const char *color, const char *format,
                         ...);

/**
 * @brief Prints a formatted, colored string to stdout.
 * @param color The ANSI color code string.
 * @param format The printf-style format string.
 * @param ... Variable arguments for the format string.
 */
void term_print_colored(const char *color, const char *format, ...);

#endif // TERMINAL_H
