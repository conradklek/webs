/**
 * @file expression.h
 * @brief Defines the parser for JavaScript-like expressions within templates.
 *
 * This module is responsible for parsing strings found in template bindings
 * (e.g., `{{ count + 1 }}`) or directives (e.g., `{#if user.isActive}`) into an
 * Abstract Syntax Tree (AST).
 */

#ifndef EXPRESSION_H
#define EXPRESSION_H

#include "../core/value.h"

/**
 * @brief Parses a string containing a JavaScript-like expression into an AST.
 *
 * The AST is a tree of `Value` objects representing the structure of the
 * expression.
 *
 * @param expression The null-terminated expression string to parse.
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A `Value` representing the root of the expression's AST, or NULL on
 * failure.
 */
Value *parse_expression(const char *expression, Status *status);

#endif // EXPRESSION_H
