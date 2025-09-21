import { generateUUID } from '../shared/utils.js';
import { Ollama } from 'ollama';
import { createLogger } from '../shared/logger.js';
import * as sqliteVec from 'sqlite-vec';
import { Database } from 'bun:sqlite';
import { dirname } from 'path';
import { ensureDir } from './server-setup.js';

const logger = createLogger('[AI]');
const toolLogger = createLogger('[AI Tools]');
const storeLogger = createLogger('[Store]');
const errorLogger = createLogger('[Errors]');

/**
 * A base error class for all AI-related operations, providing a consistent
 * structure for error handling and serialization across client and server boundaries.
 * @class AIError
 * @extends {Error}
 * @property {Error | null} originalError - The original error that was caught, if any.
 */
export class AIError extends Error {
  /**
   * Creates an instance of AIError.
   * @param {string} message - The error message.
   * @param {Error | null} [originalError=null] - The original error object.
   */
  constructor(message, originalError = null) {
    const detailedMessage = originalError?.message
      ? `${message} -> ${originalError.message}`
      : message;
    super(detailedMessage);
    this.name = this.constructor.name;
    this.originalError = originalError;
    errorLogger.error(`[AIError] ${detailedMessage}`);
  }

  /**
   * Serializes the error to a plain object for transport.
   * @returns {{name: string, message: string}}
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
    };
  }
}

/** Error for timed-out operations. */
export class TimeoutError extends AIError {}
/** Error related to generating embeddings. */
export class EmbeddingError extends AIError {}
/** Error during a chat session. */
export class ChatError extends AIError {}
/** Error related to the vector store. */
export class StoreError extends AIError {}

/**
 * A namespace containing all specialized AI error classes, allowing for
 * precise error identification and handling.
 */
export const AIErrors = {
  AIError,
  TimeoutError,
  EmbeddingError,
  ChatError,
  StoreError,
};

/**
 * @typedef {object} AIConfigForStore
 * @property {string} host
 * @property {{chat: string, embedding: string, labeling: string, agent?: string}} models
 * @property {{path: string, dimensions: number}} db
 */

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

class Store {
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
        storeLogger.warn(
          `Could not set custom SQLite library. If you're on macOS and this fails, please install SQLite with Homebrew ('brew install sqlite').`,
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
      if (!embedding) {
        throw new AIErrors.EmbeddingError(
          'Failed to generate embedding for indexing.',
        );
      }

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

/**
 * @typedef {import('bun:sqlite').Database} BunDatabase
 * @typedef {import('bun').Server} BunServer
 */

/**
 * @typedef {import('ollama').ToolCall} ToolCall
 * @typedef {import('ollama').Message} ChatMessage
 */

/**
 * @typedef {import('ollama').Tool} Tool
 */

/**
 * @typedef {object} AIConfig
 * @property {string} host
 * @property {{chat: string, embedding: string, labeling: string, agent?: string}} models
 * @property {{path: string, dimensions: number}} db
 */

/**
 * @typedef {object} AgentDefinition
 * @property {string} name
 * @property {string} system_prompt
 * @property {Tool[]} tools
 * @property {string} [model]
 * @property {{ maxIterations?: number, temperature?: number }} [config]
 * @property {any} component
 */

/**
 * @typedef {object} ChatContext
 * @property {BunDatabase} db
 * @property {any} user
 * @property {Record<string, Function>} syncActions
 * @property {BunServer} server
 */

/**
 * A utility to retry an async function with exponential backoff.
 * @template T
 * @param {() => Promise<T>} fn The async function to execute.
 * @param {number} [retries=3] The number of retries.
 * @param {number} [delay=1000] The initial delay in milliseconds.
 * @returns {Promise<T>}
 */
async function retryWithBackoff(fn, retries = 3, delay = 1000) {
  try {
    return await fn();
  } catch (error) {
    if (retries > 0) {
      logger.warn(
        `Operation failed. Retrying in ${delay}ms... (${retries} retries left)`,
      );
      await new Promise((res) => setTimeout(res, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    logger.error('Operation failed after all retries.');
    throw error;
  }
}

export class AI {
  /** @param {AIConfig} config */
  constructor(config) {
    this.config = config;
    this.store = new Store(config, this);
    this.ollama = new Ollama({ host: config.host });
    this.isReady = false;
  }

  /**
   * @param {BunServer} _server
   * @param {Record<string, AgentDefinition>} [_agentDefs]
   */
  initialize(_server, _agentDefs = {}) {}

  async init() {
    if (this.isReady) return;
    logger.info('Initializing...');
    try {
      await this.ollama.list();
      logger.info('Ollama connection successful.');
    } catch (e) {
      throw new AIErrors.AIError(
        `Failed to connect to Ollama at ${this.config.host}. Is Ollama running?`,
        e instanceof Error ? e : new Error(String(e)),
      );
    }
    await this.store.init();
    this.isReady = true;
    logger.info('Ready.');
  }

  async shutdown() {
    if (!this.isReady) return;
    logger.info('Shutting down...');
    this.store.close();
    this.isReady = false;
    await new Promise((resolve) => setTimeout(resolve, 100));
    logger.info('Shutdown complete.');
  }

  /**
   * @param {Array<{path: string, content: string}>} files
   * @param {object & {userId?: string}} [metadata={}]
   */
  async indexDirectory(files, metadata = {}) {
    if (!files || files.length === 0) {
      return { successful: 0, failed: 0 };
    }
    logger.info(`Starting batch indexing for ${files.length} files...`);

    for (const file of files) {
      await this.removeFileIndex(file.path, metadata);
    }

    const filesToProcess = files.filter(
      (f) => f.content && f.content.trim().length > 0,
    );
    const contents = filesToProcess.map((f) => f.content);

    if (contents.length === 0) {
      logger.info('No non-empty files to index.');
      return { successful: files.length, failed: 0 };
    }

    try {
      const embeddings = await this.embedBatch(contents);
      const documentsToIndex = [];

      for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const embedding = embeddings[i];
        if (file && embedding) {
          documentsToIndex.push({
            content: file.content,
            embedding: embedding,
            metadata: {
              filePath: file.path,
              startLine: 1,
              endLine: file.content.split('\n').length,
              ...metadata,
            },
          });
        }
      }

      await this.store.indexBatch(documentsToIndex);

      const successfulCount =
        documentsToIndex.length + (files.length - filesToProcess.length);
      logger.info(
        `Batch indexing complete. Indexed ${successfulCount} files successfully.`,
      );
      return { successful: successfulCount, failed: 0 };
    } catch (error) {
      logger.error('Batch indexing failed:', error);
      return { successful: 0, failed: files.length };
    }
  }

  /**
   * @param {{ path: string, content: string }} file
   * @param {object & {userId?: string}} [metadata={}]
   */
  async indexFile(file, metadata = {}) {
    if (!file.path || typeof file.content !== 'string') {
      logger.warn(
        `Skipping invalid file data for: ${file.path || 'unknown file'}`,
      );
      return false;
    }

    logger.info(`- Processing file: ${file.path}`);
    try {
      await this.removeFileIndex(file.path, metadata);

      if (file.content.trim() === '') {
        logger.info(`- Skipped indexing empty file: ${file.path}`);
        return true;
      }

      const content = file.content;
      const lines = content.split('\n').length;
      const embedding = await this.embed(content);

      if (embedding) {
        await this.store.indexWithEmbedding(content, embedding, {
          filePath: file.path,
          startLine: 1,
          endLine: lines,
          ...metadata,
        });
      } else {
        throw new AIErrors.EmbeddingError(
          `Ollama returned an empty embedding for ${file.path}.`,
        );
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      logger.error(`Failed to index file: ${file.path}`, errorMessage);
      return false;
    }
  }

  /**
   * @param {string} filePath
   * @param {object & {userId?: string}} [metadata={}]
   */
  async removeFileIndex(filePath, metadata = {}) {
    logger.info(`Removing index for file: ${filePath}`);
    try {
      await this.store.remove(filePath, metadata.userId);
    } catch (error) {
      logger.error(`Failed to remove index for ${filePath}:`, error);
    }
  }

  /** @param {string} text */
  async embed(text) {
    try {
      const res = await retryWithBackoff(() =>
        this.ollama.embed({
          model: this.config.models.embedding,
          input: text,
        }),
      );

      const embedding = res.embeddings && res.embeddings[0];
      if (!embedding || embedding.length === 0) {
        throw new AIErrors.EmbeddingError(
          'Ollama returned an empty embedding.',
        );
      }
      return new Float32Array(embedding);
    } catch (error) {
      throw new AIErrors.EmbeddingError(
        'Failed to generate embedding.',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /** @param {string[]} texts */
  async embedBatch(texts) {
    if (!texts || texts.length === 0) {
      return [];
    }
    try {
      const res = await retryWithBackoff(() =>
        this.ollama.embed({
          model: this.config.models.embedding,
          input: texts,
        }),
      );

      if (!res.embeddings || res.embeddings.length !== texts.length) {
        throw new AIErrors.EmbeddingError(
          'Ollama returned mismatched number of embeddings for batch.',
        );
      }
      return res.embeddings.map((e) => (e ? new Float32Array(e) : undefined));
    } catch (error) {
      throw new AIErrors.EmbeddingError(
        'Failed to generate batch embeddings.',
        error instanceof Error ? error : new Error(String(error)),
      );
    }
  }

  /**
   * @param {string} prompt
   * @param {object} [options={}]
   * @returns {AsyncGenerator<string>}
   */
  async *generate(prompt, options = {}) {
    try {
      if (!prompt) {
        throw new AIErrors.ChatError('Prompt cannot be empty.');
      }

      const modelToUse =
        /** @type {any} */ (options).model || this.config.models.chat;
      const stream = await retryWithBackoff(() =>
        this.ollama.generate({
          model: modelToUse,
          prompt,
          stream: true,
          options,
        }),
      );

      for await (const chunk of stream) {
        yield chunk.response;
      }
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      throw new AIError(
        'An unknown error occurred during generation.',
        error instanceof Error ? error : null,
      );
    }
  }

  /**
   * @param {ChatMessage[]} messages
   * @param {object} [options={}]
   * @returns {AsyncGenerator<string>}
   */
  async *chat(messages, options = {}) {
    try {
      if (!messages || messages.length === 0) {
        throw new AIErrors.ChatError('Messages array cannot be empty.');
      }

      const modelToUse =
        /** @type {any} */ (options).model || this.config.models.chat;
      const stream = await retryWithBackoff(() =>
        this.ollama.chat({
          model: modelToUse,
          messages,
          stream: true,
          options,
        }),
      );

      for await (const chunk of stream) {
        if (chunk.message.content) {
          yield chunk.message.content;
        }
      }
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      throw new AIError(
        'An unknown error occurred during chat.',
        error instanceof Error ? error : null,
      );
    }
  }

  /**
   * @param {{message: ChatMessage, options?: { model?: string }}} params
   * @param {ChatContext} context
   * @returns {Promise<{chatId: string, title: string}>}
   */
  async createChat({ message }, context) {
    const { user, syncActions } = context;
    const chatId = generateUUID();

    const titlePrompt = `Based on the following user query, suggest a short, URL-friendly (kebab-case) title for the chat session: "${message.content}"`;
    const titleResponse = await this.ollama.generate({
      model: this.config.models.labeling,
      prompt: titlePrompt,
    });

    const title = titleResponse.response
      .trim()
      .toLowerCase()
      .replace(/['"]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '');

    const chat = {
      id: chatId,
      name: title,
      topic: message.content.substring(0, 100),
      owner_id: user.id,
      created_at: new Date().toISOString(),
    };
    if (syncActions.upsertChats) {
      syncActions.upsertChats({ user }, chat);
    }

    const userMessage = {
      id: generateUUID(),
      chat_id: chatId,
      username: user.username,
      message: message.content,
      user_id: user.id,
      created_at: new Date().toISOString(),
    };
    if (syncActions.upsertChat_messages) {
      syncActions.upsertChat_messages({ user }, userMessage);
    }

    return { chatId, title };
  }

  /** @param {ChatContext} context */
  getChats(context) {
    const { db, user } = context;
    return db
      .query('SELECT * FROM chats WHERE owner_id = ? ORDER BY created_at DESC')
      .all(user.id);
  }

  /**
   * @param {string} id
   * @param {Partial<{name: string, topic: string}>} updates
   * @param {ChatContext} context
   */
  updateChat(id, updates, context) {
    const { db, user, syncActions } = context;
    const chat = db
      .query('SELECT * FROM chats WHERE id = ? AND owner_id = ?')
      .get(id, user.id);
    if (!chat) throw new AIError('Chat not found or access denied.');

    const finalUpdates = { ...chat, ...updates, id };
    if (syncActions.upsertChats) {
      syncActions.upsertChats({ user }, finalUpdates);
    }
    return db.query('SELECT * FROM chats WHERE id = ?').get(id);
  }

  /**
   * @param {string} id
   * @param {ChatContext} context
   */
  deleteChat(id, context) {
    const { db, user, syncActions } = context;
    const chat = db
      .query('SELECT id FROM chats WHERE id = ? AND owner_id = ?')
      .get(id, user.id);
    if (!chat) throw new AIError('Chat not found or access denied.');

    if (syncActions.deleteChats) {
      syncActions.deleteChats({ user }, { id });
    }
    return { success: true };
  }

  /**
   * @param {ChatMessage[]} messages
   * @param {AgentDefinition} agentDef
   * @param {any} toolContext
   * @param {object} [options={}]
   * @returns {AsyncGenerator<string>}
   */
  async *agent(messages, agentDef, toolContext, options = {}) {
    try {
      const agentComponent = agentDef.component;
      const model =
        agentDef.model ||
        /** @type {any} */ (options).model ||
        this.config.models.agent;
      const maxIterations = agentDef.config?.maxIterations ?? 5;

      let currentMessages = [...messages];
      if (agentDef.system_prompt) {
        currentMessages.unshift({
          role: 'system',
          content: agentDef.system_prompt,
        });
      }

      for (let i = 0; i < maxIterations; i++) {
        const stream = await retryWithBackoff(() =>
          this.ollama.chat({
            model: /** @type {string} */ (model),
            messages: currentMessages,
            tools: agentDef.tools,
            stream: true,
            options,
          }),
        );

        let responseMessage = {
          role: /** @type {const} */ ('assistant'),
          content: '',
          tool_calls: /** @type {ToolCall[]} */ ([]),
        };

        for await (const chunk of stream) {
          const chunkMessage = chunk.message;
          if (chunkMessage.content) {
            responseMessage.content += chunkMessage.content;
            yield JSON.stringify({
              type: 'chunk',
              content: chunkMessage.content,
            }) + '\n';
          }
          if (chunkMessage.tool_calls) {
            responseMessage.tool_calls = chunkMessage.tool_calls;
          }
        }

        if (
          !responseMessage.tool_calls ||
          responseMessage.tool_calls.length === 0
        ) {
          break;
        }

        currentMessages.push(responseMessage);
        const toolResults = [];
        for (const toolCall of responseMessage.tool_calls) {
          const toolName = toolCall.function.name;
          const toolArgs = toolCall.function.arguments;
          const toolFn = agentComponent[toolName];

          if (typeof toolFn === 'function') {
            yield JSON.stringify({
              type: 'tool_start',
              name: toolName,
              args: toolArgs,
            }) + '\n';
            const result = await toolFn(toolContext, toolArgs);
            yield JSON.stringify({
              type: 'tool_end',
              name: toolName,
              result: result,
            }) + '\n';
            toolResults.push({
              role: 'tool',
              content: JSON.stringify(result),
              tool_call_id: /** @type {any} */ (toolCall).id,
            });
          }
        }
        currentMessages.push(...toolResults);
      }
    } catch (error) {
      if (error instanceof AIError) {
        throw error;
      }
      throw new AIError(
        'An unknown error occurred during agent execution.',
        error instanceof Error ? error : null,
      );
    }
  }

  /**
   * @param {string} query
   * @param {number} [limit=5]
   * @param {object} [where={}]
   */
  async search(query, limit = 5, where = {}) {
    return this.store.search(query, limit, where);
  }

  async list() {
    const response = await this.ollama.list();
    return response.models;
  }

  /**
   * @param {string} model
   * @param {any} [options]
   * @returns {AsyncGenerator<string>}
   */
  async *pull(model, options) {
    const stream = await this.ollama.pull({ model, stream: true, ...options });

    for await (const chunk of stream) {
      yield JSON.stringify(chunk) + '\n';
    }
  }

  /** @param {string} model */
  async delete(model) {
    return this.ollama.delete({ model });
  }
}

/**
 * @file Provides a standard library of general-purpose tools for AI agents.
 * These tools are designed to integrate seamlessly with the framework's core features,
 * such as the user-scoped file system, database, and vector search.
 */

/**
 * @typedef {import('../server/fs.server.js').ServerFsApi} ServerFsApi
 * @typedef {import('../server/authentication.js').UserInfo} UserInfo
 */

/**
 * The execution context provided to every tool implementation.
 * @typedef {object} ToolExecutionContext
 * @property {BunDatabase} db - The server-side database instance.
 * @property {UserInfo} user - The currently authenticated user.
 * @property {ServerFsApi} fs - The file system API, sandboxed to the current user.
 * @property {AI} ai - The core AI service for capabilities like semantic search.
 * @property {Record<string, Function>} syncActions - Real-time synchronization actions.
 * @property {import('bun').Server} server - The Bun server instance.
 */

const getChatsDefinition = {
  type: 'function',
  function: {
    name: 'getChats',
    description: "Retrieves a list of the user's past chats.",
    parameters: { type: 'object', properties: {} },
  },
};

/** @param {ToolExecutionContext} context */
function getChats(context) {
  toolLogger.info(`[Tool] Executing getChats for user ${context.user.id}`);
  try {
    return context.ai.getChats(context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while fetching chats: ${message}`;
  }
}

const updateChatDefinition = {
  type: 'function',
  function: {
    name: 'updateChat',
    description: 'Updates the title or topic of a specific chat.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the chat to update.' },
        name: {
          type: 'string',
          description: 'The new name/title for the chat.',
        },
        topic: { type: 'string', description: 'The new topic for the chat.' },
      },
      required: ['id'],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ id: string, name?: string, topic?: string }} args
 */
function updateChat(context, args) {
  const { id, ...updates } = args;
  toolLogger.info(
    `[Tool] Executing updateChat for user ${context.user.id} on chat ${id}`,
  );
  try {
    return context.ai.updateChat(id, updates, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while updating the chat: ${message}`;
  }
}

const deleteChatDefinition = {
  type: 'function',
  function: {
    name: 'deleteChat',
    description: 'Deletes a chat and all of its associated messages.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'The ID of the chat to delete.' },
      },
      required: ['id'],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ id: string }} args
 */
function deleteChat(context, args) {
  toolLogger.info(
    `[Tool] Executing deleteChat for user ${context.user.id} on chat ${args.id}`,
  );
  try {
    return context.ai.deleteChat(args.id, context);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while deleting the chat: ${message}`;
  }
}

const listFilesDefinition = {
  type: 'function',
  function: {
    name: 'listFiles',
    description:
      "List files and directories at a given path within the user's private file system.",
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description:
            "The directory path to list. Defaults to the user's root directory.",
        },
      },
      required: [],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ path?: string }} args
 */
async function listFiles(context, args) {
  toolLogger.info(
    `[Tool] Executing listFiles for user ${context.user.id} at path '${
      args.path || '.'
    }'`,
  );
  try {
    const files = await context.fs.ls(args.path || '.');
    if (files.length === 0) {
      return 'The directory is empty or does not exist.';
    }
    return files
      .map((f) => `${f.isDirectory ? '[DIR] ' : ''}${f.path}`)
      .join('\n');
  } catch (error) {
    toolLogger.error('listFiles tool failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while listing files: ${message}`;
  }
}

const readFileDefinition = {
  type: 'function',
  function: {
    name: 'readFile',
    description:
      "Read the full contents of a specific file from the user's private file system.",
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The full path to the file to read.',
        },
      },
      required: ['path'],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ path: string }} args
 */
async function readFile(context, args) {
  toolLogger.info(
    `[Tool] Executing readFile for user ${context.user.id} on path '${args.path}'`,
  );
  try {
    const file = await context.fs.cat(args.path);
    return await file.text();
  } catch (error) {
    toolLogger.error('readFile tool failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while reading the file: ${message}`;
  }
}

const writeFileDefinition = {
  type: 'function',
  function: {
    name: 'writeFile',
    description:
      "Write or overwrite a file with new content in the user's private file system. This will automatically index the file for semantic search.",
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The full path where the file should be written.',
        },
        content: {
          type: 'string',
          description: 'The new content of the file.',
        },
      },
      required: ['path', 'content'],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ path: string, content: string }} args
 */
async function writeFile(context, args) {
  toolLogger.info(
    `[Tool] Executing writeFile for user ${context.user.id} on path '${args.path}'`,
  );
  try {
    await context.fs.write(args.path, args.content);
    await context.ai.indexFile(
      { path: args.path, content: args.content },
      { userId: String(context.user.id) },
    );
    return `Successfully wrote ${args.content.length} bytes to ${args.path}.`;
  } catch (error) {
    toolLogger.error('writeFile tool failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while writing the file: ${message}`;
  }
}

const getTodosDefinition = {
  type: 'function',
  function: {
    name: 'getTodos',
    description:
      "Get the user's list of to-do items. Returns the item's content, status, and ID.",
    parameters: {
      type: 'object',
      properties: {
        status: {
          type: 'string',
          description: 'Filter by status.',
          enum: ['all', 'completed', 'pending'],
        },
      },
      required: [],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ status?: 'all' | 'completed' | 'pending' }} args
 */
function getTodos(context, args) {
  toolLogger.info(
    `[Tool] Executing getTodos for user ${context.user.id} with status '${
      args.status || 'all'
    }'`,
  );
  try {
    let query = 'SELECT id, content, completed FROM todos WHERE user_id = ?';
    const params = [context.user.id];

    if (args.status === 'completed') {
      query += ' AND completed = 1';
    } else if (args.status === 'pending') {
      query += ' AND completed = 0';
    }

    const todos = context.db.query(query).all(...params);
    if (todos.length === 0) {
      return 'The user has no to-do items matching the criteria.';
    }
    return todos
      .map((t) => `${t.completed ? '[x]' : '[ ]'} ${t.content} (ID: ${t.id})`)
      .join('\n');
  } catch (error) {
    toolLogger.error('getTodos tool failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while fetching todos: ${message}`;
  }
}

const addTodoDefinition = {
  type: 'function',
  function: {
    name: 'addTodo',
    description: "Adds a new to-do item to the user's list.",
    parameters: {
      type: 'object',
      properties: {
        content: {
          type: 'string',
          description: 'The content of the to-do item.',
        },
      },
      required: ['content'],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ content: string }} args
 */
function addTodo(context, args) {
  toolLogger.info(
    `[Tool] Executing addTodo for user ${context.user.id} with content "${args.content}"`,
  );
  try {
    if (!context.syncActions.upsertTodos) {
      return 'Error: The upsertTodos action is not available.';
    }
    const newTodo = {
      id: generateUUID(),
      content: args.content,
      completed: 0,
      user_id: context.user.id,
    };
    context.syncActions.upsertTodos({ user: context.user }, newTodo);
    return `Successfully added new to-do with ID: ${newTodo.id}.`;
  } catch (error) {
    toolLogger.error('addTodo tool failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while adding the todo: ${message}`;
  }
}

const updateTodoDefinition = {
  type: 'function',
  function: {
    name: 'updateTodo',
    description:
      'Updates an existing to-do item, such as changing its content or marking it as complete.',
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the to-do item to update.',
        },
        content: {
          type: 'string',
          description: 'The new content for the to-do item.',
        },
        completed: {
          type: 'boolean',
          description:
            'The new completion status (true for complete, false for pending).',
        },
      },
      required: ['id'],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ id: string, content?: string, completed?: boolean }} args
 */
function updateTodo(context, args) {
  toolLogger.info(
    `[Tool] Executing updateTodo for user ${context.user.id} on todo ${args.id}`,
  );
  try {
    if (!context.syncActions.upsertTodos) {
      return 'Error: The upsertTodos action is not available.';
    }
    const existingTodo = context.db
      .query('SELECT * FROM todos WHERE id = ? AND user_id = ?')
      .get(args.id, context.user.id);

    if (!existingTodo) {
      return `Error: To-do with ID ${args.id} not found.`;
    }

    const updatedTodo = {
      ...existingTodo,
      content: args.content !== undefined ? args.content : existingTodo.content,
      completed:
        args.completed !== undefined
          ? args.completed
            ? 1
            : 0
          : existingTodo.completed,
    };

    context.syncActions.upsertTodos({ user: context.user }, updatedTodo);
    return `Successfully updated to-do with ID: ${args.id}.`;
  } catch (error) {
    toolLogger.error('updateTodo tool failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while updating the todo: ${message}`;
  }
}

const deleteTodoDefinition = {
  type: 'function',
  function: {
    name: 'deleteTodo',
    description: "Deletes a to-do item from the user's list.",
    parameters: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'The ID of the to-do item to delete.',
        },
      },
      required: ['id'],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ id: string }} args
 */
function deleteTodo(context, args) {
  toolLogger.info(
    `[Tool] Executing deleteTodo for user ${context.user.id} on todo ${args.id}`,
  );
  try {
    if (!context.syncActions.deleteTodos) {
      return 'Error: The deleteTodos action is not available.';
    }
    const existingTodo = context.db
      .query('SELECT id FROM todos WHERE id = ? AND user_id = ?')
      .get(args.id, context.user.id);

    if (!existingTodo) {
      return `Error: To-do with ID ${args.id} not found or you do not have permission to delete it.`;
    }

    context.syncActions.deleteTodos({ user: context.user }, { id: args.id });
    return `Successfully deleted to-do with ID: ${args.id}.`;
  } catch (error) {
    toolLogger.error('deleteTodo tool failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred while deleting the todo: ${message}`;
  }
}

const semanticSearchDefinition = {
  type: 'function',
  function: {
    name: 'semanticSearch',
    description:
      "Search the user's indexed files based on semantic meaning, not just keywords. Useful for finding documents related to a concept.",
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The conceptual query to search for.',
        },
      },
      required: ['query'],
    },
  },
};

/**
 * @param {ToolExecutionContext} context
 * @param {{ query: string }} args
 */
async function semanticSearch(context, args) {
  toolLogger.info(
    `[Tool] Executing semanticSearch for user ${context.user.id} with query '${args.query}'`,
  );
  try {
    const results = await context.ai.search(args.query, 3, {
      userId: context.user.id,
    });
    if (!results || results.length === 0) {
      return 'No relevant files found for that query.';
    }
    return (
      `Found ${results.length} relevant file(s):\n` +
      results
        .map(
          (r) =>
            `- ${r.metadata.filePath} (relevance score: ${r.score.toFixed(3)})`,
        )
        .join('\n')
    );
  } catch (error) {
    toolLogger.error('semanticSearch tool failed:', error);
    const message = error instanceof Error ? error.message : String(error);
    return `An error occurred during semantic search: ${message}`;
  }
}

/**
 * An object containing all core tool implementations, keyed by their function name.
 * This can be spread into an agent's default export.
 */
export const coreTools = {
  getChats,
  updateChat,
  deleteChat,
  listFiles,
  readFile,
  writeFile,
  getTodos,
  addTodo,
  updateTodo,
  deleteTodo,
  semanticSearch,
};

/**
 * An array containing all core tool definitions.
 * This can be spread into an agent's `tools` export.
 */
export const allTools = [
  getChatsDefinition,
  updateChatDefinition,
  deleteChatDefinition,
  listFilesDefinition,
  readFileDefinition,
  writeFileDefinition,
  getTodosDefinition,
  addTodoDefinition,
  updateTodoDefinition,
  deleteTodoDefinition,
  semanticSearchDefinition,
];
