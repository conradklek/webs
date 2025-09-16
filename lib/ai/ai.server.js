/**
 * @file Server-side AI service class that orchestrates embedding generation,
 * chat functionality, and vector store management.
 */

import { generateUUID } from '../utils/common.js';
import { createRagPrompt } from './rag.js';
import { Store } from './vector-store.js';
import { AIErrors } from './ai.errors.js';
import { EventEmitter } from 'events';
import { Ollama } from 'ollama';

/**
 * @typedef {import('./ai.client.js').ChatMessage} ChatMessage
 * @typedef {import('./vector-store.js').SearchResult} SearchResult
 * @typedef {import('bun:sqlite').Database} BunDatabase
 * @typedef {import('bun').Server} BunServer
 * @typedef {import('bun').Subprocess} Subprocess
 * @typedef {import('bun').WebSocket} WebSocket
 * @typedef {import('bun').ErrorLike} ErrorLike
 */

/**
 * Main AI service class for the server.
 */
export class AI {
  /** @type {BunDatabase | null} */
  #db = null;
  /** @type {BunServer | null} */
  #server = null;

  /**
   * Creates an instance of the AI service.
   * @param {object} config - The AI configuration object.
   * @param {string} config.host - The Ollama host URL.
   * @param {{chat: string, embedding: string}} config.models - The default models to use.
   * @param {{path: string}} config.worker - Path to the AI worker script.
   * @param {object} config.db - The database configuration for the vector store.
   * @param {string} config.db.path - Path to the vector store SQLite file.
   * @param {number} config.db.dimensions - The embedding dimensions.
   */
  constructor(config) {
    /** @type {typeof config} */
    this.config = config;
    /** @type {Store} */
    this.store = new Store(config, this);
    /** @type {Subprocess | null} */
    this.worker = null;
    /** @type {Ollama} */
    this.ollama = new Ollama({ host: config.host });
    /** @type {boolean} */
    this.isReady = false;
    /** @type {EventEmitter} */
    this.requestEmitter = new EventEmitter();
  }

  /**
   * Initializes the AI service with server and database instances.
   * @param {BunServer} server - The Bun server instance.
   * @param {BunDatabase} db - The database instance.
   */
  initialize(server, db) {
    this.#db = db;
    this.#server = server;
  }

  /**
   * Starts the AI worker subprocess and initializes the vector store.
   * @returns {Promise<void>}
   */
  async init() {
    if (this.isReady) return;
    console.log('[AI] Initializing...');
    const workerPath = this.config.worker.path;
    if (!(await Bun.file(workerPath).exists())) {
      throw new Error(`[AI] Worker script not found at: ${workerPath}`);
    }
    this.worker = Bun.spawn(['bun', workerPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
      ipc: (/** @type {{streamId?: string, opId?: string}} */ message) => {
        const channel = message.streamId || message.opId;
        if (channel) this.requestEmitter.emit(channel, message);
      },
      onExit: (_subprocess, code, _signal, error) => {
        console.warn(`[AI] Worker process exited with code: ${code}.`);
        if (error) {
          console.error('[AI] Worker process exited with error:', error);
        }
      },
      env: {
        ...process.env,
        OLLAMA_HOST: this.config.host,
        CHAT_MODEL: this.config.models.chat,
      },
    });
    await this.store.init();
    this.isReady = true;
    console.log('[AI] Ready.');
  }

  /**
   * Shuts down the AI service and kills the worker process.
   * @returns {Promise<void>}
   */
  async shutdown() {
    if (!this.isReady) return;
    console.log('[AI] Shutting down...');
    this.worker?.kill();
    this.store.close();
    this.isReady = false;
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('[AI] Shutdown complete.');
  }

  /**
   * Indexes a file's content in the vector store.
   * @param {string} filePath - The path of the file to index.
   * @param {string} fileContent - The content of the file.
   * @param {object} [metadata={}] - Additional metadata to store.
   * @returns {Promise<void>}
   */
  async indexFile(filePath, fileContent, metadata = {}) {
    if (
      !filePath ||
      typeof fileContent !== 'string' ||
      fileContent.trim() === ''
    )
      return;
    console.log(`[AI] Indexing file: ${filePath}`);
    try {
      await this.store.index(fileContent, { filePath, ...metadata });
    } catch (/** @type {any} */ error) {
      console.error(`[AI] Failed to index file ${filePath}:`, error);
    }
  }

  /**
   * Removes a file's index from the vector store.
   * @param {string} filePath - The path of the file to remove.
   * @param {{userId?: string}} [metadata={}] - Metadata containing the user ID.
   * @returns {Promise<void>}
   */
  async removeFileIndex(filePath, metadata = {}) {
    console.log(`[AI] Removing index for file: ${filePath}`);
    try {
      await this.store.remove(filePath, metadata.userId);
    } catch (/** @type {any} */ error) {
      console.error(`[AI] Failed to remove index for ${filePath}:`, error);
    }
  }

