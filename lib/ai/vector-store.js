/**
 * @file Manages the vector store for semantic search, using SQLite with the `sqlite-vec` extension.
 * Handles indexing, removing, and searching for text embeddings.
 */

import { AIErrors } from './ai.errors.js';
import * as sqliteVec from 'sqlite-vec';
import { Database } from 'bun:sqlite';

/**
 * @typedef {import('./ai.server.js').AI} AI
 */

/**
 * @typedef {object} SearchResult
 * @property {string} text - The content of the search result.
 * @property {number} score - The relevance score of the result.
 * @property {{ filePath: string }} metadata - Metadata associated with the result.
 */

/**
 * @typedef {object} AIConfigForStore
 * @property {object} db
 * @property {string} db.path
 * @property {number} db.dimensions
 */

/**
 * A class for managing the vector database.
 */
export class Store {
  /**
   * Creates an instance of the vector store.
   * @param {AIConfigForStore} config - The AI configuration.
   * @param {AI} aiInstance - An instance of the main AI service.
   */
  constructor(config, aiInstance) {
    this.config = config;
    this.ai = aiInstance;
    /** @type {Database | null} */
    this.db = null;
  }

  /**
   * Initializes the database connection and creates the necessary tables.
   * @returns {Promise<void>}
   */
  async init() {
    if (process.platform === 'darwin') {
      try {
        // @ts-ignore
        Database.setCustomSQLite('/usr/local/opt/sqlite3/lib/libsqlite3.dylib');
      } catch (e) {
        console.warn(
          `[Store] Could not set custom SQLite library. If you're on macOS and this fails, please install SQLite with Homebrew ('brew install sqlite').`,
        );
      }
    }

    this.db = new Database(this.config.db.path, { create: true });
    sqliteVec.load(this.db);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_store USING vec0(
        embedding float[${this.config.db.dimensions}]
      );
      CREATE TABLE IF NOT EXISTS text_meta (
          vec_id INTEGER PRIMARY KEY,
          text_content TEXT NOT NULL,
          file_path TEXT
      );
    `);

    const columns = this.db.prepare('PRAGMA table_info(text_meta)').all();
    if (
      !columns.some((/** @type {{name: string}} */ c) => c.name === 'user_id')
    ) {
      this.db.exec('ALTER TABLE text_meta ADD COLUMN user_id INTEGER');
    }
  }

  /**
   * Generates an embedding for the given text and stores it in the database.
   * @param {string} text - The text content to index.
   * @param {{filePath: string, userId?: string}} metadata - Metadata associated with the text.
   * @returns {Promise<{success: boolean, text: string}>}
   */
  async index(text, metadata) {
    if (!this.db) throw new AIErrors.StoreError('Database not initialized.');
    try {
      const embedding = await this.ai.embed(text);
      if (!embedding || embedding.length === 0) {
        throw new AIErrors.EmbeddingError('Generated an empty embedding.');
      }

      const tx = this.db.transaction(() => {
        if (!this.db)
          throw new AIErrors.StoreError('Database not initialized.');
        const existing = this.db
          .query(
            'SELECT vec_id FROM text_meta WHERE file_path = ? AND user_id = ?',
          )
          .get(metadata.filePath, metadata.userId ?? null);

        if (existing && typeof existing === 'object' && 'vec_id' in existing) {
          this.db
            .query('UPDATE vec_store SET embedding = ? WHERE rowid = ?')
            .run(embedding, /** @type {any} */ (existing).vec_id);
          this.db
            .query('UPDATE text_meta SET text_content = ? WHERE vec_id = ?')
            .run(text, /** @type {any} */ (existing).vec_id);
        } else {
          const { lastInsertRowid } = this.db
            .query('INSERT INTO vec_store (embedding) VALUES (?)')
            .run(embedding);
          this.db
            .query(
              'INSERT INTO text_meta (vec_id, text_content, file_path, user_id) VALUES (?, ?, ?, ?)',
            )
            .run(
              lastInsertRowid,
              text,
              metadata.filePath,
              metadata.userId ?? null,
            );
        }
      });

      tx();
      return { success: true, text };
    } catch (error) {
      if (error instanceof AIErrors.AIError) throw error;
      throw new AIErrors.StoreError(
        `Failed to index document.`,
        /** @type {Error} */ (error),
      );
    }
  }

  /**
   * Removes a document and its embedding from the store.
   * @param {string} filePath - The file path of the document to remove.
   * @param {string | undefined} userId - The ID of the user who owns the file.
   * @returns {Promise<{success: boolean, filePath: string}>}
   */
  async remove(filePath, userId) {
    if (!this.db) throw new AIErrors.StoreError('Database not initialized.');
    try {
      const tx = this.db.transaction(() => {
        if (!this.db)
          throw new AIErrors.StoreError('Database not initialized.');
        const record = this.db
          .query(
            'SELECT vec_id FROM text_meta WHERE file_path = ? AND user_id = ?',
          )
          .get(filePath, userId ?? null);
        if (record && typeof record === 'object' && 'vec_id' in record) {
          this.db
            .query('DELETE FROM vec_store WHERE rowid = ?')
            .run(/** @type {any} */ (record).vec_id);
          this.db
            .query('DELETE FROM text_meta WHERE vec_id = ?')
            .run(/** @type {any} */ (record).vec_id);
        }
      });
      tx();
      return { success: true, filePath };
    } catch (error) {
      throw new AIErrors.StoreError(
        `Failed to remove document index for ${filePath}.`,
        /** @type {Error} */ (error),
      );
    }
  }

  /**
   * Performs a semantic search for similar documents.
   * @param {string} query - The search query text.
   * @param {number} [limit=5] - The maximum number of results to return.
   * @param {{userId?: string}} [where={}] - Filtering conditions for the search.
   * @returns {Promise<SearchResult[]>} A promise that resolves with an array of search results.
   */
  async search(query, limit = 5, where = {}) {
    if (!this.db) throw new AIErrors.StoreError('Database not initialized.');
    try {
      const embedding = await this.ai.embed(query);
      if (!embedding || embedding.length === 0) return [];

      let whereClause = '';
      /** @type {any[]} */
      const params = [embedding, limit];

      if (where.userId) {
        whereClause = 'WHERE meta.user_id = ?';
        params.push(where.userId);
      }

      const sql = `
            SELECT
                meta.text_content as text,
                meta.file_path as filePath,
                v.distance as score
            FROM (
                SELECT rowid, distance
                FROM vec_store
                WHERE embedding MATCH ?
                ORDER BY distance
                LIMIT ?
            ) as v
            JOIN text_meta AS meta ON v.rowid = meta.vec_id
            ${whereClause};
        `;

      const results =
        /** @type {{text: string, filePath: string, score: number}[]} */ (
          this.db.query(sql).all(...params)
        );
      return results.map((row) => ({
        text: row.text,
        score: row.score,
        metadata: { filePath: row.filePath },
      }));
    } catch (error) {
      if (error instanceof AIErrors.AIError) throw error;
      throw new AIErrors.StoreError(
        `Failed to execute search.`,
        /** @type {Error} */ (error),
      );
    }
  }

  /**
   * Closes the database connection.
   */
  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
