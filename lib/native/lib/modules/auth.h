/**
 * @file auth.h
 * @brief Defines the authentication module for password hashing, verification,
 * and session management.
 */

#ifndef AUTH_H
#define AUTH_H

#include "../core/value.h"
#include <stdbool.h>

/**
 * @brief Hashes a plain-text password.
 * @param password The plain-text password.
 * @return A new, heap-allocated string containing the hashed password.
 */
char *auth_hash_password(const char *password);

/**
 * @brief Verifies a plain-text password against a stored hash.
 * @param password The plain-text password to check.
 * @param hash The stored hash to compare against.
 * @return `true` if the password matches the hash, `false` otherwise.
 */
bool auth_verify_password(const char *password, const char *hash);

/**
 * @brief Creates a new session for a user in the database.
 * @param db_handle_val A `Value` containing the database handle.
 * @param username The username to associate with the session.
 * @return A new, heap-allocated session ID string, or NULL on failure.
 */
char *auth_create_session(Value *db_handle_val, const char *username);

/**
 * @brief Retrieves user information based on a session ID.
 * @param db_handle_val A `Value` containing the database handle.
 * @param session_id The session ID to look up.
 * @return A `Value` object containing user data if the session is valid and not
 * expired, otherwise NULL.
 */
Value *auth_get_user_from_session(Value *db_handle_val, const char *session_id);

/**
 * @brief Deletes a session from the database.
 * @param db_handle_val A `Value` containing the database handle.
 * @param session_id The session ID to delete.
 */
void auth_delete_session(Value *db_handle_val, const char *session_id);

#endif // AUTH_H
