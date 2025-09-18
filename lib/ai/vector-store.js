import { AIErrors } from './ai.errors.js';
import * as sqliteVec from 'sqlite-vec';
import { Database } from 'bun:sqlite';
import { dirname } from 'path';
import { ensureDir } from '../server/server-setup.js';

/**
 * @typedef {import('./ai.server.js').AI} AI
 */

/**
 * @typedef {object} AIConfig
 * @property {string} host
 * @property {{chat: string, embedding: string, labeling: string, agent?: string}} models
 * @property {{path: string}} worker
 * @property {{path: string, dimensions: number}} db
 */
/** @typedef {AIConfig} AIConfigForStore */

/**
 * @typedef {object} SearchResultMetadata
 * @property {string} filePath
 * @property {number} startLine
 * @property {number} endLine
 * @property {string} [className] - The name of the class containing the code chunk.
 * @property {string} [functionName] - The name of the function or method in the code chunk.
 * @property {string} [summary] - The AI-generated summary of the chunk.
 */

/**
 * @typedef {object} SearchResult
 * @property {string} text - The content of the search result.
 * @property {number} score - The relevance score of the result.
 * @property {SearchResultMetadata} metadata - Metadata associated with the result.
 */

export class Store {
  /**
   * @param {AIConfigForStore} config
   * @param {AI} aiInstance
   */
  constructor(config, aiInstance) {
    this.config = config;
    this.ai = aiInstance;
    /** @type {Database | null} */
    this.db = null;
  }

