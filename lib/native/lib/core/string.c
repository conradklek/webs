#include "string.h"
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

Value *string_value(const char *s) {
  const char *input = s ? s : "";
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_STRING;
  val->as.string = string(input);
  if (!val->as.string) {
    free(val);
    return NULL;
  }
  return val;
}

String *string(const char *s) {
  const char *input = s ? s : "";
  String *string = malloc(sizeof(String));
  if (!string)
    return NULL;
  string->length = strlen(input);
  string->chars = malloc(string->length + 1);
  if (!string->chars) {
    free(string);
    return NULL;
  }
  memcpy(string->chars, input, string->length + 1);
  return string;
}

void string_free(String *string) {
  if (!string)
    return;
  free(string->chars);
  free(string);
}

char *string_trim_start(const char *str) {
  if (!str)
    return NULL;
  while (*str && isspace((unsigned char)*str)) {
    str++;
  }
  return strdup(str);
}

char *string_trim_end(const char *str) {
  if (!str)
    return NULL;

  char *copy = strdup(str);
  if (!copy)
    return NULL;

  char *end = copy + strlen(copy) - 1;
  while (end >= copy && isspace((unsigned char)*end)) {
    end--;
  }
  *(end + 1) = '\0';
  return copy;
}

char *string_trim(const char *str) {
  if (!str)
    return NULL;

  const char *start = str;
  while (*start && isspace((unsigned char)*start)) {
    start++;
  }

  const char *end = str + strlen(str) - 1;
  while (end >= start && isspace((unsigned char)*end)) {
    end--;
  }

  size_t len = (end < start) ? 0 : (end - start) + 1;

  char *trimmed = malloc(len + 1);
  if (!trimmed)
    return NULL;

  strncpy(trimmed, start, len);
  trimmed[len] = '\0';

  return trimmed;
}

/**
 * Splits a string by a delimiter.
 * The caller is responsible for freeing the returned array and its contents
 * using `free_string_array`.
 */
char **string_split(const char *str, const char *delimiter, int *count) {
  *count = 0;
  if (!str)
    return NULL;

  const char *p = str;
  int occurrences = 0;
  while ((p = strstr(p, delimiter))) {
    occurrences++;
    p += strlen(delimiter);
  }

  char **result = malloc(sizeof(char *) * (occurrences + 1));
  if (!result)
    return NULL;

  *count = occurrences + 1;
  char *str_copy = strdup(str);
  char *token = strtok(str_copy, delimiter);
  int i = 0;
  while (token != NULL) {
    result[i++] = strdup(token);
    token = strtok(NULL, delimiter);
  }
  free(str_copy);
  return result;
}

/**
 * Checks if a string starts with a given prefix.
 */
bool string_starts_with(const char *str, const char *prefix) {
  if (!str || !prefix)
    return false;
  return strncmp(prefix, str, strlen(prefix)) == 0;
}

/**
 * Finds the first index of a substring.
 */
int string_index_of(const char *str, const char *substring) {
  if (!str || !substring)
    return -1;
  const char *p = strstr(str, substring);
  return p ? (int)(p - str) : -1;
}

/**
 * Extracts a slice of a string. Handles negative indices like JavaScript.
 */
char *string_slice(const char *str, int start, int end) {
  if (!str)
    return NULL;
  int len = strlen(str);

  if (start < 0)
    start = len + start;
  if (end < 0)
    end = len + end;
  if (start < 0)
    start = 0;
  if (end > len)
    end = len;
  if (start >= end)
    return strdup("");

  int slice_len = end - start;
  char *slice = malloc(slice_len + 1);
  if (!slice)
    return NULL;
  strncpy(slice, str + start, slice_len);
  slice[slice_len] = '\0';
  return slice;
}

/**
 * Replaces all occurrences of a substring with a replacement string.
 */
char *string_replace(const char *str, const char *search, const char *replace) {
  if (!str || !search || !replace)
    return NULL;

  const char *p = str;
  int count = 0;
  while ((p = strstr(p, search))) {
    count++;
    p += strlen(search);
  }

  int result_len = strlen(str) + count * (strlen(replace) - strlen(search)) + 1;
  char *result = malloc(result_len);
  if (!result)
    return NULL;

  char *current = result;
  p = str;
  while (*p) {
    if (strstr(p, search) == p) {
      strcpy(current, replace);
      current += strlen(replace);
      p += strlen(search);
    } else {
      *current++ = *p++;
    }
  }
  *current = '\0';
  return result;
}

/**
 * Compares two strings lexicographically.
 */
int string_compare(const char *s1, const char *s2) {
  if (!s1 && !s2)
    return 0;
  if (!s1)
    return -1;
  if (!s2)
    return 1;
  while (*s1 && (*s1 == *s2)) {
    s1++;
    s2++;
  }
  return *(const unsigned char *)s1 - *(const unsigned char *)s2;
}

/**
 * Helper function to free the array returned by string_split.
 */
void free_string_array(char **arr, int count) {
  if (!arr)
    return;
  for (int i = 0; i < count; i++) {
    free(arr[i]);
  }
  free(arr);
}
