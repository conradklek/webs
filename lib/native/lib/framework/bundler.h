/**
 * @file bundler.h
 * @brief Defines the project bundler.
 *
 * The bundler traverses the dependency graph starting from an entry file,
 * processes each asset, and concatenates them into final output bundles
 * (e.g., a single JavaScript file and a single CSS file).
 */

#ifndef BUNDLER_H
#define BUNDLER_H

#include "../core/error.h"

/**
 * @brief Bundles a project from a given entry file.
 *
 * This function builds a dependency graph, performs a topological sort, and
 * concatenates the assets into `bundle.js` and `bundle.css` in the output
 * directory.
 *
 * @param entry_file The path to the main entry file of the project.
 * @param output_dir The path to the directory where bundles will be written.
 * @param[out] error A pointer to a char pointer that will be set on failure.
 * @return OK on success, or an error Status on failure.
 * @note If an error occurs and `error` is not NULL, a new error string will be
 * allocated. The caller is responsible for freeing this string.
 */
Status webs_bundle_from_entry(const char *entry_file, const char *output_dir,
                              char **error);

#endif // BUNDLER_H
