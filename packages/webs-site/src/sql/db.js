const dbConfig = {
  name: 'webs.db',
  version: 1,
  tables: [
    {
      name: 'users',
      keyPath: 'id',
      fields: {
        id: 'INTEGER PRIMARY KEY AUTOINCREMENT',
        email: 'TEXT UNIQUE NOT NULL',
        username: 'TEXT UNIQUE NOT NULL',
        password: 'TEXT NOT NULL',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      },
    },
    {
      name: 'sessions',
      keyPath: 'id',
      fields: {
        id: 'TEXT PRIMARY KEY',
        user_id: 'INTEGER NOT NULL',
        expires_at: 'TIMESTAMP NOT NULL',
      },
      foreignKeys: {
        user_id: 'users(id) ON DELETE CASCADE',
      },
    },
    {
      name: 'todos',
      sync: true,
      keyPath: 'id',
      fields: {
        id: 'TEXT PRIMARY KEY',
        user_id: 'INTEGER NOT NULL',
        content: 'TEXT NOT NULL',
        completed: 'INTEGER DEFAULT 0',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
        updated_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      },
      foreignKeys: {
        user_id: 'users(id) ON DELETE CASCADE',
      },
    },
    {
      name: 'chat_messages',
      sync: true,
      keyPath: 'id',
      fields: {
        id: 'TEXT PRIMARY KEY',
        channel: 'TEXT NOT NULL',
        username: 'TEXT NOT NULL',
        message: 'TEXT NOT NULL',
        user_id: 'INTEGER',
        created_at: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP',
      },
    },
  ],
};

export default dbConfig;
