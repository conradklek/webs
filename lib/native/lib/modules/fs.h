/**
 * @file fs.h
 * @brief Defines the file system interface for the Webs framework.
 *
 * This header provides synchronous functions for interacting with the file
 * system, such as reading, writing, and deleting files, as well as handling
 * directories. Functions that can fail return a Status and provide error
 * details via a JSON string.
 */

#ifndef FS_H
#define FS_H

#include "../core/error.h"
#include <stdbool.h>

/**
 * @brief Reads the entire content of a file into a string.
 * @param path The path to the file.
 * @param[out] out_content A pointer to a char pointer that will be set to
 * the file's content on success.
 * @return OK on success, or an error Status on failure.
 * @note Caller must free the string returned in out_content.
 */
Status read_file_sync(const char *path, char **out_content);

/**
 * @brief Writes content to a file, overwriting it if it exists or creating it
 * if not.
 * @param path The path to the file.
 * @param content The null-terminated string content to write.
 * @return OK on success, or an error Status on failure.
 */
Status write_file_sync(const char *path, const char *content);

/**
 * @brief Checks if a file or directory exists at the given path.
 * @param path The path to check.
 * @return `true` if the path exists, `false` otherwise.
 */
bool file_exists_sync(const char *path);

/**
 * @brief Deletes a file.
 * @param path The path to the file to delete.
 * @return OK on success, or an error Status on failure (e.g., if it's a
 * directory).
 */
Status delete_file_sync(const char *path);

/**
 * @brief Creates a directory.
 * @param path The path of the directory to create.
 * @return OK on success (or if it already exists), or an error Status on
 * failure.
 */
Status create_dir_sync(const char *path);

/**
 * @brief Recursively deletes a directory and its contents.
 * @param path The path of the directory to delete.
 * @return OK on success, or an error Status on failure.
 */
Status delete_dir_sync(const char *path);

/**
 * @brief Lists the contents of a directory.
 * @param path The path of the directory to list.
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A JSON array string of the directory's contents, or NULL on failure.
 * @note Caller must free the returned string.
 */
char *list_dir_sync(const char *path, Status *status);

/**
 * @brief Renames or moves a file or directory.
 * @param old_path The current path.
 * @param new_path The new path.
 * @return OK on success, or an error Status on failure.
 */
Status rename_sync(const char *old_path, const char *new_path);

/**
 * @brief Gets file status information (like size, type).
 * @param path The path to the file or directory.
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A JSON object string with stat info, or NULL on failure.
 * @note Caller must free the returned string.
 */
char *stat_sync(const char *path, Status *status);

/**
 * @brief Finds pathnames matching a specified pattern.
 * @param pattern The glob pattern to match.
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A JSON array string of matching paths, or NULL on failure.
 * @note Caller must free the returned string.
 */
char *glob_sync(const char *pattern, Status *status);

#endif // FS_H
