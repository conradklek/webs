#ifndef DB_H
#define DB_H

#include "../core/value.h"

Value *webs_db_open(const char *filename);

Value *webs_db_close(Value *db_handle_val);

Value *webs_db_exec(Value *db_handle_val, const char *sql);

Value *webs_db_query(Value *db_handle_val, const char *sql);

#endif
