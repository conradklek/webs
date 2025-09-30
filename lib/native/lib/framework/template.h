/**
 * @file template.h
 * @brief Defines the HTML template parser for `.webs` files.
 *
 * This parser takes a string of HTML-like template syntax, including custom
 * directives like `{#if}` and `{#each}`, and converts it into an Abstract
 * Syntax Tree (AST) represented by `Value` objects.
 */

#ifndef TEMPLATE_H
#define TEMPLATE_H

#include "../core/value.h"

/**
 * @brief Parses a template string into an AST.
 *
 * The AST is a tree of `Value` objects, where each object represents an
 * element, text node, or control flow directive from the template.
 *
 * @param html The null-terminated template string to parse.
 * @param[out] status A pointer to a `Status` enum that will be set to the
 * outcome.
 * @return A `Value` representing the root of the AST, or NULL on failure.
 */
Value *webs_template_parse(const char *html, Status *status);

#endif // TEMPLATE_H
