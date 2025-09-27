#include "object.h"
#include <stdlib.h>

static Status object_set_method(Object *self, const char *key, Value *value);
static Value *object_get_method(const Object *self, const char *key);

Value *object_value(void) {
  Value *val = malloc(sizeof(Value));
  if (!val)
    return NULL;
  val->type = VALUE_OBJECT;
  val->as.object_val = object();
  if (!val->as.object_val) {
    free(val);
    return NULL;
  }
  return val;
}

Object *object(void) {
  Object *object = malloc(sizeof(Object));
  if (!object)
    return NULL;
  object->map = map(8);
  if (!object->map) {
    free(object);
    return NULL;
  }
  object->set = object_set_method;
  object->get = object_get_method;
  return object;
}

void object_free(Object *object) {
  if (!object)
    return;
  map_free(object->map);
  free(object);
}

static Status object_set_method(Object *self, const char *key, Value *value) {
  if (!self || !key) {
    return ERROR_INVALID_ARG;
  }
  return self->map->set(self->map, key, value);
}

static Value *object_get_method(const Object *self, const char *key) {
  if (!self || !key) {
    return NULL;
  }
  return self->map->get(self->map, key);
}
