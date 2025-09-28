#include "../lib/modules/repl.h"
#include "../lib/modules/terminal.h"
#include "../lib/webs_api.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int handle_build(Repl *repl, int argc, char **argv) {
  (void)repl;

  const WebsApi *w = webs();

  if (argc != 3) {
    term_fprint_colored(
        stderr, T_YELLOW,
        "\nUsage: build <input_directory> <output_directory>\r\n");
    return 0;
  }
  const char *input_dir = argv[1];
  const char *output_dir = argv[2];

  term_print_colored(T_BLUE, "\nBundling project from '%s' into '%s'...\r\n",
                     input_dir, output_dir);

  char *error = w->bundle(input_dir, output_dir);

  if (error != NULL) {
    term_fprint_colored(stderr, T_RED, "Build failed: %s\r\n", error);
    w->freeString(error);
    return 0;
  }
  term_print_colored(T_GREEN, "Build successful!\r\n");
  return 0;
}

static int handle_pretty(Repl *repl, int argc, char **argv) {
  (void)repl;
  const WebsApi *w = webs();

  if (argc < 2) {
    term_fprint_colored(stderr, T_YELLOW, "\nUsage: pretty <json_string>\r\n");
    return 0;
  }

  size_t total_len = 0;
  for (int i = 1; i < argc; i++) {
    total_len += strlen(argv[i]);
  }
  if (argc > 2) {
    total_len += argc - 2;
  }
  total_len += 1;

  char *json_string = malloc(total_len);
  if (!json_string) {
    term_fprint_colored(stderr, T_RED, "Memory allocation failed.\n");
    return 0;
  }

  char *p = json_string;
  for (int i = 1; i < argc; i++) {
    size_t len = strlen(argv[i]);
    memcpy(p, argv[i], len);
    p += len;
    if (i < argc - 1) {
      *p++ = ' ';
    }
  }
  *p = '\0';

  size_t len = strlen(json_string);
  if (len > 1 && json_string[0] == '\'' && json_string[len - 1] == '\'') {
    json_string[len - 1] = '\0';
    memmove(json_string, json_string + 1, len - 1);
  }

  Status status;
  Value *json_value = w->json->parse(json_string, &status);
  free(json_string);

  if (status != OK) {
    term_fprint_colored(stderr, T_RED, "\nInvalid JSON provided.\r\n");
    if (json_value)
      w->freeValue(json_value);
    return 0;
  }

  char *pretty_json = w->json->prettyPrint(json_value);
  w->freeValue(json_value);

  if (pretty_json) {
    printf("\r\n%s\r\n", pretty_json);
    w->freeString(pretty_json);
  }

  return 0;
}

static int handle_help(Repl *repl, int argc, char **argv) {
  (void)argc;
  (void)argv;
  int max_len = 0;
  for (int i = 0; i < repl_get_command_count(repl); i++) {
    const ReplCommand *cmd = repl_get_command(repl, i);
    if (cmd) {
      int len = strlen(cmd->name);
      if (len > max_len) {
        max_len = len;
      }
    }
  }

  printf("\r\n" T_BOLD "Webs CLI Tool" T_RESET "\r\n\nAvailable commands:\r\n");
  for (int i = 0; i < repl_get_command_count(repl); i++) {
    const ReplCommand *cmd = repl_get_command(repl, i);
    if (cmd) {
      printf("  " T_GREEN "%-*s" T_RESET "  %s\r\n", max_len, cmd->name,
             cmd->description);
    }
  }
  printf("\n" T_GRAY "Use Ctrl-C or type 'exit' to quit." T_RESET "\r\n");
  return 0;
}

static int handle_exit(Repl *repl, int argc, char **argv) {
  (void)repl;
  (void)argc;
  (void)argv;
  return -1;
}

int main(int argc, char *argv[]) {
  Repl *repl = repl_new("webs> ");
  if (!repl) {
    term_fprint_colored(stderr, T_RED, "Failed to initialize REPL.\n");
    return 1;
  }

  repl_add_command(repl, "build", "Bundle a .webs project.", handle_build);
  repl_add_command(repl, "pretty", "Pretty-print a JSON string with colors.",
                   handle_pretty);
  repl_add_command(repl, "help", "Show this help message.", handle_help);
  repl_add_command(repl, "exit", "Exit the interactive shell.", handle_exit);

  repl_run(repl);

  repl_free(repl);

  return 0;
}
