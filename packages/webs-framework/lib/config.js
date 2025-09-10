import { resolve } from 'path';

const userProjectDir = process.argv[2]
  ? resolve(process.argv[2])
  : process.cwd();
const FRAMEWORK_DIR = import.meta.dir;

export const config = {
  CWD: userProjectDir,
  PORT: process.env.PORT || 3000,
  IS_PROD: process.env.NODE_ENV === 'production',
  OUTDIR: resolve(userProjectDir, 'dist'),
  TMPDIR: resolve(userProjectDir, '.webs'),
  TMP_COMPILED_DIR: resolve(userProjectDir, '.webs/compiled'),
  TMP_WRAPPERS_DIR: resolve(userProjectDir, '.webs/layout'),
  TMP_APP_JS: resolve(userProjectDir, '.webs/app.js'),
  TMP_APP_CSS: resolve(userProjectDir, '.webs/app.css'),
  SRC_DIR: resolve(userProjectDir, 'src'),
  APP_DIR: resolve(userProjectDir, 'src/app'),
  PUB_DIR: resolve(userProjectDir, 'src/pub'),
  GUI_DIR: resolve(userProjectDir, 'src/gui'),
  LIB_DIR: resolve(FRAMEWORK_DIR, '.'),
  USER_FILES_ROOT: resolve(userProjectDir, '.webs/files'),
  TMP_GENERATED_ACTIONS: resolve(userProjectDir, '.webs/actions.js'),
  TMP_COMPONENT_REGISTRY: resolve(userProjectDir, '.webs/registry.js'),
};

export function getDbConfig() {
  const schema = {
    name: 'fw.db',
    version: 1,
    tables: {
      users: {
        keyPath: 'id',
        fields: {
          id: { type: 'integer', primaryKey: true },
          email: { type: 'text', notNull: true, unique: true },
          username: { type: 'text', notNull: true, unique: true },
          password: { type: 'text', notNull: true },
          created_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        },
      },
      sessions: {
        keyPath: 'id',
        fields: {
          id: { type: 'text', primaryKey: true },
          user_id: {
            type: 'integer',
            notNull: true,
            references: 'users(id)',
            onDelete: 'CASCADE',
          },
          expires_at: { type: 'timestamp', notNull: true },
        },
      },
      files: {
        sync: true,
        keyPath: 'path',
        primaryKeys: ['path', 'user_id'],
        fields: {
          path: { type: 'text', notNull: true },
          user_id: {
            type: 'integer',
            notNull: true,
            references: 'users(id)',
            onDelete: 'CASCADE',
          },
          content: { type: 'blob', notNull: true },
          access: { type: 'text', notNull: true, default: 'private' },
          size: { type: 'integer', notNull: true, default: 0 },
          last_modified: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          updated_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        },
        indexes: [{ name: 'by-user', keyPath: 'user_id' }],
      },
      todos: {
        sync: true,
        keyPath: 'id',
        fields: {
          id: { type: 'text', primaryKey: true },
          content: { type: 'text', notNull: true },
          completed: { type: 'integer', notNull: true, default: 0 },
          user_id: {
            type: 'integer',
            notNull: true,
            references: 'users(id)',
            onDelete: 'CASCADE',
          },
          created_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          updated_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        },
        indexes: [{ name: 'by-user', keyPath: 'user_id' }],
      },
      chat_messages: {
        sync: true,
        keyPath: 'id',
        fields: {
          id: { type: 'text', primaryKey: true },
          channel: { type: 'text', notNull: true },
          username: { type: 'text', notNull: true },
          message: { type: 'text', notNull: true },
          user_id: {
            type: 'integer',
            references: 'users(id)',
            onDelete: 'SET NULL',
          },
          created_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          updated_at: { type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        },
        indexes: [{ name: 'by-channel', keyPath: 'channel' }],
      },
    },
  };
  const clientTables = Object.entries(schema.tables).map(([name, s]) => ({
    name,
    keyPath: s.keyPath,
    indexes: s.indexes || [],
    sync: !!s.sync,
  }));
  return { ...schema, clientTables };
}
