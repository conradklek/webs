export default {
  name: "app.db",
  migrations: [
    {
      version: 1,
      name: "initial_auth_schema",
      up: (db) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            username TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
          );`);
      },
    },
    {
      version: 2,
      name: "seed_test_user",
      up: (db) => {
        console.log("Seeding test user...");
        const test_password = Bun.password.hashSync("password", {
          algorithm: "bcrypt",
          cost: 10,
        });
        const stmt = db.prepare(
          "INSERT OR IGNORE INTO users (email, username, password) VALUES (?, ?, ?)",
        );
        stmt.run("anon@webs.site", "anon", test_password);
        console.log("Test user seeded successfully.");
      },
    },
  ],
};
