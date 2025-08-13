import { resolve } from "path";

/**
 * Initializes a database connection, and applies any pending migrations.
 * It looks for a `src/sql.js` file in the project's root for configuration,
 * which should specify the database name and an array of migration scripts.
 * @param {object} Database - The database driver constructor (e.g., from `better-sqlite3`).
 * @param {string} cwd - The current working directory of the application.
 * @returns {Promise<object|null>} A promise that resolves to the database instance, or null if setup is skipped.
 */
export async function create_database(Database, cwd) {
  console.log("Initializing database service...");
  const dbSchemaPath = resolve(cwd, "src/sql.js");
  let dbConfig;
  try {
    const schemaFile = Bun.file(dbSchemaPath);
    if (!(await schemaFile.exists())) {
      console.log(
        "No src/sql.js file found. Skipping database service initialization.",
      );
      return null;
    }
    const dbSchemaModule = await import(`${dbSchemaPath}?t=${Date.now()}`);
    dbConfig = dbSchemaModule.default;
  } catch (e) {
    console.error(`Could not load or parse src/sql.js:`, e);
    process.exit(1);
  }
  const dbFileName = dbConfig.name;
  if (!dbFileName) {
    console.error("Database file name not specified in src/sql.js.");
    process.exit(1);
  }
  const dbFilePath = resolve(cwd, dbFileName);
  const db = new Database(dbFilePath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  console.log(`Connected to database at ${dbFilePath}`);
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY);`,
  );
  const lastAppliedVersionRow = db
    .query("SELECT MAX(version) as version FROM _migrations")
    .get();
  const lastAppliedVersion = lastAppliedVersionRow?.version || 0;
  console.log(`Current DB version: ${lastAppliedVersion}`);
  const migrations = dbConfig.migrations || [];
  const newMigrations = migrations
    .filter((m) => m.version > lastAppliedVersion)
    .sort((a, b) => a.version - b.version);
  if (newMigrations.length > 0) {
    console.log("Applying new migrations...");
    db.transaction(() => {
      for (const migration of newMigrations) {
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

