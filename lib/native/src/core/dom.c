#include "dom.h"
#include "array.h"
#include "null.h"
#include "object.h"
#include "pointer.h"
#include "string.h"
#include <ctype.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

DomNode *dom_create_element(const char *tag_name) {
  DomNode *node = calloc(1, sizeof(DomNode));
  if (!node)
    return NULL;

  node->tag_name = strdup(tag_name);
  node->attributes = object_value();
  node->children = array_value();
  node->event_listeners = object_value();
  return node;
}

DomNode *dom_create_text_node(const char *text_content) {
  DomNode *node = dom_create_element("#text");
  if (node) {
    node->attributes->as.object_val->set(node->attributes->as.object_val,
                                         "textContent",
                                         string_value(text_content));
  }
  return node;
}

void dom_free_node(DomNode *node) {
  if (!node)
    return;

  free(node->tag_name);
  value_free(node->attributes);
  value_free(node->event_listeners);

  Value *children_to_free = node->children;
  node->children = NULL;

  if (children_to_free && children_to_free->type == VALUE_ARRAY) {
    for (size_t i = 0; i < children_to_free->as.array_val->count; i++) {
      Value *child_ptr_val = children_to_free->as.array_val->elements[i];
      if (child_ptr_val && child_ptr_val->type == VALUE_POINTER) {
        dom_free_node((DomNode *)child_ptr_val->as.pointer_val);
      }
    }
  }
  value_free(children_to_free);
  free(node);
}

void dom_append_child(DomNode *parent, DomNode *child) {
  if (!parent || !child)
    return;
  child->parent = parent;
  parent->children->as.array_val->push(parent->children->as.array_val,
                                       pointer(child));
}

void dom_set_attribute(DomNode *node, const char *key, Value *value) {
  if (!node || !key)
    return;
  if (node->attributes && node->attributes->type == VALUE_OBJECT) {
    node->attributes->as.object_val->set(node->attributes->as.object_val, key,
                                         value);
  } else {
    if (value)
      value_free(value);
  }
}

static bool node_matches_selector(DomNode *node, const char *selector) {
  if (!node || !selector || !node->tag_name)
    return false;

  const char *s = selector;
  if (*s == '#') {
    Value *id_attr = node->attributes->as.object_val->get(
        node->attributes->as.object_val, "id");
    return id_attr && id_attr->type == VALUE_STRING &&
           strcmp(id_attr->as.string_val->chars, s + 1) == 0;
  } else if (*s == '.') {
    Value *class_attr = node->attributes->as.object_val->get(
        node->attributes->as.object_val, "class");
    if (class_attr && class_attr->type == VALUE_STRING) {
      const char *class_list = class_attr->as.string_val->chars;
      const char *class_name = s + 1;
      size_t class_len = strlen(class_name);
      const char *found = strstr(class_list, class_name);
      while (found) {
        bool start_ok = (found == class_list) || isspace(*(found - 1));
        bool end_ok = (found[class_len] == '\0') || isspace(found[class_len]);
        if (start_ok && end_ok)
          return true;
        found = strstr(found + 1, class_name);
      }
    }
    return false;
  } else {
    return strcmp(node->tag_name, s) == 0;
  }
}

static void find_all_nodes(DomNode *start_node, const char *selector,
                           Value *results_array) {
  if (!start_node)
    return;

  if (node_matches_selector(start_node, selector)) {
    results_array->as.array_val->push(results_array->as.array_val,
                                      pointer(start_node));
  }

  if (start_node->children && start_node->children->type == VALUE_ARRAY) {
    for (size_t i = 0; i < start_node->children->as.array_val->count; i++) {
      Value *child_ptr = start_node->children->as.array_val->elements[i];
      find_all_nodes((DomNode *)child_ptr->as.pointer_val, selector,
                     results_array);
    }
  }
}

Value *dom_query_selector(DomNode *root, const char *selector) {
  Value *results = array_value();
  find_all_nodes(root, selector, results);

  if (results->as.array_val->count > 0) {
    Value *first_match = value_clone(results->as.array_val->elements[0]);
    value_free(results);
    return first_match;
  }

  value_free(results);
  return null();
}

Value *dom_query_selector_all(DomNode *root, const char *selector) {
  Value *results = array_value();
  find_all_nodes(root, selector, results);
  return results;
}

void dom_add_event_listener(DomNode *node, const char *event_type,
                            Value *listener) {
  if (!node || !event_type || !listener)
    return;

  Object *listeners_obj = node->event_listeners->as.object_val;
  Value *listeners_for_type = listeners_obj->get(listeners_obj, event_type);

  if (!listeners_for_type) {
    listeners_for_type = array_value();
    listeners_obj->set(listeners_obj, event_type, listeners_for_type);
  }

  listeners_for_type->as.array_val->push(listeners_for_type->as.array_val,
                                         value_clone(listener));
}
