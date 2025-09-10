import * as sqliteVec from 'sqlite-vec';
import { AIErrors } from './errors.js';
import { Database } from 'bun:sqlite';

export class Store {
  constructor(config, aiInstance) {
    this.config = config;
    this.ai = aiInstance;
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
    if (!columns.some((c) => c.name === 'user_id')) {
      this.db.exec('ALTER TABLE text_meta ADD COLUMN user_id INTEGER');
    }
  }

  async index(text, metadata = {}) {
    try {
      const embedding = await this.ai.embed(text);
      if (!embedding || embedding.length === 0) {
        throw new AIErrors.EmbeddingError('Generated an empty embedding.');
      }

      const tx = this.db.transaction(() => {
        const existing = this.db
          .query(
            'SELECT vec_id FROM text_meta WHERE file_path = ? AND user_id = ?',
          )
          .get(metadata.filePath, metadata.userId);

        if (existing) {
          this.db
            .query('UPDATE vec_store SET embedding = ? WHERE rowid = ?')
            .run(embedding, existing.vec_id);
          this.db
            .query('UPDATE text_meta SET text_content = ? WHERE vec_id = ?')
            .run(text, existing.vec_id);
        } else {
          const { lastInsertRowid } = this.db
            .query('INSERT INTO vec_store (embedding) VALUES (?)')
            .run(embedding);
          this.db
            .query(
              'INSERT INTO text_meta (vec_id, text_content, file_path, user_id) VALUES (?, ?, ?, ?)',
            )
            .run(lastInsertRowid, text, metadata.filePath, metadata.userId);
        }
      });

      tx();
      return { success: true, text };
    } catch (error) {
      if (error instanceof AIErrors.AIError) throw error;
      throw new AIErrors.StoreError(`Failed to index document.`, error);
    }
  }

  async remove(filePath, userId) {
    try {
      const tx = this.db.transaction(() => {
        const record = this.db
          .query(
            'SELECT vec_id FROM text_meta WHERE file_path = ? AND user_id = ?',
          )
          .get(filePath, userId);
        if (record) {
          this.db
            .query('DELETE FROM vec_store WHERE rowid = ?')
            .run(record.vec_id);
          this.db
            .query('DELETE FROM text_meta WHERE vec_id = ?')
            .run(record.vec_id);
        }
      });
      tx();
      return { success: true, filePath };
    } catch (error) {
      throw new AIErrors.StoreError(
        `Failed to remove document index for ${filePath}.`,
        error,
      );
    }
  }

  async search(query, limit = 5, where = {}) {
    try {
      const embedding = await this.ai.embed(query);
      if (!embedding || embedding.length === 0) return [];

      let whereClause = '';
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

      const results = this.db.query(sql).all(...params);

      return results.map((row) => ({
        text: row.text,
        score: row.score,
        metadata: {
          filePath: row.filePath,
        },
      }));
    } catch (error) {
      if (error instanceof AIErrors.AIError) throw error;
      throw new AIErrors.StoreError(`Failed to execute search.`, error);
    }
  }

  async seed() {
    console.log('[Store] Seeding database with initial data...');
    let count = 0;
    for (const text of this.config.seedData) {
      try {
        await this.index(text, { filePath: 'seed_data.txt' });
        count++;
      } catch (e) {
        console.warn(
          `[Store] Skipping seed document due to error: ${e.message}`,
        );
      }
    }
    console.log(`[Store] Seeding complete. Added ${count} documents.`);
    return { success: true, documentsAdded: count };
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}
