#include "db.h"
#include "../core/array.h"
#include "../core/boolean.h"
#include "../core/null.h"
#include "../core/number.h"
#include "../core/object.h"
#include "../core/pointer.h"
#include "../core/string.h"
#include "sqlite3.h"
#include <stdio.h>
#include <stdlib.h>

Value *db_open(const char *filename) {
  sqlite3 *db;
  int rc = sqlite3_open(filename, &db);
  if (rc) {
    fprintf(stderr, "Can't open database: %s\n", sqlite3_errmsg(db));
    sqlite3_close(db);
    return NULL;
  }
  return pointer(db);
}

Value *db_close(Value *db_handle_val) {
  if (!db_handle_val || db_handle_val->type != VALUE_POINTER ||
      !db_handle_val->as.pointer) {
    return string_value("Invalid database handle");
  }
  sqlite3 *db = (sqlite3 *)db_handle_val->as.pointer;
  int rc = sqlite3_close(db);
  if (rc != SQLITE_OK) {
    return string_value(sqlite3_errmsg(db));
  }
  db_handle_val->as.pointer = NULL;
  return boolean(true);
}

Value *db_exec(Value *db_handle_val, const char *sql) {
  if (!db_handle_val || db_handle_val->type != VALUE_POINTER ||
      !db_handle_val->as.pointer) {
    return string_value("Invalid database handle");
  }
  sqlite3 *db = (sqlite3 *)db_handle_val->as.pointer;
  char *zErrMsg = 0;
  int rc = sqlite3_exec(db, sql, 0, 0, &zErrMsg);

  if (rc != SQLITE_OK) {
    Value *error_val = string_value(zErrMsg);
    sqlite3_free(zErrMsg);
    return error_val;
  }
  return boolean(true);
}

Value *db_query(Value *db_handle_val, const char *sql) {
  if (!db_handle_val || db_handle_val->type != VALUE_POINTER ||
      !db_handle_val->as.pointer) {
    return string_value("Invalid database handle");
  }
  sqlite3 *db = (sqlite3 *)db_handle_val->as.pointer;
  sqlite3_stmt *stmt;
  int rc = sqlite3_prepare_v2(db, sql, -1, &stmt, NULL);

  if (rc != SQLITE_OK) {
    return string_value(sqlite3_errmsg(db));
  }

  Value *results = array_value();
  if (!results) {
    sqlite3_finalize(stmt);
    return string_value("Memory allocation failed for results array.");
  }

  int col_count = sqlite3_column_count(stmt);

  while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
    Value *row = object_value();
    if (!row) {
      value_free(results);
      sqlite3_finalize(stmt);
      return string_value("Memory allocation failed for row object.");
    }

    for (int i = 0; i < col_count; i++) {
      const char *col_name = sqlite3_column_name(stmt, i);
      Value *col_value;
      int type = sqlite3_column_type(stmt, i);

      switch (type) {
      case SQLITE_INTEGER:
        col_value = number(sqlite3_column_int(stmt, i));
        break;
      case SQLITE_FLOAT:
        col_value = number(sqlite3_column_double(stmt, i));
        break;
      case SQLITE_TEXT:
        col_value = string_value((const char *)sqlite3_column_text(stmt, i));
        break;
      case SQLITE_NULL:
      default:
        col_value = null();
        break;
      }
      if (!col_value) {
        value_free(row);
        value_free(results);
        sqlite3_finalize(stmt);
        return string_value("Memory allocation failed for column value.");
      }
      row->as.object->set(row->as.object, col_name, col_value);
    }
    results->as.array->push(results->as.array, row);
  }

  if (rc != SQLITE_DONE) {
    Value *err_val = string_value(sqlite3_errmsg(db));
    value_free(results);
    results = err_val;
  }

  sqlite3_finalize(stmt);
  return results;
}
