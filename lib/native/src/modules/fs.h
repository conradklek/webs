#ifndef FS_H
#define FS_H

#include "../core/error.h"
#include <stdbool.h>

char *read_file_sync(const char *path, Status *status);
Status write_file_sync(const char *path, const char *content);
bool file_exists_sync(const char *path);
Status delete_file_sync(const char *path);
Status create_dir_sync(const char *path);
Status delete_dir_sync(const char *path);
char *list_dir_sync(const char *path, Status *status);
Status rename_sync(const char *old_path, const char *new_path);
char *stat_sync(const char *path, Status *status);
char *glob_sync(const char *pattern, Status *status);

#endif
