/**
 * @file repl.h
 * @brief Defines the interface for an interactive Read-Eval-Print Loop (REPL).
 *
 * This is used by the command-line tool to provide an interactive shell.
 */

#ifndef REPL_H
#define REPL_H

#include <stdbool.h>

typedef struct Repl Repl;

/**
 * @brief Function pointer type for a command handler in the REPL.
 * @param repl The active REPL instance.
 * @param argc The number of arguments.
 * @param argv An array of argument strings.
 * @return 0 to continue the REPL, or -1 to exit.
 */
typedef int (*ReplCommandFunc)(Repl *repl, int argc, char **argv);

/**
 * @struct ReplCommand
 * @brief Represents a command that can be executed in the REPL.
 */
typedef struct {
  const char *name;
  const char *description;
  ReplCommandFunc handler;
} ReplCommand;

/**
 * @brief Creates a new REPL instance.
 * @param prompt The prompt string to display to the user.
 * @return A new `Repl` instance, or NULL on failure.
 */
Repl *repl_new(const char *prompt);

/**
 * @brief Frees all resources associated with a REPL instance.
 * @param repl The REPL to free.
 */
void repl_free(Repl *repl);

/**
 * @brief Adds a new command to the REPL.
 * @param repl The REPL instance.
 * @param name The command's name.
 * @param description The command's description.
 * @param handler The function to handle the command.
 */
void repl_add_command(Repl *repl, const char *name, const char *description,
                      ReplCommandFunc handler);

/**
 * @brief Starts the REPL's main loop. This is a blocking call.
 * @param repl The REPL instance to run.
 */
void repl_run(Repl *repl);

/**
 * @brief Gets the total number of registered commands.
 * @param repl The REPL instance.
 * @return The number of commands.
 */
int repl_get_command_count(const Repl *repl);

/**
 * @brief Retrieves a command by its index.
 * @param repl The REPL instance.
 * @param index The index of the command.
 * @return A pointer to the `ReplCommand`, or NULL if the index is invalid.
 */
const ReplCommand *repl_get_command(const Repl *repl, int index);

#endif // REPL_H
