#include "repl.h"
#include "terminal.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <unistd.h>

#define MAX_LINE_LENGTH 1024
#define INITIAL_HISTORY_CAPACITY 16
#define INITIAL_COMMAND_CAPACITY 8

struct Repl {
  char *prompt;

  char line_buffer[MAX_LINE_LENGTH];
  int buffer_len;
  int cursor_pos;

  char **history;
  int history_capacity;
  int history_count;
  int history_index;

  ReplCommand *commands;
  int command_count;
  int command_capacity;

  struct termios orig_termios;
  bool raw_mode_enabled;
};

static Repl *g_active_repl = NULL;

static void die(const char *s) {
  write(STDOUT_FILENO, "\x1b[2J", 4);
  write(STDOUT_FILENO, "\x1b[H", 3);
  perror(s);
  exit(1);
}

static void disable_raw_mode_on_exit() {
  if (g_active_repl && g_active_repl->raw_mode_enabled) {
    tcsetattr(STDIN_FILENO, TCSAFLUSH, &g_active_repl->orig_termios);
    g_active_repl->raw_mode_enabled = false;
  }
}

static void enable_raw_mode(Repl *repl) {
  if (tcgetattr(STDIN_FILENO, &repl->orig_termios) == -1)
    die("tcgetattr");
  atexit(disable_raw_mode_on_exit);

  struct termios raw = repl->orig_termios;
  raw.c_lflag &= ~(ECHO | ICANON | IEXTEN | ISIG);
  raw.c_iflag &= ~(IXON | ICRNL);
  raw.c_oflag &= ~(OPOST);
  raw.c_cflag |= (CS8);
  raw.c_cc[VMIN] = 0;
  raw.c_cc[VTIME] = 1;

  if (tcsetattr(STDIN_FILENO, TCSAFLUSH, &raw) == -1)
    die("tcsetattr");
  repl->raw_mode_enabled = true;
}

Repl *repl_new(const char *prompt) {
  Repl *repl = calloc(1, sizeof(Repl));
  if (!repl)
    return NULL;

  repl->prompt = strdup(prompt);
  repl->history_capacity = INITIAL_HISTORY_CAPACITY;
  repl->history = malloc(sizeof(char *) * repl->history_capacity);
  repl->command_capacity = INITIAL_COMMAND_CAPACITY;
  repl->commands = malloc(sizeof(ReplCommand) * repl->command_capacity);

  if (!repl->prompt || !repl->history || !repl->commands) {
    free(repl->prompt);
    free(repl->history);
    free(repl->commands);
    free(repl);
    return NULL;
  }

  g_active_repl = repl;
  return repl;
}

void repl_free(Repl *repl) {
  if (!repl)
    return;
  for (int i = 0; i < repl->history_count; i++) {
    free(repl->history[i]);
  }
  free(repl->history);
  free(repl->commands);
  free(repl->prompt);
  free(repl);
  g_active_repl = NULL;
}

void repl_add_command(Repl *repl, const char *name, const char *description,
                      ReplCommandFunc handler) {
  if (repl->command_count >= repl->command_capacity) {
    repl->command_capacity *= 2;
    repl->commands =
        realloc(repl->commands, sizeof(ReplCommand) * repl->command_capacity);
    if (!repl->commands)
      die("realloc commands");
  }
  repl->commands[repl->command_count++] =
      (ReplCommand){name, description, handler};
}

static void add_history(Repl *repl, const char *line) {
  if (repl->history_count > 0 &&
      strcmp(repl->history[repl->history_count - 1], line) == 0) {
    return;
  }
  if (repl->history_count >= repl->history_capacity) {
    repl->history_capacity *= 2;
    repl->history =
        realloc(repl->history, sizeof(char *) * repl->history_capacity);
    if (!repl->history)
      die("realloc history");
  }
  repl->history[repl->history_count++] = strdup(line);
}

static void refresh_line(Repl *repl) {
  char buf[256];
  char prompt_buf[128];
  snprintf(prompt_buf, sizeof(prompt_buf), T_BLUE T_BOLD "%s" T_RESET,
           repl->prompt);

  snprintf(buf, sizeof(buf), "\r\x1b[K%s%s", prompt_buf, repl->line_buffer);
  write(STDOUT_FILENO, buf, strlen(buf));

  snprintf(buf, sizeof(buf), "\r\x1b[%luC",
           strlen(repl->prompt) + repl->cursor_pos);
  write(STDOUT_FILENO, buf, strlen(buf));
}

