export default {
  name: 'webs.db',
  migrations: [
    {
      version: 1,
      up: (db) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE NOT NULL,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );
        `);
        db.exec(`
          CREATE TABLE IF NOT EXISTS sessions (
            id TEXT PRIMARY KEY,
            user_id INTEGER NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
          );
        `);
      },
    },
    {
      version: 2,
      up: (db) => {
        db.exec(`
                CREATE TABLE IF NOT EXISTS chat_messages (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    channel TEXT NOT NULL,
                    username TEXT NOT NULL,
                    message TEXT NOT NULL,
                    user_id INTEGER, -- Can be NULL if the sender is not a registered user of this app
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                );
            `);
        db.exec(
          `CREATE INDEX IF NOT EXISTS idx_chat_messages_channel ON chat_messages (channel, created_at);`,
        );
      },
    },
    {
      version: 3,
      up: (db) => {
        db.exec(`
          INSERT INTO users (email, username, password)
          VALUES ('anon@webs.site', 'anon', 'password')
          ON CONFLICT(email) DO NOTHING;
        `);
      },
    },
  ],
};
