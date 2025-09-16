import { resolve } from 'path';

const userProjectDir = process.argv[2]
  ? resolve(process.argv[2])
  : process.cwd();
const FRAMEWORK_DIR = import.meta.dir;

/**
 * @typedef {object} Config
 * @property {string} CWD
 * @property {string | number} PORT
 * @property {boolean} IS_PROD
 * @property {string} OUTDIR
 * @property {string} TMPDIR
 * @property {string} TMP_COMPILED_DIR
 * @property {string} TMP_WRAPPERS_DIR
 * @property {string} TMP_APP_JS
 * @property {string} TMP_APP_CSS
 * @property {string} SRC_DIR
 * @property {string} APP_DIR
 * @property {string} PUB_DIR
 * @property {string} GUI_DIR
 * @property {string} LIB_DIR
 * @property {string} USER_FILES_ROOT
 * @property {string} TMP_GENERATED_ACTIONS
 * @property {string} TMP_COMPONENT_REGISTRY
 */

/** @type {Config} */
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
  LIB_DIR: resolve(FRAMEWORK_DIR, '../../lib'),
  USER_FILES_ROOT: resolve(userProjectDir, '.webs/files'),
  TMP_GENERATED_ACTIONS: resolve(userProjectDir, '.webs/actions.js'),
  TMP_COMPONENT_REGISTRY: resolve(userProjectDir, '.webs/registry.js'),
};

/**
 * @typedef {object} AIConfig
 * @property {string} host
 * @property {{ chat: string, embedding: string }} models
 * @property {{ path: string, dimensions: number }} db
 * @property {{ path: string }} worker
 */

/** @type {AIConfig} */
export const aiConfig = {
  host: process.env.OLLAMA_HOST || 'http://localhost:11434',
  models: {
    chat: process.env.CHAT_MODEL || 'deepseek-coder:1.3b-instruct',
    embedding: process.env.EMBEDDING_MODEL || 'nomic-embed-text:v1.5',
  },
  db: {
    path: '.webs/ai.db',
    dimensions: 768,
  },
  worker: {
    path: resolve(FRAMEWORK_DIR, '../ai/ai.worker.js'),
  },
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
  const clientTables = Object.entries(schema.tables)
    .filter(([, def]) => /** @type {any} */ (def).sync)
    .map(([name, def]) => ({
      name,
      keyPath: /** @type {any} */ (def).keyPath,
      autoIncrement: /** @type {any} */ (def).autoIncrement,
      indexes: /** @type {any} */ (def).indexes,
    }));

  return { ...schema, clientTables };
}
