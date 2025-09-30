#include "path.h"
#include <libgen.h>
#include <limits.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

char *path_resolve(const char *base_path, const char *relative_path) {
  if (!base_path || !relative_path)
    return NULL;

  if (relative_path[0] == '/') {
    return strdup(relative_path);
  }

  char *base_dir = path_dirname(base_path);
  if (!base_dir)
    return NULL;

  char resolved_path[PATH_MAX];
  snprintf(resolved_path, PATH_MAX, "%s/%s", base_dir, relative_path);

  free(base_dir);

  char real_path_buf[PATH_MAX];
  if (realpath(resolved_path, real_path_buf) != NULL) {
    return strdup(real_path_buf);
  }

  return strdup(resolved_path);
}

char *path_dirname(const char *path) {
  char *path_copy = strdup(path);
  if (!path_copy)
    return NULL;

  char *dir = dirname(path_copy);
  char *result = strdup(dir);

  free(path_copy);
  return result;
}