static void insert_char(Repl *repl, char c) {
  if (repl->buffer_len < MAX_LINE_LENGTH - 1) {
    memmove(&repl->line_buffer[repl->cursor_pos + 1],
            &repl->line_buffer[repl->cursor_pos],
            repl->buffer_len - repl->cursor_pos);
    repl->line_buffer[repl->cursor_pos] = c;
    repl->buffer_len++;
    repl->cursor_pos++;
    repl->line_buffer[repl->buffer_len] = '\0';
  }
}

static void delete_char(Repl *repl) {
  if (repl->cursor_pos > 0) {
    memmove(&repl->line_buffer[repl->cursor_pos - 1],
            &repl->line_buffer[repl->cursor_pos],
            repl->buffer_len - repl->cursor_pos);
    repl->buffer_len--;
    repl->cursor_pos--;
    repl->line_buffer[repl->buffer_len] = '\0';
  }
}

static int parse_and_execute(Repl *repl, char *line) {
  int argc = 0;
  char *argv[64];
  char *token = strtok(line, " \t\r\n");
  while (token != NULL && argc < 63) {
    argv[argc++] = token;
    token = strtok(NULL, " \t\r\n");
  }
  argv[argc] = NULL;

  if (argc == 0)
    return 0;

  for (int i = 0; i < repl->command_count; i++) {
    if (strcmp(argv[0], repl->commands[i].name) == 0) {
      return repl->commands[i].handler(repl, argc, argv);
    }
  }

  term_print_colored(T_YELLOW, "\nwebs: command not found: %s\r\n", argv[0]);
  return 0;
}

static bool process_keypress(Repl *repl) {
  char c;
  if (read(STDIN_FILENO, &c, 1) != 1)
    return true;

  switch (c) {
  case '\r':
  case '\n':
    if (repl->buffer_len > 0) {
      add_history(repl, repl->line_buffer);
      char line_copy[MAX_LINE_LENGTH];
      strcpy(line_copy, repl->line_buffer);
      if (parse_and_execute(repl, line_copy) == -1) {
        printf("\r\n");
        return false;
      }
    } else {
      printf("\r\n");
    }
    repl->history_index = -1;
    repl->buffer_len = 0;
    repl->cursor_pos = 0;
    repl->line_buffer[0] = '\0';
    break;

  case 127:
    delete_char(repl);
    break;

  case 3:
  case 4:
    printf("\r\n");
    return false;

  case '\x1b': {
    char seq[3];
    if (read(STDIN_FILENO, &seq[0], 1) != 1)
      return true;
    if (read(STDIN_FILENO, &seq[1], 1) != 1)
      return true;

    if (seq[0] == '[') {
      switch (seq[1]) {
      case 'A':
        if (repl->history_count > 0) {
          if (repl->history_index == -1) {
            repl->history_index = repl->history_count - 1;
          } else if (repl->history_index > 0) {
            repl->history_index--;
          }
          strcpy(repl->line_buffer, repl->history[repl->history_index]);
          repl->buffer_len = strlen(repl->line_buffer);
          repl->cursor_pos = repl->buffer_len;
        }
        break;
      case 'B':
        if (repl->history_index != -1) {
          if (repl->history_index < repl->history_count - 1) {
            repl->history_index++;
            strcpy(repl->line_buffer, repl->history[repl->history_index]);
          } else {
            repl->history_index = -1;
            repl->line_buffer[0] = '\0';
          }
          repl->buffer_len = strlen(repl->line_buffer);
          repl->cursor_pos = repl->buffer_len;
        }
        break;
      case 'C':
        if (repl->cursor_pos < repl->buffer_len) {
          repl->cursor_pos++;
        }
        break;
      case 'D':
        if (repl->cursor_pos > 0) {
          repl->cursor_pos--;
        }
        break;
      }
    }
    break;
  }

  default:
    if (isprint(c)) {
      insert_char(repl, c);
    }
    break;
  }
  return true;
}

void repl_run(Repl *repl) {
  enable_raw_mode(repl);

  while (true) {
    refresh_line(repl);
    if (!process_keypress(repl)) {
      break;
    }
  }

  disable_raw_mode_on_exit();
}

int repl_get_command_count(const Repl *repl) {
  if (!repl)
    return 0;
  return repl->command_count;
}

const ReplCommand *repl_get_command(const Repl *repl, int index) {
  if (!repl || index < 0 || index >= repl->command_count) {
    return NULL;
  }
  return &repl->commands[index];
}
