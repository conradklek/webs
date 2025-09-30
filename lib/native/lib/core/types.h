/**
 * @file types.h
 * @brief Defines fundamental enumeration types used throughout the Webs
 * framework.
 *
 * This header provides the core status codes and value type identifiers that
 * form the basis of error handling and the dynamic typing system.
 */

#ifndef WEBS_TYPES_H
#define WEBS_TYPES_H

/**
 * @enum Status
 * @brief Represents the outcome of an operation.
 *
 * Used as a return type for functions that can fail, providing a more
 * descriptive result than a simple boolean or integer code.
 */
typedef enum {
  OK,                  ///< The operation completed successfully.
  ERROR,               ///< A generic, unspecified error occurred.
  ERROR_MEMORY,        ///< A memory allocation or reallocation failed.
  ERROR_IO,            ///< An input/output error occurred (e.g., file access).
  ERROR_PARSE,         ///< A parsing error occurred (e.g., invalid JSON).
  ERROR_NOT_FOUND,     ///< A requested resource or key was not found.
  ERROR_INVALID_ARG,   ///< An invalid argument was provided to a function.
  ERROR_INVALID_STATE, ///< The system was in an invalid state for the
                       ///< operation.
} Status;

/**
 * @enum ValueType
 * @brief Identifies the type of data held within a `Value` struct.
 *
 * This enum is the tag for the tagged union in the `Value` struct, enabling
 * dynamic typing within the C environment.
 */
typedef enum {
  VALUE_NUMBER,    ///< The value is a double-precision floating-point number.
  VALUE_BOOL,      ///< The value is a boolean (true or false).
  VALUE_NULL,      ///< The value is null.
  VALUE_UNDEFINED, ///< The value is undefined.
  VALUE_STRING,    ///< The value is a String object.
  VALUE_ARRAY,     ///< The value is an Array object.
  VALUE_OBJECT,    ///< The value is an Object (hash map).
  VALUE_POINTER,   ///< The value is a raw C pointer (e.g., for FFI).
  VALUE_VNODE,     ///< The value is a Virtual DOM Node.
  VALUE_REF,       ///< The value is a reactive reference (`ref`).
  VALUE_FREED,     ///< The value has been freed and should not be accessed.
} ValueType;

#endif // WEBS_TYPES_H
