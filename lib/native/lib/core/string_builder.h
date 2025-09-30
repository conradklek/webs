/**
 * @file string_builder.h
 * @brief Defines a simple, dynamic string builder utility.
 */

#ifndef STRING_BUILDER_H
#define STRING_BUILDER_H

#include <stddef.h>

/**
 * @struct StringBuilder
 * @brief A structure for efficiently building strings.
 */
typedef struct {
  char *buffer;
  size_t length;
  size_t capacity;
} StringBuilder;

/**
 * @brief Initializes a StringBuilder with a default capacity.
 * @param sb Pointer to the StringBuilder to initialize.
 */
void sb_init(StringBuilder *sb);

/**
 * @brief Appends a C string to the StringBuilder.
 * @param sb Pointer to the StringBuilder.
 * @param str The null-terminated string to append.
 */
void sb_append_str(StringBuilder *sb, const char *str);

/**
 * @brief Appends a single character to the StringBuilder.
 * @param sb Pointer to the StringBuilder.
 * @param c The character to append.
 */
void sb_append_char(StringBuilder *sb, char c);

/**
 * @brief Appends a string to the StringBuilder, escaping HTML special
 * characters.
 * @param sb Pointer to the StringBuilder.
 * @param text The text to append and escape.
 */
void sb_append_html_escaped(StringBuilder *sb, const char *text);

/**
 * @brief Converts the StringBuilder to a new, heap-allocated string.
 *
 * This function transfers ownership of the buffer to the caller. The
 * StringBuilder is reset and should not be used further unless re-initialized.
 * @param sb Pointer to the StringBuilder.
 * @return A new, null-terminated string that the caller must free.
 */
char *sb_to_string(StringBuilder *sb);

/**
 * @brief Frees the internal buffer of the StringBuilder without returning it.
 * @param sb Pointer to the StringBuilder.
 */
void sb_free(StringBuilder *sb);

#endif // STRING_BUILDER_H
