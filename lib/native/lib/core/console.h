/**
 * @file console.h
 * @brief Defines a simple logging interface for the Webs framework.
 */

#ifndef CONSOLE_H
#define CONSOLE_H

#include <stdarg.h>

/**
 * @enum LogLevel
 * @brief Defines the different levels of logging severity.
 */
typedef enum {
  LOG_LEVEL_DEBUG,
  LOG_LEVEL_INFO,
  LOG_LEVEL_WARN,
  LOG_LEVEL_ERROR,
  LOG_LEVEL_NONE
} LogLevel;

typedef struct Console Console;

/**
 * @struct Console
 * @brief A struct containing function pointers for logging at different levels.
 */
struct Console {
  LogLevel level;
  void (*set_level)(Console *self, LogLevel level);
  void (*log)(Console *self, const char *format, ...);
  void (*info)(Console *self, const char *format, ...);
  void (*warn)(Console *self, const char *format, ...);
  void (*error)(Console *self, const char *format, ...);
  void (*debug)(Console *self, const char *format, ...);
};

/**
 * @brief Gets the global singleton console instance.
 * @return A pointer to the global `Console` struct.
 */
Console *console();

/**
 * @brief Logs a formatted message at a specific level.
 * @param level The log level for the message.
 * @param format The printf-style format string.
 * @param args The va_list of arguments.
 */
void webs_log_message(LogLevel level, const char *format, va_list args);

#endif // CONSOLE_H
