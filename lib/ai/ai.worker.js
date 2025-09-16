/**
 * @file A dedicated worker for handling CPU-intensive AI tasks like
 * embedding generation and chat processing, preventing the main server thread from blocking.
 */

import { Ollama } from 'ollama';

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const CHAT_MODEL = process.env.CHAT_MODEL;

if (!CHAT_MODEL) {
  console.error(
    'AI Worker Error: CHAT_MODEL environment variable is required.',
  );
  process.exit(1);
}

const ollama = new Ollama({ host: OLLAMA_HOST });

/**
 * Handles a request to generate an embedding for a piece of text.
 * @param {object} params
 * @param {string} params.opId - A unique ID for the operation.
 * @param {string} params.text - The text to embed.
 * @param {string} params.model - The embedding model to use.
 * @returns {Promise<void>}
 */
async function handleEmbed({ opId, text, model }) {
  try {
    if (!model) {
      throw new Error('Embedding model was not provided in the request.');
    }
    const res = await ollama.embed({ model, input: text });

    const embedding =
      res.embeddings && res.embeddings[0] ? res.embeddings[0] : [];

    process.send?.({ opId, embedding });
  } catch (/** @type {any} */ error) {
    process.send?.({
      opId,
      error: { message: error.message, status: error.status },
    });
  }
}

/**
 * Handles a request to process a chat stream.
 * @param {object} params
 * @param {string} params.streamId - A unique ID for the stream.
 * @param {import('./ai.client.js').ChatMessage[]} params.messages - The chat messages.
 * @param {string} [params.model] - The chat model to use.
 * @returns {Promise<void>}
 */
async function handleChat({ streamId, messages, model }) {
  try {
    const modelToUse = model || CHAT_MODEL;
    const stream = await ollama.chat({
      model: modelToUse ?? 'deepseek-r1:1.5b',
      messages,
      stream: true,
    });
    for await (const chunk of stream) {
      process.send?.({
        streamId,
        type: 'chunk',
        payload: chunk.message.content,
      });
    }
    process.send?.({ streamId, type: 'done' });
  } catch (/** @type {any} */ error) {
    process.send?.({
      streamId,
      type: 'error',
      payload: { message: error.message, status: error.status },
    });
  }
}

process.on('message', (/** @type {any} */ msg) => {
  if (msg.type === 'embed') {
    handleEmbed(msg);
  } else if (msg.type === 'chat') {
    handleChat(msg);
  }
});
