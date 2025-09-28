#include "fs.h"
#include "../core/array.h"
#include "../core/boolean.h"
#include "../core/json.h"
#include "../core/number.h"
#include "../core/object.h"
#include "../core/string.h"
#include "../core/value.h"
#include <dirent.h>
#include <errno.h>
#include <glob.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <unistd.h>

char *read_file_sync(const char *path, Status *status) {
  FILE *file = NULL;
  char *buffer = NULL;
  *status = OK;

  if (!path) {
    *status = ERROR_INVALID_ARG;
    return NULL;
  }

  file = fopen(path, "rb");
  if (!file) {
    *status = ERROR_IO;
    goto cleanup;
  }

  fseek(file, 0, SEEK_END);
  long length = ftell(file);
  fseek(file, 0, SEEK_SET);

  if (length < 0) {
    *status = ERROR_IO;
    goto cleanup;
  }

  buffer = malloc(length + 1);
  if (!buffer) {
    *status = ERROR_MEMORY;
    goto cleanup;
  }

  if (length > 0 && fread(buffer, 1, length, file) != (size_t)length) {
    *status = ERROR_IO;
    goto cleanup;
  }

  buffer[length] = '\0';

cleanup:
  if (file) {
    fclose(file);
  }
  if (*status != OK && buffer) {
    free(buffer);
    buffer = NULL;
  }
  return buffer;
}

Status write_file_sync(const char *path, const char *content) {
  FILE *file = NULL;
  Status status = OK;

  if (!path || !content) {
    return ERROR_INVALID_ARG;
  }

  file = fopen(path, "wb");
  if (!file) {
    status = ERROR_IO;
    goto cleanup;
  }

  size_t content_len = strlen(content);
  size_t written_len = fwrite(content, 1, content_len, file);

  if (written_len != content_len) {
    status = ERROR_IO;
  }

cleanup:
  if (file) {
    fclose(file);
  }
  return status;
}

bool file_exists_sync(const char *path) { return access(path, F_OK) == 0; }

Status delete_file_sync(const char *path) {
  struct stat statbuf;
  if (stat(path, &statbuf) == 0) {
    if (S_ISDIR(statbuf.st_mode)) {
      return ERROR_INVALID_ARG;
    }
  }

  if (remove(path) != 0) {
    return ERROR_IO;
  }

  return OK;
}

Status create_dir_sync(const char *path) {
  if (mkdir(path, 0777) != 0) {
    if (errno == EEXIST) {
      return OK;
    }
    return ERROR_IO;
  }
  return OK;
}

Status delete_dir_sync(const char *path) {
  DIR *dir = NULL;
  char *full_path = NULL;
  Status status = OK;

  dir = opendir(path);
  if (!dir) {
    return ERROR_IO;
  }

  struct dirent *entry;
  while ((entry = readdir(dir)) != NULL) {
    if (strcmp(entry->d_name, ".") == 0 || strcmp(entry->d_name, "..") == 0) {
      continue;
    }

    size_t full_path_len = strlen(path) + 1 + strlen(entry->d_name) + 1;
    full_path = malloc(full_path_len);
    if (!full_path) {
      status = ERROR_MEMORY;
      goto cleanup;
    }
    snprintf(full_path, full_path_len, "%s/%s", path, entry->d_name);

    struct stat statbuf;
    if (stat(full_path, &statbuf) != 0) {
      status = ERROR_IO;
      goto cleanup;
    }

    if (S_ISDIR(statbuf.st_mode)) {
      status = delete_dir_sync(full_path);
    } else {
      if (remove(full_path) != 0) {
        status = ERROR_IO;
      }
    }
    free(full_path);
    full_path = NULL;

    if (status != OK) {
      goto cleanup;
    }
  }

  if (rmdir(path) != 0) {
    status = ERROR_IO;
  }

cleanup:
  if (dir) {
    closedir(dir);
  }
  if (full_path) {
    free(full_path);
  }
  return status;
}

char *list_dir_sync(const char *path, Status *status) {
  DIR *dir = NULL;
  Value *arr = NULL;
  char *json_string = NULL;
  *status = OK;

  dir = opendir(path);
  if (!dir) {
    *status = ERROR_IO;
    goto cleanup;
  }

  arr = array_value();
  if (!arr) {
    *status = ERROR_MEMORY;
    goto cleanup;
  }

  struct dirent *entry;
  while ((entry = readdir(dir)) != NULL) {
    if (strcmp(entry->d_name, ".") != 0 && strcmp(entry->d_name, "..") != 0) {
      arr->as.array->push(arr->as.array, string_value(entry->d_name));
    }
  }

  json_string = json_encode(arr);
  if (!json_string) {
    *status = ERROR_MEMORY;
  }

cleanup:
  if (dir) {
    closedir(dir);
  }
  if (arr) {
    value_free(arr);
  }
  if (*status != OK && json_string) {
    free(json_string);
    json_string = NULL;
  }
  return json_string;
}

Status rename_sync(const char *old_path, const char *new_path) {
  if (rename(old_path, new_path) != 0) {
    return ERROR_IO;
  }
  return OK;
}

char *stat_sync(const char *path, Status *status) {
  Value *obj = NULL;
  char *json_string = NULL;
  *status = OK;

  struct stat statbuf;
  if (stat(path, &statbuf) != 0) {
    *status = ERROR_IO;
    goto cleanup;
  }

  obj = object_value();
  if (!obj) {
    *status = ERROR_MEMORY;
    goto cleanup;
  }

  Object *obj_val = obj->as.object;
  obj_val->set(obj_val, "size", number((double)statbuf.st_size));
  obj_val->set(obj_val, "isFile", boolean(S_ISREG(statbuf.st_mode)));
  obj_val->set(obj_val, "isDirectory", boolean(S_ISDIR(statbuf.st_mode)));

  json_string = json_encode(obj);
  if (!json_string) {
    *status = ERROR_MEMORY;
  }

cleanup:
  if (obj) {
    value_free(obj);
  }
  if (*status != OK && json_string) {
    free(json_string);
    json_string = NULL;
  }
  return json_string;
}

char *glob_sync(const char *pattern, Status *status) {
  glob_t glob_result;
  memset(&glob_result, 0, sizeof(glob_result));
  *status = OK;

  int return_value = glob(pattern, GLOB_TILDE, NULL, &glob_result);

  if (return_value != 0) {
    globfree(&glob_result);
    if (return_value == GLOB_NOMATCH) {
      return strdup("[]");
    }
    *status = ERROR_IO;
    return NULL;
  }

  Value *results = array_value();
  if (!results) {
    *status = ERROR_MEMORY;
    globfree(&glob_result);
    return NULL;
  }

  for (size_t i = 0; i < glob_result.gl_pathc; i++) {
    Value *path_val = string_value(glob_result.gl_pathv[i]);
    if (!path_val) {
      *status = ERROR_MEMORY;
      value_free(results);
      globfree(&glob_result);
      return NULL;
    }
    results->as.array->push(results->as.array, path_val);
  }

  char *json_string = json_encode(results);
  value_free(results);
  globfree(&glob_result);

  if (!json_string) {
    *status = ERROR_MEMORY;
    return NULL;
  }

  return json_string;
}
