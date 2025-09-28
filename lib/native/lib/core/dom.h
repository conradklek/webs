#ifndef DOM_H
#define DOM_H

#include "value.h"

typedef struct DomNode {
  char *tag_name;
  Value *attributes;
  struct DomNode *parent;
  Value *children;
  Value *event_listeners;
} DomNode;

DomNode *dom_create_element(const char *tag_name);
DomNode *dom_create_text_node(const char *text_content);
void dom_free_node(DomNode *node);
void dom_append_child(DomNode *parent, DomNode *child);
void dom_set_attribute(DomNode *node, const char *key, Value *value);

Value *dom_query_selector(DomNode *root, const char *selector);
Value *dom_query_selector_all(DomNode *root, const char *selector);

void dom_add_event_listener(DomNode *node, const char *event_type,
                            Value *listener);

#endif
