#ifndef OBJECT_H
#define OBJECT_H

#include "map.h"
#include "value.h"

typedef struct Object Object;

struct Object {
  Map *map;
  Status (*set)(Object *self, const char *key, Value *value);
  Value *(*get)(const Object *self, const char *key);
};

Value *object_value(void);
Object *object(void);
void object_free(Object *object);

#endif
