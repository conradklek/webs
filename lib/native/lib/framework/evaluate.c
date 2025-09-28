#include "evaluate.h"
#include "../core/array.h"
#include "../core/boolean.h"
#include "../core/number.h"
#include "../core/object.h"
#include "../core/string.h"
#include "../core/undefined.h"
#include "../core/value.h"
#include <math.h>
#include <stdbool.h>
#include <stdio.h>
#include <string.h>

static Value *evaluate_node(const Value *node, const Value *scope);

static bool is_truthy(const Value *value) {
  if (!value)
    return false;
  switch (value->type) {
  case VALUE_NULL:
  case VALUE_UNDEFINED:
    return false;
  case VALUE_BOOL:
    return value->as.boolean;
  case VALUE_NUMBER:
    return value->as.number != 0;
  case VALUE_STRING:
    return value->as.string && value->as.string->length > 0;
  case VALUE_OBJECT:
  case VALUE_ARRAY:
    return true;
  default:
    return false;
  }
}

static Value *evaluate_literal(const Value *node, const Value *scope) {
  const Value *literal_value = node->as.object->get(node->as.object, "value");
  return value_clone(literal_value);
}

static Value *evaluate_identifier(const Value *node, const Value *scope) {
  const char *name =
      node->as.object->get(node->as.object, "name")->as.string->chars;
  if (scope && scope->type == VALUE_OBJECT) {
    Value *result = scope->as.object->get(scope->as.object, name);
    if (result) {
      return value_clone(result);
    }
  }
  return undefined();
}

static Value *evaluate_binary_expression(const Value *node,
                                         const Value *scope) {
  const Object *node_obj = node->as.object;
  const char *op = node_obj->get(node_obj, "operator")->as.string->chars;

  const Value *left_node = node_obj->get(node_obj, "left");
  Value *left = evaluate_node(left_node, scope);

  if (strcmp(op, "&&") == 0) {
    if (!is_truthy(left))
      return left;
    value_free(left);
    const Value *right_node = node_obj->get(node_obj, "right");
    return evaluate_node(right_node, scope);
  }
  if (strcmp(op, "||") == 0) {
    if (is_truthy(left))
      return left;
    value_free(left);
    const Value *right_node = node_obj->get(node_obj, "right");
    return evaluate_node(right_node, scope);
  }
  if (strcmp(op, "??") == 0) {
    if (left && left->type != VALUE_NULL && left->type != VALUE_UNDEFINED)
      return left;
    if (left)
      value_free(left);
    const Value *right_node = node_obj->get(node_obj, "right");
    return evaluate_node(right_node, scope);
  }

  const Value *right_node = node_obj->get(node_obj, "right");
  Value *right = evaluate_node(right_node, scope);

  Value *result = NULL;

  if (!left || !right) {
    if (left)
      value_free(left);
    if (right)
      value_free(right);
    return undefined();
  }

  if (left->type == VALUE_NUMBER && right->type == VALUE_NUMBER) {
    double l = left->as.number;
    double r = right->as.number;
    if (strcmp(op, "+") == 0)
      result = number(l + r);
    else if (strcmp(op, "-") == 0)
      result = number(l - r);
    else if (strcmp(op, "*") == 0)
      result = number(l * r);
    else if (strcmp(op, "/") == 0)
      result = number(l / r);
    else if (strcmp(op, "%") == 0)
      result = number(fmod(l, r));
    else if (strcmp(op, ">") == 0)
      result = boolean(l > r);
    else if (strcmp(op, "<") == 0)
      result = boolean(l < r);
    else if (strcmp(op, ">=") == 0)
      result = boolean(l >= r);
    else if (strcmp(op, "<=") == 0)
      result = boolean(l <= r);
  }

  if (strcmp(op, "==") == 0 || strcmp(op, "===") == 0) {
    result = boolean(value_equals(left, right));
  } else if (strcmp(op, "!=") == 0 || strcmp(op, "!==") == 0) {
    result = boolean(!value_equals(left, right));
  }

  value_free(left);
  value_free(right);

  return result ? result : undefined();
}

static Value *evaluate_unary_expression(const Value *node, const Value *scope) {
  const Object *node_obj = node->as.object;
  const char *op = node_obj->get(node_obj, "operator")->as.string->chars;
  const Value *argument_node = node_obj->get(node_obj, "argument");
  Value *argument = evaluate_node(argument_node, scope);
  if (!argument) {
    return undefined();
  }

  Value *result = NULL;
  if (strcmp(op, "!") == 0) {
    result = boolean(!is_truthy(argument));
  } else if (strcmp(op, "-") == 0) {
    if (argument->type == VALUE_NUMBER) {
      result = number(-argument->as.number);
    }
  }

  value_free(argument);
  return result ? result : undefined();
}

static Value *evaluate_member_expression(const Value *node,
                                         const Value *scope) {
  const Object *node_obj = node->as.object;
  const Value *object_node = node_obj->get(node_obj, "object");
  const Value *property_node = node_obj->get(node_obj, "property");

  Value *object = evaluate_node(object_node, scope);

  if (!object) {
    return undefined();
  }

  if (object->type != VALUE_OBJECT) {
    const Value *is_optional = node_obj->get(node_obj, "optional");
    if (is_optional && is_optional->as.boolean &&
        (object->type == VALUE_NULL || object->type == VALUE_UNDEFINED)) {
      value_free(object);
      return undefined();
    }
    value_free(object);
    return undefined();
  }

  const char *prop_name =
      property_node->as.object->get(property_node->as.object, "name")
          ->as.string->chars;
  Value *result = object->as.object->get(object->as.object, prop_name);

  Value *cloned_result = result ? value_clone(result) : undefined();

  value_free(object);
  return cloned_result;
}

