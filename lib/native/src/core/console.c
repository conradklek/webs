#include "console.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

#define C_RESET "\x1B[0m"
#define C_RED "\x1B[31m"
#define C_GREEN "\x1B[32m"
#define C_YELLOW "\x1B[33m"
#define C_BLUE "\x1B[34m"
#define C_GRAY "\x1B[90m"

static Console global_console_instance;
static bool console_initialized = false;

static void console_set_level_method(Console *self, LogLevel level);
static void console_log_method(Console *self, const char *format, ...);
static void console_info_method(Console *self, const char *format, ...);
static void console_warn_method(Console *self, const char *format, ...);
static void console_error_method(Console *self, const char *format, ...);
static void console_debug_method(Console *self, const char *format, ...);

static void log_message(LogLevel level, Console *console, const char *color,
                        const char *prefix, const char *format, va_list args) {
  if (!console || console->level > level) {
    return;
  }
  fprintf(stderr, "%s%s: ", color, prefix);
  vfprintf(stderr, format, args);
  fprintf(stderr, "%s\n", C_RESET);
}

void webs_log_message(LogLevel level, const char *format, va_list args) {
  if (!console_initialized)
    return;

  const char *color = C_RESET;
  const char *prefix = "";

  switch (level) {
  case LOG_LEVEL_DEBUG:
    color = C_GRAY;
    prefix = "DEBUG";
    break;
  case LOG_LEVEL_INFO:
    color = C_BLUE;
    prefix = "INFO";
    break;
  case LOG_LEVEL_WARN:
    color = C_YELLOW;
    prefix = "WARN";
    break;
  case LOG_LEVEL_ERROR:
    color = C_RED;
    prefix = "ERROR";
    break;
  default:
    break;
  }
  log_message(level, &global_console_instance, color, prefix, format, args);
}

Console *console() {
  if (!console_initialized) {
    global_console_instance.level = LOG_LEVEL_INFO;
    global_console_instance.set_level = console_set_level_method;
    global_console_instance.log = console_log_method;
    global_console_instance.info = console_info_method;
    global_console_instance.warn = console_warn_method;
    global_console_instance.error = console_error_method;
    global_console_instance.debug = console_debug_method;
    console_initialized = true;
  }
  return &global_console_instance;
}

void console_destroy(Console *c) {
  // No-op for global instance
}

static void console_set_level_method(Console *self, LogLevel level) {
  if (self) {
    self->level = level;
  }
}

static void console_log_method(Console *self, const char *format, ...) {
  va_list args;
  va_start(args, format);
  webs_log_message(LOG_LEVEL_INFO, format, args);
  va_end(args);
}

static void console_info_method(Console *self, const char *format, ...) {
  va_list args;
  va_start(args, format);
  webs_log_message(LOG_LEVEL_INFO, format, args);
  va_end(args);
}

static void console_warn_method(Console *self, const char *format, ...) {
  va_list args;
  va_start(args, format);
  webs_log_message(LOG_LEVEL_WARN, format, args);
  va_end(args);
}

static void console_error_method(Console *self, const char *format, ...) {
  va_list args;
  va_start(args, format);
  webs_log_message(LOG_LEVEL_ERROR, format, args);
  va_end(args);
}

static void console_debug_method(Console *self, const char *format, ...) {
  va_list args;
  va_start(args, format);
  webs_log_message(LOG_LEVEL_DEBUG, format, args);
  va_end(args);
}
