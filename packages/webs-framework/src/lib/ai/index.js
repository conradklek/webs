import { EventEmitter } from 'events';
import { Ollama } from 'ollama';
import { Store } from './store.js';
import { createRagPrompt } from './rag.js';
import { AIErrors } from './errors.js';
import { generateUUID } from '../shared.js';

export class AI {
  #server = null;
  #db = null;

  constructor(config) {
    this.config = config;
    this.store = new Store(config, this);
    this.worker = null;
    this.ollama = new Ollama({ host: config.host });
    this.isReady = false;
    this.requestEmitter = new EventEmitter();
  }

  async init() {
    if (this.isReady) return;
    console.log('[AI] Initializing...');

    const workerPath = this.config.worker.path;

    if (!(await Bun.file(workerPath).exists())) {
      throw new Error(`[AI] Worker script not found at: ${workerPath}`);
    }

    this.worker = Bun.spawn(['bun', workerPath], {
      stdio: ['ignore', 'inherit', 'inherit'],
      ipc: (message) => {
        const channel = message.streamId || message.opId;
        if (channel) {
          this.requestEmitter.emit(channel, message);
        }
      },
      onExit: (code) => {
        console.warn(`[AI] Worker process exited with code: ${code}.`);
      },
      env: {
        ...process.env,
        OLLAMA_HOST: this.config.host,
      },
    });

    await this.store.init();
    this.isReady = true;
    console.log('[AI] Ready.');
  }

  initialize(server, db) {
    this.#server = server;
    this.#db = db;
  }

  async shutdown() {
    if (!this.isReady) return;
    console.log('[AI] Shutting down...');
    this.worker.kill();
    this.store.close();
    this.isReady = false;
    await new Promise((resolve) => setTimeout(resolve, 100));
    console.log('[AI] Shutdown complete.');
  }

  async indexFile(filePath, fileContent, metadata = {}) {
    if (
      !filePath ||
      typeof fileContent !== 'string' ||
      fileContent.trim() === ''
    ) {
      return;
    }
    console.log(`[AI] Indexing file: ${filePath}`);
    try {
      await this.store.index(fileContent, { filePath, ...metadata });
    } catch (error) {
      console.error(`[AI] Failed to index file ${filePath}:`, error);
    }
  }

  async removeFileIndex(filePath, metadata = {}) {
    console.log(`[AI] Removing index for file: ${filePath}`);
    try {
      await this.store.remove(filePath, metadata.userId);
    } catch (error) {
      console.error(`[AI] Failed to remove index for ${filePath}:`, error);
    }
  }

