import { generateUUID } from '../utils/common.js';
import { Store } from './vector-store.js';
import { AIErrors } from './ai.errors.js';
import { EventEmitter } from 'events';
import { Ollama } from 'ollama';

/**
 * @typedef {import('bun:sqlite').Database} BunDatabase
 * @typedef {import('bun').Server} BunServer
 * @typedef {import('bun').Subprocess} Subprocess
 * @typedef {import('bun').ServerWebSocket<any>} WebSocket
 * @typedef {import('bun').ErrorLike} ErrorLike
 */

/**
 * @typedef {object} ToolCall
 * @property {string} id
 * @property {object} function
 * @property {string} function.name
 * @property {object} function.arguments
 */

/**
 * @typedef {object} ChatMessage
 * @property {'user' | 'assistant' | 'system' | 'tool'} role - The role of the message sender.
 * @property {string} content - The content of the message.
 * @property {string | number} [user_id] - Optional user ID for filtering.
 * @property {ToolCall[]} [tool_calls] - Optional array of tool calls.
 * @property {string} [tool_call_id] - Optional tool call ID.
 * @property {string} [tool_name] - The name of the tool that was executed.
 */

/**
 * @typedef {object} SearchResultMetadata
 * @property {string} filePath
 * @property {number} startLine
 * @property {number} endLine
 * @property {string} [className]
 * @property {string} [functionName]
 * @property {string} [summary]
 */

/**
 * @typedef {object} SearchResult
 * @property {string} text
 * @property {number} score
 * @property {SearchResultMetadata} metadata
 */

/**
 * @typedef {object} Tool
 * @property {string} type
 * @property {object} function
 * @property {string} function.name
 * @property {string} function.description
 * @property {object} function.parameters
 * @property {string} function.parameters.type
 * @property {{ [key: string]: { type?: string | string[], items?: any, description?: string, enum?: any[] } }} function.parameters.properties
 */

/**
 * @typedef {object} AIConfig
 * @property {string} host
 * @property {{chat: string, embedding: string, labeling: string, agent?: string}} models
 * @property {{path: string}} worker
 * @property {{path: string, dimensions: number}} db
 */

/**
 * @typedef {object} AgentDefinition
 * @property {string} name
 * @property {string} system_prompt
 * @property {Tool[]} tools
 * @property {string} [model]
 * @property {any} component
 */

/**
 * @typedef {object} ConversationContext
 * @property {BunDatabase} db
 * @property {any} user
 * @property {Record<string, Function>} syncActions
 * @property {BunServer} server
 */

export class AI {
  /** @param {AIConfig} config */
  constructor(config) {
    this.config = config;
    this.store = new Store(config, this);
    /** @type {import('bun').Subprocess | null} */
    this.worker = null;
    this.ollama = new Ollama({ host: config.host });
    this.isReady = false;
    this.requestEmitter = new EventEmitter();
  }

  /**
   * @param {BunServer} _server
   * @param {Record<string, AgentDefinition>} [_agentDefs]
   */
  initialize(_server, _agentDefs = {}) {}