  /**
   * Generates an embedding for a given text.
   * @param {string} text - The text to embed.
   * @returns {Promise<Float32Array>} A promise that resolves with the embedding.
   */
  async embed(text) {
    const opId = generateUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestEmitter.removeAllListeners(opId);
        reject(new AIErrors.TimeoutError('Embedding request timed out.'));
      }, 30000);

      this.requestEmitter.once(
        opId,
        (/** @type {{error: any, embedding: number[]}} */ res) => {
          clearTimeout(timeout);
          if (res.error) {
            reject(
              new AIErrors.EmbeddingError(
                'Failed to generate embedding.',
                res.error,
              ),
            );
          } else if (!res.embedding || res.embedding.length === 0) {
            reject(
              new AIErrors.EmbeddingError(
                'Worker returned an empty embedding.',
              ),
            );
          } else {
            resolve(new Float32Array(res.embedding));
          }
        },
      );

      this.worker?.send({
        opId,
        type: 'embed',
        text,
        model: this.config.models.embedding,
      });
    });
  }

  /**
   * Handles a chat request, augmenting it with context from the vector store.
   * @param {ChatMessage[]} messages - The history of chat messages.
   * @param {{model?: string}} [options={}] - Chat options, like specifying a model.
   * @returns {Promise<ReadableStream>} A readable stream of the AI's response.
   */
  async chat(messages, options = {}) {
    if (!messages || messages.length === 0) {
      throw new AIErrors.ChatError('Messages array cannot be empty.');
    }
    const streamId = `chat-${generateUUID()}`;
    const lastUserMessage = messages[messages.length - 1];
    if (!lastUserMessage) {
      throw new AIErrors.ChatError('No user message found.');
    }
    const context = await this.store.search(lastUserMessage.content, 5, {
      userId: lastUserMessage.user_id,
    });
    const prompt = createRagPrompt(messages, context);

    this.worker?.send({
      streamId,
      type: 'chat',
      messages: prompt,
      model: options.model,
    });

    return new ReadableStream({
      start: (controller) => {
        const onMessage = (/** @type {{type: string, payload: any}} */ msg) => {
          try {
            if (msg.type === 'chunk') controller.enqueue(msg.payload);
            else if (msg.type === 'done') {
              controller.close();
              cleanup();
            } else if (msg.type === 'error') {
              controller.error(
                new AIErrors.ChatError('Chat stream failed.', msg.payload),
              );
              cleanup();
            }
          } catch (e) {
            controller.error(
              new AIErrors.ChatError(
                'Failed to parse chat stream.',
                /** @type {Error} */ (e),
              ),
            );
            cleanup();
          }
        };
        const cleanup = () =>
          this.requestEmitter.removeListener(streamId, onMessage);
        this.requestEmitter.on(streamId, onMessage);
      },
    });
  }

  /**
   * Performs a semantic search using the vector store.
   * @param {string} query - The search query.
   * @param {number} [limit=5] - The maximum number of results to return.
   * @param {{userId?: string}} [where={}] - Filtering conditions.
   * @returns {Promise<SearchResult[]>} A promise that resolves with the search results.
   */
  async search(query, limit = 5, where = {}) {
    return this.store.search(query, limit, where);
  }

  /**
   * Lists the available Ollama models.
   * @returns {Promise<import('ollama').ListResponse>}
   */
  async list() {
    return this.ollama.list();
  }

  /**
   * Pulls (downloads) an Ollama model.
   * @param {string} model - The name of the model to pull.
   * @param {object} [options] - Additional options for the pull request.
   * @returns {Promise<any>}
   */
  async pull(model, options) {
    return this.ollama.pull({ model, stream: true, ...options });
  }

  /**
   * Deletes a downloaded Ollama model.
   * @param {string} model - The name of the model to delete.
   * @returns {Promise<any>}
   */
  async delete(model) {
    return this.ollama.delete({ model });
  }

  /**
   * Handles WebSocket upgrade for chat.
   * @param {Request & { user: any }} req
   * @returns {Response | undefined}
   */
  handleChatUpgrade(req) {
    if (this.#server) {
      const success = this.#server.upgrade(req, {
        data: { isChatChannel: true, user: req.user },
      });
      return success
        ? undefined
        : new Response('Upgrade failed', { status: 500 });
    }
    return new Response('Server not available for upgrade', { status: 500 });
  }
  /** @param {WebSocket} _ws */
  handleChatOpen(_ws) {}
  /**
   * @param {WebSocket} _ws
   * @param {string | Buffer} _message
   */
  handleChatMessage(_ws, _message) {}
  /** @param {WebSocket} _ws */
  handleChatClose(_ws) {}
}
