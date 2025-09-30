/**
 * @file asset.h
 * @brief Defines the asset walker used by the bundler.
 *
 * The asset walker is responsible for parsing a single file (like JS or .webs),
 * identifying its dependencies (e.g., `import` statements), and extracting
 * metadata.
 */

#ifndef ASSET_H
#define ASSET_H

#include "../core/value.h"

/**
 * @enum AssetType
 * @brief Enumerates the types of assets the bundler can recognize.
 */
typedef enum {
  ASSET_JS,
  ASSET_CSS,
  ASSET_HTML,
  ASSET_WEBS,
  ASSET_UNKNOWN
} AssetType;

/**
 * @brief Walks a single asset file to extract its metadata and dependencies.
 * @param file_path The path to the asset file.
 * @param[out] error A pointer to a char pointer that will be set on failure.
 * @return A JSON string containing the asset's info (type, path, dependencies,
 * exports). The caller is responsible for freeing this string.
 */
char *walk_asset(const char *file_path, char **error);

#endif // ASSET_H
