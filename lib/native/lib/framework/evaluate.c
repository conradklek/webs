#include "evaluate.h"
#include "../core/string.h"
#include "../core/value.h"
#include "../webs_api.h"
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
  const Value *literal_value = W->objectGetRef(node, "value");
  return W->valueClone(literal_value);
}

static Value *evaluate_identifier(const Value *node, const Value *scope) {
  const char *name = W->valueAsString(W->objectGetRef(node, "name"));
  if (scope && W->valueGetType(scope) == VALUE_OBJECT) {
    Value *result = W->objectGetRef(scope, name);
    if (result) {
      return W->valueClone(result);
    }
  }
  return W->undefined();
}

static Value *evaluate_binary_expression(const Value *node,
                                         const Value *scope) {
  const char *op = W->valueAsString(W->objectGetRef(node, "operator"));

  const Value *left_node = W->objectGetRef(node, "left");
  Value *left = evaluate_node(left_node, scope);

  if (strcmp(op, "&&") == 0) {
    if (!is_truthy(left))
      return left;
    W->freeValue(left);
    const Value *right_node = W->objectGetRef(node, "right");
    return evaluate_node(right_node, scope);
  }
  if (strcmp(op, "||") == 0) {
    if (is_truthy(left))
      return left;
    W->freeValue(left);
    const Value *right_node = W->objectGetRef(node, "right");
    return evaluate_node(right_node, scope);
  }
  if (strcmp(op, "??") == 0) {
    if (left && W->valueGetType(left) != VALUE_NULL &&
        W->valueGetType(left) != VALUE_UNDEFINED)
      return left;
    if (left)
      W->freeValue(left);
    const Value *right_node = W->objectGetRef(node, "right");
    return evaluate_node(right_node, scope);
  }

  const Value *right_node = W->objectGetRef(node, "right");
  Value *right = evaluate_node(right_node, scope);

  Value *result = NULL;

  if (!left || !right) {
    if (left)
      W->freeValue(left);
    if (right)
      W->freeValue(right);
    return W->undefined();
  }

  if (W->valueGetType(left) == VALUE_NUMBER &&
      W->valueGetType(right) == VALUE_NUMBER) {
    double l = W->valueAsNumber(left);
    double r = W->valueAsNumber(right);
    if (strcmp(op, "+") == 0)
      result = W->number(l + r);
    else if (strcmp(op, "-") == 0)
      result = W->number(l - r);
    else if (strcmp(op, "*") == 0)
      result = W->number(l * r);
    else if (strcmp(op, "/") == 0)
      result = W->number(l / r);
    else if (strcmp(op, "%") == 0)
      result = W->number(fmod(l, r));
    else if (strcmp(op, ">") == 0)
      result = W->boolean(l > r);
    else if (strcmp(op, "<") == 0)
      result = W->boolean(l < r);
    else if (strcmp(op, ">=") == 0)
      result = W->boolean(l >= r);
    else if (strcmp(op, "<=") == 0)
      result = W->boolean(l <= r);
  }

  if (strcmp(op, "==") == 0 || strcmp(op, "===") == 0) {
    result = W->boolean(W->valueEquals(left, right));
  } else if (strcmp(op, "!=") == 0 || strcmp(op, "!==") == 0) {
    result = W->boolean(!W->valueEquals(left, right));
  }

  W->freeValue(left);
  W->freeValue(right);

  return result ? result : W->undefined();
}

static Value *evaluate_unary_expression(const Value *node, const Value *scope) {
  const char *op = W->valueAsString(W->objectGetRef(node, "operator"));
  const Value *argument_node = W->objectGetRef(node, "argument");
  Value *argument = evaluate_node(argument_node, scope);
  if (!argument) {
    return W->undefined();
  }

  Value *result = NULL;
  if (strcmp(op, "!") == 0) {
    result = W->boolean(!is_truthy(argument));
  } else if (strcmp(op, "-") == 0) {
    if (W->valueGetType(argument) == VALUE_NUMBER) {
      result = W->number(-W->valueAsNumber(argument));
    }
  }

  W->freeValue(argument);
  return result ? result : W->undefined();
}

static Value *evaluate_member_expression(const Value *node,
                                         const Value *scope) {
  const Value *object_node = W->objectGetRef(node, "object");
  const Value *property_node = W->objectGetRef(node, "property");

  Value *object = evaluate_node(object_node, scope);

  if (!object) {
    return W->undefined();
  }

  if (W->valueGetType(object) != VALUE_OBJECT) {
    const Value *is_optional = W->objectGetRef(node, "optional");
    if (is_optional && W->valueAsBool(is_optional) &&
        (W->valueGetType(object) == VALUE_NULL ||
         W->valueGetType(object) == VALUE_UNDEFINED)) {
      W->freeValue(object);
      return W->undefined();
    }
    W->freeValue(object);
    return W->undefined();
  }

  const char *prop_name =
      W->valueAsString(W->objectGetRef(property_node, "name"));
  Value *result = W->objectGetRef(object, prop_name);

  Value *cloned_result = result ? W->valueClone(result) : W->undefined();

  W->freeValue(object);
  return cloned_result;
}

