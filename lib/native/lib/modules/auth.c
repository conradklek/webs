#include "auth.h"
#include "../webs_api.h"
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

static const char b64_table[] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

char *auth_hash_password(const char *password) {
  if (!password)
    return NULL;

  size_t len = strlen(password);
  size_t out_len = 4 * ((len + 2) / 3);
  char *out = malloc(out_len + 1);
  if (!out)
    return NULL;

  for (size_t i = 0, j = 0; i < len;) {
    uint32_t octet_a = i < len ? (unsigned char)password[i++] : 0;
    uint32_t octet_b = i < len ? (unsigned char)password[i++] : 0;
    uint32_t octet_c = i < len ? (unsigned char)password[i++] : 0;
    uint32_t triple = (octet_a << 16) | (octet_b << 8) | octet_c;

    out[j++] = b64_table[(triple >> 18) & 0x3F];
    out[j++] = b64_table[(triple >> 12) & 0x3F];
    out[j++] = b64_table[(triple >> 6) & 0x3F];
    out[j++] = b64_table[triple & 0x3F];
  }

  size_t mod = len % 3;
  if (mod > 0) {
    out[out_len - 1] = '=';
    if (mod == 1)
      out[out_len - 2] = '=';
  }

  out[out_len] = '\0';
  return out;
}

bool auth_verify_password(const char *password, const char *hash) {
  if (!password || !hash)
    return false;

  char *hashed_password = auth_hash_password(password);
  if (!hashed_password)
    return false;

  bool match = W->stringCompare(hashed_password, hash) == 0;
  free(hashed_password);
  return match;
}

static char *generate_session_token() {
  char *token = malloc(33);
  if (!token)
    return NULL;
  srand(time(NULL));
  for (int i = 0; i < 32; i++) {
    sprintf(token + i, "%x", rand() % 16);
  }
  return token;
}

char *auth_create_session(Value *db_handle_val, const char *username) {
  char *session_id = generate_session_token();
  if (!session_id)
    return NULL;

  long expires_at = time(NULL) + 3600;

  char sql[512];
  snprintf(sql, sizeof(sql),
           "INSERT INTO sessions (session_id, username, expires_at) VALUES "
           "('%s', '%s', %ld);",
           session_id, username, expires_at);

  char *exec_error = NULL;
  Status status = W->db->exec(db_handle_val, sql, &exec_error);

  if (status != OK) {
    W->log->error("Failed to create session: %s",
                  exec_error ? exec_error : "Unknown DB error");
    if (exec_error)
      W->freeString(exec_error);
    free(session_id);
    return NULL;
  }

  return session_id;
}

Value *auth_get_user_from_session(Value *db_handle_val,
                                  const char *session_id) {
  long now = time(NULL);
  char sql[256];
  snprintf(sql, sizeof(sql),
           "SELECT username FROM sessions WHERE session_id = '%s' AND "
           "expires_at > %ld;",
           session_id, now);

  Value *result = NULL;
  char *query_error = NULL;
  Status status = W->db->query(db_handle_val, sql, &result, &query_error);

  if (status != OK) {
    W->log->error("Session query failed: %s",
                  query_error ? query_error : "Unknown error");
    if (query_error)
      W->freeString(query_error);
    if (result)
      W->freeValue(result);
    return NULL;
  }

  if (W->arrayCount(result) == 0) {
    snprintf(sql, sizeof(sql), "DELETE FROM sessions WHERE session_id = '%s';",
             session_id);
    char *delete_error = NULL;
    W->db->exec(db_handle_val, sql, &delete_error);
    if (delete_error)
      W->freeString(delete_error);
  }

  if (W->valueGetType(result) != VALUE_ARRAY || W->arrayCount(result) != 1) {
    W->freeValue(result);
    return NULL;
  }

  Value *row = W->arrayGetRef(result, 0);
  Value *username_val = W->objectGetRef(row, "username");
  char *username = strdup(W->valueAsString(username_val));
  W->freeValue(result);

  snprintf(sql, sizeof(sql), "SELECT username FROM users WHERE username = '%s'",
           username);

  Value *user_result = NULL;
  char *user_query_error = NULL;
  Status user_status =
      W->db->query(db_handle_val, sql, &user_result, &user_query_error);
  free(username);

  if (user_status != OK || !user_result ||
      W->valueGetType(user_result) != VALUE_ARRAY ||
      W->arrayCount(user_result) != 1) {
    if (user_query_error)
      W->freeString(user_query_error);
    if (user_result)
      W->freeValue(user_result);
    return NULL;
  }

  Value *user_row = W->arrayGetRef(user_result, 0);
  Value *final_user_obj = W->valueClone(user_row);
  W->freeValue(user_result);
  return final_user_obj;
}

void auth_delete_session(Value *db_handle_val, const char *session_id) {
  if (!session_id)
    return;
  char sql[256];
  snprintf(sql, sizeof(sql), "DELETE FROM sessions WHERE session_id = '%s';",
           session_id);
  char *error = NULL;
  W->db->exec(db_handle_val, sql, &error);
  if (error)
    W->freeString(error);
}
