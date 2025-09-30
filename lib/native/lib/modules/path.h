/**
 * @file path.h
 * @brief Provides cross-platform path manipulation utilities.
 */

#ifndef PATH_H
#define PATH_H

#include <stddef.h>

/**
 * @brief Resolves a relative path against a base path to get an absolute path.
 *
 * It combines a base path (like a file's location) with a relative path
 * (like an import specifier) to produce a canonical, absolute path.
 *
 * @param base_path The absolute path of the containing file or directory.
 * @param relative_path The relative path to resolve.
 * @return A new, heap-allocated string containing the resolved absolute path.
 * The caller is responsible for freeing this string. Returns NULL on failure.
 */
char *path_resolve(const char *base_path, const char *relative_path);

/**
 * @brief Extracts the directory name component of a path.
 *
 * Similar to the `dirname` utility.
 *
 * @param path The full path from which to extract the directory.
 * @return A new, heap-allocated string containing the directory name.
 * The caller is responsible for freeing this string. Returns NULL on failure.
 */
char *path_dirname(const char *path);

#endif // PATH_H