static Value *evaluate_computed_member_expression(const Value *node,
                                                  const Value *scope) {
  const Object *node_obj = node->as.object;
  const Value *object_node = node_obj->get(node_obj, "object");
  const Value *property_node = node_obj->get(node_obj, "property");

  Value *object = evaluate_node(object_node, scope);
  Value *property = evaluate_node(property_node, scope);

  if (!object || !property) {
    if (object)
      value_free(object);
    if (property)
      value_free(property);
    return undefined();
  }

  Value *result = NULL;

  if (object->type == VALUE_ARRAY && property->type == VALUE_NUMBER) {
    size_t index = (size_t)property->as.number;
    Value *item = array_get(object->as.array, index);
    if (item) {
      result = value_clone(item);
    }
  } else if (object->type == VALUE_OBJECT && property->type == VALUE_STRING) {
    Value *item =
        object->as.object->get(object->as.object, property->as.string->chars);
    if (item) {
      result = value_clone(item);
    }
  }

  value_free(object);
  value_free(property);

  return result ? result : undefined();
}

static Value *evaluate_conditional_expression(const Value *node,
                                              const Value *scope) {
  const Object *node_obj = node->as.object;
  const Value *test_node = node_obj->get(node_obj, "test");
  const Value *consequent_node = node_obj->get(node_obj, "consequent");
  const Value *alternate_node = node_obj->get(node_obj, "alternate");

  Value *test_result = evaluate_node(test_node, scope);
  bool truthy = is_truthy(test_result);
  value_free(test_result);

  if (truthy) {
    return evaluate_node(consequent_node, scope);
  } else {
    return evaluate_node(alternate_node, scope);
  }
}

static Value *evaluate_array_literal(const Value *node, const Value *scope) {
  const Value *elements_ast = node->as.object->get(node->as.object, "elements");
  if (!elements_ast || elements_ast->type != VALUE_ARRAY) {
    return undefined();
  }

  Value *result_array = array_value();
  if (!result_array) {
    return undefined();
  }

  for (size_t i = 0; i < elements_ast->as.array->count; i++) {
    const Value *element_ast = elements_ast->as.array->elements[i];
    Value *element_value = evaluate_node(element_ast, scope);
    if (!element_value) {
      element_value = undefined();
    }
    result_array->as.array->push(result_array->as.array, element_value);
  }

  return result_array;
}

static Value *evaluate_object_literal(const Value *node, const Value *scope) {
  const Value *properties_ast =
      node->as.object->get(node->as.object, "properties");
  if (!properties_ast || properties_ast->type != VALUE_ARRAY) {
    return undefined();
  }

  Value *result_object = object_value();
  if (!result_object) {
    return undefined();
  }

  for (size_t i = 0; i < properties_ast->as.array->count; i++) {
    const Value *prop_ast = properties_ast->as.array->elements[i];
    const Object *prop_obj = prop_ast->as.object;
    const Value *key_ast = prop_obj->get(prop_obj, "key");
    const Value *value_ast = prop_obj->get(prop_obj, "value");

    const char *key_str = NULL;
    const Object *key_ast_obj = key_ast->as.object;
    const Value *key_ast_type = key_ast_obj->get(key_ast_obj, "type");
    const char *key_type_str = key_ast_type->as.string->chars;

    if (strcmp(key_type_str, "Identifier") == 0) {
      key_str = key_ast_obj->get(key_ast_obj, "name")->as.string->chars;
    } else if (strcmp(key_type_str, "Literal") == 0) {
      const Value *literal_val = key_ast_obj->get(key_ast_obj, "value");
      if (literal_val->type == VALUE_STRING) {
        key_str = literal_val->as.string->chars;
      }
    }

    if (key_str) {
      Value *prop_value = evaluate_node(value_ast, scope);
      if (!prop_value) {
        prop_value = undefined();
      }
      result_object->as.object->set(result_object->as.object, key_str,
                                    prop_value);
    }
  }

  return result_object;
}

static Value *evaluate_node(const Value *node, const Value *scope) {
  if (!node || node->type != VALUE_OBJECT)
    return NULL;

  const Value *type_value = node->as.object->get(node->as.object, "type");
  if (!type_value || type_value->type != VALUE_STRING)
    return NULL;

  const char *type = type_value->as.string->chars;

  if (strcmp(type, "Literal") == 0) {
    return evaluate_literal(node, scope);
  }
  if (strcmp(type, "Identifier") == 0) {
    return evaluate_identifier(node, scope);
  }
  if (strcmp(type, "BinaryExpression") == 0) {
    return evaluate_binary_expression(node, scope);
  }
  if (strcmp(type, "UnaryExpression") == 0) {
    return evaluate_unary_expression(node, scope);
  }
  if (strcmp(type, "MemberExpression") == 0) {
    return evaluate_member_expression(node, scope);
  }
  if (strcmp(type, "ComputedMemberExpression") == 0) {
    return evaluate_computed_member_expression(node, scope);
  }
  if (strcmp(type, "ConditionalExpression") == 0) {
    return evaluate_conditional_expression(node, scope);
  }
  if (strcmp(type, "ArrayLiteral") == 0) {
    return evaluate_array_literal(node, scope);
  }
  if (strcmp(type, "ObjectLiteral") == 0) {
    return evaluate_object_literal(node, scope);
  }

  return undefined();
}

Value *evaluate_expression(const Value *node, const Value *scope) {
  return evaluate_node(node, scope);
}