static Value *evaluate_computed_member_expression(const Value *node,
                                                  const Value *scope) {
  const Value *object_node = W->objectGetRef(node, "object");
  const Value *property_node = W->objectGetRef(node, "property");

  Value *object = evaluate_node(object_node, scope);
  Value *property = evaluate_node(property_node, scope);

  if (!object || !property) {
    if (object)
      W->freeValue(object);
    if (property)
      W->freeValue(property);
    return W->undefined();
  }

  Value *result = NULL;

  if (W->valueGetType(object) == VALUE_ARRAY &&
      W->valueGetType(property) == VALUE_NUMBER) {
    size_t index = (size_t)W->valueAsNumber(property);
    Value *item = W->arrayGetRef(object, index);
    if (item) {
      result = W->valueClone(item);
    }
  } else if (W->valueGetType(object) == VALUE_OBJECT &&
             W->valueGetType(property) == VALUE_STRING) {
    Value *item = W->objectGetRef(object, W->valueAsString(property));
    if (item) {
      result = W->valueClone(item);
    }
  }

  W->freeValue(object);
  W->freeValue(property);

  return result ? result : W->undefined();
}

static Value *evaluate_conditional_expression(const Value *node,
                                              const Value *scope) {
  const Value *test_node = W->objectGetRef(node, "test");
  const Value *consequent_node = W->objectGetRef(node, "consequent");
  const Value *alternate_node = W->objectGetRef(node, "alternate");

  Value *test_result = evaluate_node(test_node, scope);
  bool truthy = is_truthy(test_result);
  W->freeValue(test_result);

  if (truthy) {
    return evaluate_node(consequent_node, scope);
  } else {
    return evaluate_node(alternate_node, scope);
  }
}

static Value *evaluate_array_literal(const Value *node, const Value *scope) {
  const Value *elements_ast = W->objectGetRef(node, "elements");
  if (!elements_ast || W->valueGetType(elements_ast) != VALUE_ARRAY) {
    return W->undefined();
  }

  Value *result_array = W->array();
  if (!result_array) {
    return W->undefined();
  }

  for (size_t i = 0; i < W->arrayCount(elements_ast); i++) {
    const Value *element_ast = W->arrayGetRef(elements_ast, i);
    Value *element_value = evaluate_node(element_ast, scope);
    if (!element_value) {
      element_value = W->undefined();
    }
    W->arrayPush(result_array, element_value);
  }

  return result_array;
}

static Value *evaluate_object_literal(const Value *node, const Value *scope) {
  const Value *properties_ast = W->objectGetRef(node, "properties");
  if (!properties_ast || W->valueGetType(properties_ast) != VALUE_ARRAY) {
    return W->undefined();
  }

  Value *result_object = W->object();
  if (!result_object) {
    return W->undefined();
  }

  for (size_t i = 0; i < W->arrayCount(properties_ast); i++) {
    const Value *prop_ast = W->arrayGetRef(properties_ast, i);
    const Value *key_ast = W->objectGetRef(prop_ast, "key");
    const Value *value_ast = W->objectGetRef(prop_ast, "value");

    const char *key_str = NULL;
    const Value *key_ast_type_val = W->objectGetRef(key_ast, "type");
    const char *key_type_str = W->valueAsString(key_ast_type_val);

    if (strcmp(key_type_str, "Identifier") == 0) {
      key_str = W->valueAsString(W->objectGetRef(key_ast, "name"));
    } else if (strcmp(key_type_str, "Literal") == 0) {
      const Value *literal_val = W->objectGetRef(key_ast, "value");
      if (W->valueGetType(literal_val) == VALUE_STRING) {
        key_str = W->valueAsString(literal_val);
      }
    }

    if (key_str) {
      Value *prop_value = evaluate_node(value_ast, scope);
      if (!prop_value) {
        prop_value = W->undefined();
      }
      W->objectSet(result_object, key_str, prop_value);
    }
  }

  return result_object;
}

static Value *evaluate_node(const Value *node, const Value *scope) {
  if (!node || W->valueGetType(node) != VALUE_OBJECT)
    return NULL;

  const Value *type_value = W->objectGetRef(node, "type");
  if (!type_value || W->valueGetType(type_value) != VALUE_STRING)
    return NULL;

  const char *type = W->valueAsString(type_value);

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

  return W->undefined();
}

Value *evaluate_expression(const Value *node, const Value *scope) {
  return evaluate_node(node, scope);
}
