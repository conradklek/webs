#include "event.h"
#include "array.h"
#include "object.h"
#include <stdio.h>
#include <string.h>

void event_dispatch(Event *event) {
  if (!event || !event->target)
    return;

  DomNode *current_target = event->target;

  while (current_target) {
    if (!current_target->event_listeners ||
        current_target->event_listeners->type != VALUE_OBJECT) {
      current_target = current_target->parent;
      continue;
    }

    Object *listeners_obj = current_target->event_listeners->as.object_val;
    Value *listeners_for_type = listeners_obj->get(listeners_obj, event->type);

    if (listeners_for_type && listeners_for_type->type == VALUE_ARRAY) {
      Array *listeners_array = listeners_for_type->as.array_val;
      for (size_t i = 0; i < listeners_array->count; i++) {
        Value *listener = listeners_array->elements[i];

        if (listener && listener->type == VALUE_POINTER) {
          void (*callback)(void) = (void (*)(void))listener->as.pointer_val;
          if (callback) {
            callback();
          }
        }
      }
    }
    current_target = current_target->parent;
  }
}
