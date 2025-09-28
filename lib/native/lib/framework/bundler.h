#ifndef BUNDLER_H
#define BUNDLER_H

#include "../core/error.h"

Status webs_bundle_directory(const char *input_dir, const char *output_dir,
                             char **error);

#endif
