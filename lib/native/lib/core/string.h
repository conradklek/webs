/**
 * @file string.h
 * @brief Defines the String type and string utility functions.
 */

#ifndef STRING_H
#define STRING_H

#include "value.h"

/**
 * @struct String
 * @brief A simple length-prefixed string structure.
 */
typedef struct String {
  char *chars;
  size_t length;
} String;

/**
 * @brief Creates a new `Value` of type `VALUE_STRING`.
 * @param s The null-terminated C string to wrap.
 * @return A new string `Value`, or NULL on allocation failure.
 * @note The caller is responsible for freeing the returned Value.
 */
Value *string_value(const char *s);

/**
 * @brief Creates a new heap-allocated `String` struct.
 * @param s The null-terminated C string to copy.
 * @return A new `String` object, or NULL on allocation failure.
 * @note The caller is responsible for freeing the returned String.
 */
String *string(const char *s);

/**
 * @brief Frees a `String` struct and its character buffer.
 * @param string The `String` to free.
 */
void string_free(String *string);

/**
 * @brief Trims leading whitespace from a string.
 * @param str The string to trim.
 * @return A new, heap-allocated string with leading whitespace removed.
 * @note The caller must free this string.
 */
char *string_trim_start(const char *str);

/**
 * @brief Trims trailing whitespace from a string.
 * @param str The string to trim.
 * @return A new, heap-allocated string with trailing whitespace removed.
 * @note The caller must free this string.
 */
char *string_trim_end(const char *str);

/**
 * @brief Trims both leading and trailing whitespace from a string.
 * @param str The string to trim.
 * @return A new, heap-allocated string with whitespace removed from both ends.
 * @note The caller must free this string.
 */
char *string_trim(const char *str);

/**
 * @brief Splits a string by a delimiter.
 * @return An array of new, heap-allocated strings.
 * @note The caller is responsible for freeing the returned array and its
 * contents using `free_string_array`.
 */
char **string_split(const char *str, const char *delimiter, int *count);

bool string_starts_with(const char *str, const char *prefix);
int string_index_of(const char *str, const char *substring);

/**
 * @brief Extracts a slice of a string.
 * @return A new, heap-allocated string representing the slice.
 * @note The caller must free this string.
 */
char *string_slice(const char *str, int start, int end);

/**
 * @brief Replaces all occurrences of a substring with a replacement string.
 * @return A new, heap-allocated string with the replacements.
 * @note The caller must free this string.
 */
char *string_replace(const char *str, const char *search, const char *replace);

/**
 * @brief Compares two strings lexicographically.
 * @param s1 The first string.
 * @param s2 The second string.
 * @return < 0 if s1 < s2, 0 if s1 == s2, > 0 if s1 > s2.
 */
int string_compare(const char *s1, const char *s2);

void free_string_array(char **arr, int count);

#endif // STRING_H
