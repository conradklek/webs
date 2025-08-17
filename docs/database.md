# Database Setup in Webs

Webs includes a simple yet powerful system for managing an SQLite database, complete with a built-in migration system to help you evolve your database schema over time.

---

## Database Configuration

All database configuration happens in a single file: `src/sql.js`. When your application starts, Webs automatically looks for this file to initialize the database service.

A typical `src/sql.js` file looks like this:

```javascript
// src/sql.js
export default {
  name: "app.db",
  migrations: [
    // ... your migration objects go here
  ],
};
```

- **`name`**: This is the filename for your SQLite database. It will be created in the root of your project directory.
- **`migrations`**: This is an array of migration objects that define your database schema and any changes to it.

---

## Migrations

A migration represents a change to your database schema. Each migration is an object with a `version`, a `name`, and an `up` function.

- **`version`**: A unique integer for the migration. Migrations are always run in ascending order of their version number.
- **`name`**: A descriptive name for the migration.
- **`up(db)`**: A function that executes the SQL commands to apply the migration. It receives the database instance (`db`) as its only argument.

### How Migrations Work

When the server starts, Webs connects to the database and checks a special `_migrations` table to see which version the database is currently at. It then compares this version to the migrations defined in your `src/sql.js` file.

Any migrations with a version number higher than the current database version will be executed in order. This process is automatic, ensuring your database schema is always up to date with your code.

### Example: Initial Schema and Seeding

Here is an example `src/sql.js` file that defines an initial schema for users and sessions, and then seeds a test user.

```javascript
// src/sql.js
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
            password TEXT NOT NULL
          );

          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users (id)
          );
        `);
      },
    },
    {
      version: 2,
      name: "seed_test_user",
      up: (db) => {
        const test_password = Bun.password.hashSync("password");
        const stmt = db.prepare(
          "INSERT OR IGNORE INTO users (email, username, password) VALUES (?, ?, ?)",
        );
        stmt.run("anon@webs.site", "anon", test_password);
      },
    },
  ],
};
```

This migration system provides a straightforward and version-controlled way to manage your application's database schema.
