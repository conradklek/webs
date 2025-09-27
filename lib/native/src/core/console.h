#ifndef CONSOLE_H
#define CONSOLE_H

#include <stdarg.h>

typedef enum {
  LOG_LEVEL_DEBUG,
  LOG_LEVEL_INFO,
  LOG_LEVEL_WARN,
  LOG_LEVEL_ERROR,
  LOG_LEVEL_NONE
} LogLevel;

typedef struct Console Console;

struct Console {
  LogLevel level;
  void (*set_level)(Console *self, LogLevel level);
  void (*log)(Console *self, const char *format, ...);
  void (*info)(Console *self, const char *format, ...);
  void (*warn)(Console *self, const char *format, ...);
  void (*error)(Console *self, const char *format, ...);
  void (*debug)(Console *self, const char *format, ...);
};

Console *console();
void console_destroy(Console *console);
void webs_log_message(LogLevel level, const char *format, va_list args);

#endif
