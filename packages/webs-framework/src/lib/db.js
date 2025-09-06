import { resolve as pathResolve } from 'path';

function toSqliteType(type) {
  switch (type) {
    case 'string':
    case 'text':
      return 'TEXT';
    case 'number':
    case 'integer':
      return 'INTEGER';
    case 'boolean':
      return 'INTEGER';
    case 'float':
    case 'real':
      return 'REAL';
    case 'buffer':
    case 'blob':
      return 'BLOB';
    case 'timestamp':
      return 'TIMESTAMP';
    default:
      return 'TEXT';
  }
}

function getColumnSql(name, props) {
  const definition = typeof props === 'string' ? { type: props } : props;
  let columnSql = `${name} ${toSqliteType(definition.type)}`;
  if (definition.primaryKey) columnSql += ' PRIMARY KEY';
  if (definition.notNull) columnSql += ' NOT NULL';
  if (definition.unique) columnSql += ' UNIQUE';
  if (definition.default !== undefined) {
    columnSql += ` DEFAULT ${
      typeof definition.default === 'string'
        ? `'${definition.default}'`
        : definition.default
    }`;
  }
  return columnSql;
}

function createTableSql(tableName, table) {
  const fields = Object.entries(table.fields).map(([name, props]) =>
    getColumnSql(name, props),
  );

  const foreignKeys = Object.entries(table.fields)
    .filter(([, props]) => typeof props !== 'string' && props.references)
    .map(([fieldName, props]) => {
      let fkSql = `FOREIGN KEY (${fieldName}) REFERENCES ${props.references}`;
      if (props.onDelete) fkSql += ` ON DELETE ${props.onDelete}`;
      return fkSql;
    });

  const constraints = [...foreignKeys];
  const constraintsSql =
    constraints.length > 0 ? `, ${constraints.join(', ')}` : '';

  return `CREATE TABLE IF NOT EXISTS ${tableName} (${fields.join(
    ', ',
  )}${constraintsSql});`;
}

function createActionsFileContent(syncableTables) {
  const actions = syncableTables
    .map(([tableName, table]) => {
      const upperCaseName =
        tableName.charAt(0).toUpperCase() + tableName.slice(1);
      const fieldNames = Object.keys(table.fields);

      let updateSet = fieldNames
        .filter((f) => f !== table.keyPath && f !== 'created_at')
        .map((f) => `${f} = excluded.${f}`);
      if (table.fields.updated_at)
        updateSet.push(`updated_at = CURRENT_TIMESTAMP`);

      const upsertSql = `INSERT INTO ${tableName} (${fieldNames.join(
        ', ',
      )}) VALUES (${fieldNames
        .map((f) => `$${f}`)
        .join(
          ', ',
        )}) ON CONFLICT(${table.keyPath}) DO UPDATE SET ${updateSet.join(', ')}`
        .trim()
        .replace(/\s+/g, ' ');
      const deleteSql = `DELETE FROM ${tableName} WHERE ${table.keyPath} = $id AND user_id = $user_id;`;

      return `
    const upsert${upperCaseName}Stmt = db.prepare(\`${upsertSql}\`);
    const delete${upperCaseName}Stmt = db.prepare(\`${deleteSql}\`);
    actions.upsert${upperCaseName} = ({ user }, record) => {
      if (!user?.id || (record.user_id && user.id !== record.user_id)) throw new Error('Authorization error.');
      const finalRecord = { ...record, user_id: user.id };
      const params = Object.fromEntries(Object.entries(finalRecord).map(([key, value]) => [\`$\${key}\`, value]));
      upsert${upperCaseName}Stmt.run(params);
      return { broadcast: { tableName: '${tableName}', type: 'put', data: finalRecord } };
    };
    actions.delete${upperCaseName} = ({ user }, id) => {
      if (!user?.id) throw new Error('Authorization error.');
      delete${upperCaseName}Stmt.run({ $id: id, $user_id: user.id });
      return { broadcast: { tableName: '${tableName}', type: 'delete', id } };
    };`;
    })
    .join('');

  return `export function registerActions(db) { const actions = {}; ${actions} return actions; };`;
}

export async function createDatabaseAndActions(
  Database,
  dbConfig,
  cwd,
  writeFile,
  config,
) {
  if (!dbConfig?.name) throw new Error('Database file name not specified.');
  const dbFilePath = pathResolve(cwd, dbConfig.name);
  const db = new Database(dbFilePath, { create: true });
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY);`,
  );
  const lastVersion =
    db
      .query('SELECT version FROM _migrations ORDER BY version DESC LIMIT 1')
      .get()?.version || 0;

  if (dbConfig.version > lastVersion) {
    const migrationTx = db.transaction(() => {
      Object.entries(dbConfig.tables).forEach(([tableName, tableDef]) => {
        db.exec(createTableSql(tableName, tableDef));
        const existingColumns = db
          .prepare(`PRAGMA table_info(${tableName})`)
          .all()
          .map((col) => col.name);
        Object.entries(tableDef.fields).forEach(([fieldName, fieldProps]) => {
          if (!existingColumns.includes(fieldName)) {
            db.exec(
              `ALTER TABLE ${tableName} ADD COLUMN ${getColumnSql(
                fieldName,
                fieldProps,
              )}`,
            );
          }
        });
      });
      db.query('INSERT INTO _migrations (version) VALUES (?)').run(
        dbConfig.version,
      );
    });
    migrationTx();
  }

  const syncableTables = Object.entries(dbConfig.tables).filter(
    ([, def]) => def.sync,
  );
  const generatedActionsContent = createActionsFileContent(syncableTables);
  await writeFile(config.TMP_GENERATED_ACTIONS, generatedActionsContent);
  return db;
}