  async init() {
    if (process.platform === 'darwin') {
      try {
        Database.setCustomSQLite('/usr/local/opt/sqlite3/lib/libsqlite3.dylib');
      } catch (e) {
        console.warn(
          `[Store] Could not set custom SQLite library. If you're on macOS and this fails, please install SQLite with Homebrew ('brew install sqlite').`,
        );
      }
    }

    await ensureDir(dirname(this.config.db.path));

    this.db = new Database(this.config.db.path, { create: true });
    sqliteVec.load(this.db);

    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS vec_store USING vec0(
        embedding float[${this.config.db.dimensions}]
      );
      CREATE TABLE IF NOT EXISTS text_meta (
          vec_id INTEGER PRIMARY KEY,
          text_content TEXT NOT NULL,
          file_path TEXT,
          start_line INTEGER,
          end_line INTEGER,
          summary TEXT
      );
    `);

    const columns = this.db.prepare('PRAGMA table_info(text_meta)').all();
    if (
      !columns.some(
        (/** @type {{ name: string; }} */ c) => c.name === 'user_id',
      )
    ) {
      this.db.exec('ALTER TABLE text_meta ADD COLUMN user_id INTEGER');
    }
    if (
      !columns.some(
        (/** @type {{ name: string; }} */ c) => c.name === 'class_name',
      )
    ) {
      this.db.exec('ALTER TABLE text_meta ADD COLUMN class_name TEXT');
    }
    if (
      !columns.some(
        (/** @type {{ name: string; }} */ c) => c.name === 'function_name',
      )
    ) {
      this.db.exec('ALTER TABLE text_meta ADD COLUMN function_name TEXT');
    }
    if (
      !columns.some(
        (/** @type {{ name: string; }} */ c) => c.name === 'summary',
      )
    ) {
      this.db.exec('ALTER TABLE text_meta ADD COLUMN summary TEXT');
    }
  }

  /**
   * @param {Array<{content: string, embedding: Float32Array, metadata: any}>} documents
   */
  async indexBatch(documents) {
    if (!this.db) throw new AIErrors.StoreError('Database not initialized.');
    if (!documents || documents.length === 0) return;

    try {
      const tx = this.db.transaction((docs) => {
        if (!this.db)
          throw new AIErrors.StoreError('Database not initialized.');
        const insertVecStmt = this.db.prepare(
          'INSERT INTO vec_store (embedding) VALUES (?)',
        );
        const insertMetaStmt = this.db.prepare(
          'INSERT INTO text_meta (vec_id, text_content, file_path, user_id, start_line, end_line, class_name, function_name, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );

        for (const doc of docs) {
          const { lastInsertRowid } = insertVecStmt.run(doc.embedding);
          const meta = doc.metadata;
          insertMetaStmt.run(
            lastInsertRowid,
            doc.content,
            meta.filePath,
            meta.userId ?? null,
            meta.startLine,
            meta.endLine,
            meta.className ?? null,
            meta.functionName ?? null,
            meta.summary ?? null,
          );
        }
      });

      tx(documents);
    } catch (error) {
      const typedError =
        error instanceof Error ? error : new Error(String(error));
      throw new AIErrors.StoreError(
        'Failed to execute batch index.',
        typedError,
      );
    }
  }

  /**
   * @param {string} text
   * @param {any} metadata
   */
  async index(text, metadata) {
    if (!this.db) throw new AIErrors.StoreError('Database not initialized.');
    try {
      const embedding = await this.ai.embed(text);

      const tx = this.db.transaction(() => {
        if (!this.db)
          throw new AIErrors.StoreError('Database not initialized.');

        const { lastInsertRowid } = this.db
          .prepare('INSERT INTO vec_store (embedding) VALUES (?)')
          .run(embedding);

        this.db
          .prepare(
            'INSERT INTO text_meta (vec_id, text_content, file_path, user_id, start_line, end_line, class_name, function_name, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            lastInsertRowid,
            text,
            metadata.filePath,
            metadata.userId ?? null,
            metadata.startLine,
            metadata.endLine,
            metadata.className ?? null,
            metadata.functionName ?? null,
            metadata.summary ?? null,
          );
      });

      tx();
      return { success: true, text };
    } catch (error) {
      if (error instanceof AIErrors.AIError) throw error;
      throw new AIErrors.StoreError(
        `Failed to index chunk for ${metadata.filePath}.`,
        /** @type {Error} */ (error),
      );
    }
  }

  /**
   * @param {string} text
   * @param {Float32Array} embedding
   * @param {any} metadata
   */
  async indexWithEmbedding(text, embedding, metadata) {
    if (!this.db) throw new AIErrors.StoreError('Database not initialized.');
    try {
      const tx = this.db.transaction(() => {
        if (!this.db)
          throw new AIErrors.StoreError('Database not initialized.');
        const { lastInsertRowid } = this.db
          .prepare('INSERT INTO vec_store (embedding) VALUES (?)')
          .run(embedding);

        this.db
          .prepare(
            'INSERT INTO text_meta (vec_id, text_content, file_path, user_id, start_line, end_line, class_name, function_name, summary) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
          )
          .run(
            lastInsertRowid,
            text,
            metadata.filePath,
            metadata.userId ?? null,
            metadata.startLine,
            metadata.endLine,
            metadata.className ?? null,
            metadata.functionName ?? null,
            metadata.summary ?? null,
          );
      });

      tx();
      return { success: true, text };
    } catch (error) {
      if (error instanceof AIErrors.AIError) throw error;
      throw new AIErrors.StoreError(
        `Failed to index chunk for ${metadata.filePath}.`,
        /** @type {Error} */ (error),
      );
    }
  }
  /**
   * @param {string} filePath
   * @param {string | number | undefined} userId
   */
  async remove(filePath, userId) {
    if (!this.db) throw new AIErrors.StoreError('Database not initialized.');
    try {
      const tx = this.db.transaction(() => {
        if (!this.db)
          throw new AIErrors.StoreError('Database not initialized.');
        const records = this.db
          .prepare(
            'SELECT vec_id FROM text_meta WHERE file_path = ? AND (user_id = ? OR user_id IS NULL)',
          )
          .all(filePath, userId ?? null);
        if (records.length > 0) {
          const ids = records.map((/** @type {{vec_id: any}} */ r) => r.vec_id);
          const placeholders = ids.map(() => '?').join(',');
          this.db
            .prepare(`DELETE FROM vec_store WHERE rowid IN (${placeholders})`)
            .run(...ids);
          this.db
            .prepare(`DELETE FROM text_meta WHERE vec_id IN (${placeholders})`)
            .run(...ids);
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
   * @param {string} query
   * @param {number} [limit=5]
   * @param {{userId?: string | number}} [where={}]
   */
  async search(query, limit = 5, where = {}) {
    if (!this.db) throw new AIErrors.StoreError('Database not initialized.');
    try {
      const embedding = await this.ai.embed(query);
      if (!embedding || embedding.length === 0) return [];

      const candidateLimit = limit * 10;
      let whereClause = '';
      /** @type {any[]} */
      const params = [embedding, candidateLimit];

      if (where.userId) {
        whereClause = 'WHERE meta.user_id = ?';
        params.push(where.userId);
      }

      const sql = `
        SELECT
          meta.text_content as text,
          meta.file_path as filePath,
          meta.start_line as startLine,
          meta.end_line as endLine,
          meta.class_name as className,
          meta.function_name as functionName,
          meta.summary as summary,
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

      const candidateResults = this.db.query(sql).all(...params);

      /** @type {Map<string, SearchResult>} */
      const uniqueFileResults = new Map();
      for (const result of candidateResults) {
        const filePath = /** @type {string} */ (result.filePath);
        const existing = uniqueFileResults.get(filePath);
        if (
          !existing ||
          /** @type {number} */ (result.score) < existing.score
        ) {
          uniqueFileResults.set(filePath, {
            text: /** @type {string} */ (result.text),
            score: /** @type {number} */ (result.score),
            metadata: {
              filePath: filePath,
              startLine: /** @type {number} */ (result.startLine),
              endLine: /** @type {number} */ (result.endLine),
              className: /** @type {string | undefined} */ (result.className),
              functionName: /** @type {string | undefined} */ (
                result.functionName
              ),
              summary: /** @type {string | undefined} */ (result.summary),
            },
          });
        }
      }

      return Array.from(uniqueFileResults.values())
        .sort((a, b) => a.score - b.score)
        .slice(0, limit);
    } catch (error) {
      if (error instanceof AIErrors.AIError) throw error;
      throw new AIErrors.StoreError(
        `Failed to execute search.`,
        /** @type {Error} */ (error),
      );
    }
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
