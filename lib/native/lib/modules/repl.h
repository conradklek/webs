#ifndef REPL_H
#define REPL_H

#include <stdbool.h>

typedef struct Repl Repl;

typedef int (*ReplCommandFunc)(Repl *repl, int argc, char **argv);

typedef struct {
  const char *name;
  const char *description;
  ReplCommandFunc handler;
} ReplCommand;

Repl *repl_new(const char *prompt);

void repl_free(Repl *repl);

void repl_add_command(Repl *repl, const char *name, const char *description,
                      ReplCommandFunc handler);
void repl_run(Repl *repl);

int repl_get_command_count(const Repl *repl);

const ReplCommand *repl_get_command(const Repl *repl, int index);

#endif
