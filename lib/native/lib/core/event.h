#ifndef EVENT_H
#define EVENT_H

#include "dom.h"
#include "value.h"

typedef struct {
  const char *type;
  DomNode *target;
  Value *detail;
} Event;

void event_dispatch(Event *event);

#endif
