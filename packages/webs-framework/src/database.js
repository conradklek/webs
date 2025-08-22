import { resolve } from "path";

export async function createDatabase(Database, cwd) {
  const dbConfigPath = resolve(cwd, "src/sql/db.js");
  let dbConfig;
  try {
    const configFile = Bun.file(dbConfigPath);
    if (!(await configFile.exists())) {
      console.log(
        "No src/sql/config.js file found. Skipping database initialization.",
      );
      return null;
    }
    const dbSchemaModule = await import(`${dbConfigPath}?t=${Date.now()}`);
    dbConfig = dbSchemaModule.default;
  } catch (e) {
    console.error(`Could not load or parse src/sql/db.js:`, e);
    process.exit(1);
  }

  if (!dbConfig.name) {
    console.error("Database file name not specified in src/sql/db.js.");
    process.exit(1);
  }

  const dbFilePath = resolve(cwd, dbConfig.name);
  const db = new Database(dbFilePath, { create: true });
  db.exec("PRAGMA journal_mode = WAL;");
  console.log(`Connected to database at ${dbFilePath}`);

  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (version INTEGER PRIMARY KEY);`,
  );
  const lastVersionRow = db
    .query("SELECT MAX(version) as version FROM _migrations")
    .get();
  const lastVersion = lastVersionRow?.version || 0;
  console.log(`Current DB version: ${lastVersion}`);

  const migrations = (dbConfig.migrations || []).sort(
    (a, b) => a.version - b.version,
  );
  const newMigrations = migrations.filter((m) => m.version > lastVersion);

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