  async init() {
    if (this.isReady) return;
    console.log('[AI] Initializing...');
    const workerPath = this.config.worker.path;
    if (!(await Bun.file(workerPath).exists())) {
      throw new AIErrors.AIError(
        `[AI] Worker script not found at: ${workerPath}`,
      );
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
        AGENT_MODEL: this.config.models.agent,
      },
    });
    await this.store.init();
    this.isReady = true;
    console.log('[AI] Ready.');
  }

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
   * @param {Array<{path: string, content: string}>} files
   * @param {object & {userId?: string}} [metadata={}]
   */
  async indexDirectory(files, metadata = {}) {
    if (!files || files.length === 0) {
      return { successful: 0, failed: 0 };
    }
    console.log(`[AI] Starting batch indexing for ${files.length} files...`);

    for (const file of files) {
      await this.removeFileIndex(file.path, metadata);
    }

    const filesToProcess = files.filter(
      (f) => f.content && f.content.trim().length > 0,
    );
    const contents = filesToProcess.map((f) => f.content);

    if (contents.length === 0) {
      console.log('[AI] No non-empty files to index.');
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
      console.log(
        `[AI] Batch indexing complete. Indexed ${successfulCount} files successfully.`,
      );
      return { successful: successfulCount, failed: 0 };
    } catch (error) {
      console.error('[AI] Batch indexing failed:', error);
      return { successful: 0, failed: files.length };
    }
  }

  /**
   * @param {{ path: string, content: string }} file
   * @param {object & {userId?: string}} [metadata={}]
   */
  async indexFile(file, metadata = {}) {
    if (!file.path || typeof file.content !== 'string') {
      console.warn(
        `[AI] Skipping invalid file data for: ${file.path || 'unknown file'}`,
      );
      return false;
    }

    console.log(`[AI]   - Processing file: ${file.path}`);
    try {
      await this.removeFileIndex(file.path, metadata);

      if (file.content.trim() === '') {
        console.log(`[AI]   - Skipped indexing empty file: ${file.path}`);
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
          `Worker returned an empty embedding for ${file.path}.`,
        );
      }

      return true;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      console.error(`[AI] Failed to index file: ${file.path}`, errorMessage);
      return false;
    }
  }

  /**
   * @param {string} filePath
   * @param {object & {userId?: string}} [metadata={}]
   */
  async removeFileIndex(filePath, metadata = {}) {
    console.log(`[AI] Removing index for file: ${filePath}`);
    try {
      await this.store.remove(filePath, metadata.userId);
    } catch (error) {
      console.error(`[AI] Failed to remove index for ${filePath}:`, error);
    }
  }

  /** @param {string} text */
  async embed(text) {
    const opId = generateUUID();
    return new Promise((resolve, reject) => {
      this.requestEmitter.once(
        opId,
        (/** @type {{error: any, embedding: number[]}} */ res) => {
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

  /** @param {string[]} texts */
  async embedBatch(texts) {
    if (!texts || texts.length === 0) {
      return [];
    }
    const opId = generateUUID();
    return new Promise((resolve, reject) => {
      this.requestEmitter.once(
        opId,
        (
          /** @type {{error: any, embeddings: (number[] | undefined)[]}} */ res,
        ) => {
          if (res.error) {
            reject(
              new AIErrors.EmbeddingError(
                'Failed to generate batch embeddings.',
                res.error,
              ),
            );
          } else if (
            !res.embeddings ||
            res.embeddings.length !== texts.length
          ) {
            reject(
              new AIErrors.EmbeddingError(
                'Worker returned mismatched number of embeddings for batch.',
              ),
            );
          } else {
            resolve(
              res.embeddings.map((e) => (e ? new Float32Array(e) : undefined)),
            );
          }
        },
      );
      this.worker?.send({
        opId,
        type: 'embed-batch',
        texts,
        model: this.config.models.embedding,
      });
    });
  }
  /**
   * @param {string} prompt
   * @param {object} [options={}]
   */
  async generate(prompt, options = {}) {
    if (!prompt) {
      throw new AIErrors.ChatError('Prompt cannot be empty.');
    }
    const streamId = `generate-${generateUUID()}`;

    this.worker?.send({
      streamId,
      type: 'generate',
      prompt,
      model: /** @type {any} */ (options).model,
      options,
    });

    return new ReadableStream({
      start: (controller) => {
        const onMessage = (/** @type {{type: string, payload: any}} */ msg) => {
          try {
            if (msg.type === 'chunk') {
              controller.enqueue(
                new TextEncoder().encode(msg.payload.response),
              );
            } else if (msg.type === 'done') {
              controller.close();
              cleanup();
            } else if (msg.type === 'error') {
              controller.error(
                new AIErrors.ChatError(
                  'Generation stream failed.',
                  msg.payload,
                ),
              );
              cleanup();
            }
          } catch (e) {
            controller.error(
              new AIErrors.ChatError(
                'Failed to parse generation stream.',
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
   * @param {ChatMessage[]} messages
   * @param {object} [options={}]
   */
  async chat(messages, options = {}) {
    if (!messages || messages.length === 0) {
      throw new AIErrors.ChatError('Messages array cannot be empty.');
    }
    const streamId = `chat-${generateUUID()}`;

    this.worker?.send({
      streamId,
      type: 'chat',
      messages: messages,
      model: /** @type {any} */ (options).model,
      options,
    });

    return new ReadableStream({
      start: (controller) => {
        const onMessage = (/** @type {{type: string, payload: any}} */ msg) => {
          try {
            if (msg.type === 'chunk') {
              controller.enqueue(
                new TextEncoder().encode(msg.payload.message.content),
              );
            } else if (msg.type === 'done') {
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
   * @param {{channel_id: string, message: ChatMessage, options?: { model?: string }}} params
   * @param {ConversationContext} context
   */
  async startConversation({ channel_id, message, options }, context) {
    const { db, user, syncActions } = context;

    const userMessage = {
      id: generateUUID(),
      channel_id,
      username: user.username,
      message: message.content,
      user_id: user.id,
      created_at: new Date().toISOString(),
    };
    if (syncActions && syncActions.upsertChat_messages) {
      syncActions.upsertChat_messages({ user }, userMessage);
    }

    const historyRows = db
      .query(
        `SELECT username, message FROM chat_messages WHERE channel_id = ? ORDER BY created_at DESC LIMIT 20`,
      )
      .all(channel_id)
      .reverse();

    const history = historyRows.map(
      (/** @type {{username: string, message: string}} */ row) =>
        /** @type {ChatMessage} */ ({
          role: row.username === user.username ? 'user' : 'assistant',
          content: row.message,
        }),
    );

    const stream = await this.chat(history, options);
    let fullResponse = '';

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        fullResponse += new TextDecoder().decode(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        const aiMessage = {
          id: generateUUID(),
          channel_id,
          username: 'assistant',
          message: fullResponse,
          user_id: null,
          created_at: new Date().toISOString(),
        };
        if (syncActions && syncActions.upsertChat_messages) {
          syncActions.upsertChat_messages({ user: null }, aiMessage);
        }
      },
    });

    return stream.pipeThrough(transformStream);
  }

  /**
   * @param {ChatMessage[]} messages
   * @param {AgentDefinition} agentDef
   * @param {any} toolContext
   * @param {object} [options={}]
   */
  async agent(messages, agentDef, toolContext, options = {}) {
    const streamId = `agent-exec-${generateUUID()}`;
    const agentComponent = agentDef.component;
    const model =
      agentDef.model ||
      /** @type {any} */ (options).model ||
      this.config.models.agent;

    let currentMessages = [...messages];
    if (agentDef.system_prompt) {
      currentMessages.unshift({
        role: 'system',
        content: agentDef.system_prompt,
      });
    }

    const streamController = new AbortController();
    return new ReadableStream({
      start: async (controller) => {
        const send = (/** @type {any} */ data) =>
          controller.enqueue(
            new TextEncoder().encode(JSON.stringify(data) + '\n'),
          );
        try {
          for (let i = 0; i < 5; i++) {
            this.worker?.send({
              streamId,
              type: 'agent',
              messages: currentMessages,
              tools: agentDef.tools,
              model: model,
              options,
            });
            /** @type {ChatMessage} */
            let responseMessage = {
              role: 'assistant',
              content: '',
              tool_calls: [],
            };
            await new Promise((resolve, reject) => {
              const onMessage = (
                /** @type {{type: string, payload: any}} */ msg,
              ) => {
                if (msg.type === 'chunk') {
                  const chunk = msg.payload.message;
                  if (chunk.content) {
                    responseMessage.content += chunk.content;
                    send({ type: 'chunk', content: chunk.content });
                  }
                  if (chunk.tool_calls) {
                    responseMessage.tool_calls = chunk.tool_calls;
                  }
                } else if (msg.type === 'done') {
                  this.requestEmitter.removeListener(streamId, onMessage);
                  resolve(undefined);
                } else if (msg.type === 'error') {
                  this.requestEmitter.removeListener(streamId, onMessage);
                  reject(
                    new AIErrors.ChatError('Agent stream failed.', msg.payload),
                  );
                }
              };
              this.requestEmitter.on(streamId, onMessage);
            });

            if (
              !responseMessage.tool_calls ||
              responseMessage.tool_calls.length === 0
            ) {
              break;
            }

            currentMessages.push(responseMessage);
            /** @type {ChatMessage[]} */
            const toolResults = [];
            for (const toolCall of responseMessage.tool_calls) {
              const toolName = toolCall.function.name;
              const toolArgs = toolCall.function.arguments;
              const toolFn = agentComponent[toolName];

              if (typeof toolFn === 'function') {
                send({ type: 'tool_start', name: toolName, args: toolArgs });
                const result = await toolFn(toolContext, toolArgs);
                send({ type: 'tool_end', name: toolName, result: result });
                toolResults.push({
                  role: 'tool',
                  content: JSON.stringify(result),
                  tool_name: toolName,
                });
              }
            }
            currentMessages.push(...toolResults);
          }
        } catch (e) {
          controller.error(e);
        } finally {
          controller.close();
        }
      },
      cancel() {
        streamController.abort();
      },
    });
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
    return this.ollama.list();
  }

  /**
   * @param {string} model
   * @param {any} [options]
   */
  async pull(model, options) {
    return this.ollama.pull({ model, stream: true, ...options });
  }

  /** @param {string} model */
  async delete(model) {
    return this.ollama.delete({ model });
  }
}
