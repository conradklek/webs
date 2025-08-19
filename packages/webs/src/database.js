/**
 * @fileoverview Database initialization and migration utility.
 */
import { resolve } from "path";

/**
 * Initializes a database connection and applies any pending migrations.
 * @param {object} Database - The database driver constructor (e.g., from `better-sqlite3`).
 * @param {string} cwd - The current working directory of the application.
 * @returns {Promise<object|null>} A promise that resolves to the database instance.
 */
export async function create_database(Database, cwd) {
  console.log("Initializing database service...");
  const db_config_path = resolve(cwd, "src/sql.js");
  let db_config;
  try {
    const config_file = Bun.file(db_config_path);
    if (!(await config_file.exists())) {
      console.log(
        "No src/sql.js file found. Skipping database initialization.",
      );
      return null;
    }
    const db_schema_module = await import(`${db_config_path}?t=${Date.now()}`);
    db_config = db_schema_module.default;
  } catch (e) {
    console.error(`Could not load or parse src/sql.js:`, e);
    process.exit(1);
  }

  if (!db_config.name) {
    console.error("Database file name not specified in src/sql.js.");
    process.exit(1);
  }

  const db_file_path = resolve(cwd, db_config.name);
  const db = new Database(db_file_path, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  console.log(`Connected to database at ${db_file_path}`);

  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY);`,
  );
  const last_version_row = db
    .query("SELECT MAX(version) as version FROM _migrations")
    .get();
  const last_version = last_version_row?.version || 0;
  console.log(`Current DB version: ${last_version}`);

  const migrations = (db_config.migrations || []).sort(
    (a, b) => a.version - b.version,
  );
  const new_migrations = migrations.filter((m) => m.version > last_version);

  if (new_migrations.length > 0) {
    console.log("Applying new migrations...");
    db.transaction(() => {
      for (const migration of new_migrations) {
        console.log(`  - Applying version ${migration.version}...`);
        migration.up(db);
        db.query("INSERT INTO _migrations (version) VALUES (?)").run(
          migration.version,
        );
      }
    })();
    console.log("Migrations applied successfully.");
  } else {
    console.log("Database is up to date.");
  }

  console.log("Database service initialized.");
  return db;
}
