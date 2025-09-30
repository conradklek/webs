/**
 * @file db.h
 * @brief Defines the interface for interacting with an SQLite database.
 *
 * This module provides a simplified wrapper around the sqlite3 library,
 * using the framework's `Value` system for data exchange.
 */

#ifndef DB_H
#define DB_H

#include "../core/value.h"

/**
 * @brief Opens a connection to an SQLite database file.
 * @param filename The path to the database file (or ":memory:" for an in-memory
 * database).
 * @return A `Value` of type `VALUE_POINTER` containing the database handle, or
 * NULL on failure.
 */
Value *db_open(const char *filename);

/**
 * @brief Closes a database connection.
 * @param db_handle_val A `Value` containing the database handle from
 * `db_open`.
 * @return A boolean `Value` of `true` on success, or a string `Value` with an
 * error message on failure.
 */
Value *db_close(Value *db_handle_val);

/**
 * @brief Executes one or more SQL statements that do not return data.
 * @param db_handle_val A `Value` containing the database handle.
 * @param sql The SQL statement(s) to execute.
 * @return A boolean `Value` of `true` on success, or a string `Value` with an
 * error message on failure.
 */
Value *db_exec(Value *db_handle_val, const char *sql);

/**
 * @brief Executes an SQL query that returns data.
 * @param db_handle_val A `Value` containing the database handle.
 * @param sql The SQL query to execute.
 * @return An array `Value` where each element is an object `Value` representing
 * a row. On failure, returns a string `Value` with an error message.
 */
Value *db_query(Value *db_handle_val, const char *sql);

#endif // DB_H