  #publish(topic, payload) {
    this.#server.publish(topic.toLowerCase(), JSON.stringify(payload));
  }

  handleChatUpgrade(req) {
    const url = new URL(req.url);
    let channel = url.searchParams.get('channel');
    if (!channel) {
      return new Response("Missing 'channel' query parameter", { status: 400 });
    }

    if (channel.startsWith('#')) {
      channel = channel.substring(1);
    }

    let { user } = req;
    if (!user) {
      user = { id: null, username: 'anon' };
    }

    const success = this.#server.upgrade(req, {
      data: {
        user: { id: user.id, username: user.username },
        channel: `#${channel.toLowerCase()}`,
        isChatChannel: true,
      },
    });

    if (!success) {
      return new Response('WebSocket upgrade failed', { status: 500 });
    }
    return undefined;
  }

  handleChatOpen(ws) {
    const { user, channel } = ws.data;
    ws.subscribe(channel);
    this.#publish(channel, { type: 'join', user: user.username });
  }

  async handleChatMessage(ws, message) {
    const { user, channel } = ws.data;
    const text = message.toString().trim();
    if (!text) return;

    try {
      const now = new Date().toISOString();
      const clientMessageId = generateUUID();

      const userMessage = {
        id: clientMessageId,
        channel: channel,
        username: user.username,
        message: text,
        user_id: user.id,
        created_at: now,
        updated_at: now,
      };

      const insertUserMsgStmt = this.#db.prepare(
        'INSERT INTO chat_messages (id, channel, username, message, user_id, created_at, updated_at) VALUES ($id, $channel, $username, $message, $user_id, $created_at, $updated_at)',
      );
      insertUserMsgStmt.run(userMessage);

      this.#server.publish(
        channel,
        JSON.stringify({
          type: 'sync',
          data: {
            tableName: 'chat_messages',
            type: 'put',
            data: userMessage,
          },
        }),
      );

      if (text.toLowerCase().startsWith('@ai')) {
        const prompt = text.substring(3).trim();
        const history = this.#db
          .prepare(
            'SELECT username as role, message as content FROM chat_messages WHERE channel = ? ORDER BY created_at DESC LIMIT 10',
          )
          .all(channel)
          .map((m) => ({ ...m, role: m.role === 'AI' ? 'assistant' : 'user' }))
          .reverse();

        const stream = await this.chat([
          ...history,
          { role: 'user', content: prompt },
        ]);
        let fullResponse = '';

        for await (const chunk of stream) {
          fullResponse += chunk;
        }

        const aiMessageId = generateUUID();
        const aiTimestamp = new Date().toISOString();

        const aiMessage = {
          id: aiMessageId,
          channel: channel,
          username: 'AI',
          message: fullResponse,
          user_id: null,
          created_at: aiTimestamp,
          updated_at: aiTimestamp,
        };

        const insertAiMsgStmt = this.#db.prepare(
          'INSERT INTO chat_messages (id, channel, username, message, user_id, created_at, updated_at) VALUES ($id, $channel, $username, $message, $user_id, $created_at, $updated_at)',
        );
        insertAiMsgStmt.run(aiMessage);

        this.#server.publish(
          channel,
          JSON.stringify({
            type: 'sync',
            data: {
              tableName: 'chat_messages',
              type: 'put',
              data: aiMessage,
            },
          }),
        );
      }
    } catch (error) {
      console.error(`[ChatGateway] DB error: ${error.message}`);
    }
  }

  handleChatClose(ws) {
    const { user, channel } = ws.data;
    if (user && channel) {
      this.#publish(channel, { type: 'part', user: user.username });
    }
  }

  async embed(text) {
    const opId = generateUUID();
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.requestEmitter.removeAllListeners(opId);
        reject(new AIErrors.TimeoutError('Embedding request timed out.'));
      }, 30000);

      this.requestEmitter.once(opId, (res) => {
        clearTimeout(timeout);
        if (res.error)
          reject(
            new AIErrors.EmbeddingError(
              'Failed to generate embedding.',
              res.error,
            ),
          );
        else resolve(new Float32Array(res.embedding || []));
      });

      this.worker.send({
        opId,
        type: 'embed',
        text,
        model: this.config.models.embedding,
      });
    });
  }

  async chat(messages, options = {}) {
    if (!messages || messages.length === 0) {
      throw new AIErrors.ChatError('Messages array cannot be empty.');
    }
    const streamId = `chat-${generateUUID()}`;
    const context = await this.search(
      messages[messages.length - 1].content,
      5,
      { userId: messages[messages.length - 1].user_id },
    );
    const prompt = createRagPrompt(messages, context);

    this.worker.send({
      streamId,
      type: 'chat',
      messages: prompt,
      model: options.model || this.config.models.chat,
    });

    return new ReadableStream({
      start: (controller) => {
        const onMessage = (msg) => {
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
              new AIErrors.ChatError('Failed to parse chat stream.', e),
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

  async index(text, metadata) {
    return this.store.index(text, metadata);
  }
  async search(query, limit = 5, where = {}) {
    return this.store.search(query, limit, where);
  }
  async seed() {
    return this.store.seed();
  }

  async list() {
    return this.ollama.list();
  }
  async pull(model, options) {
    return this.ollama.pull({ model, stream: true, ...options });
  }
  async delete(model) {
    return this.ollama.delete({ model });
  }
}
