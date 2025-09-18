import { Ollama } from 'ollama';

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

const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://localhost:11434';
const CHAT_MODEL = process.env.CHAT_MODEL;
const AGENT_MODEL = process.env.AGENT_MODEL;

if (!CHAT_MODEL) {
  console.error(
    'AI Worker Error: CHAT_MODEL environment variable is required.',
  );
  process.exit(1);
}

const ollama = new Ollama({ host: OLLAMA_HOST });

/**
 * @param {{ opId: string; text: string; model: string; options: any; }} params
 */
async function handleEmbed({ opId, text, model, options }) {
  try {
    if (!model) {
      throw new Error('Embedding model was not provided in the request.');
    }
    const res = await ollama.embed({ model, input: text, options });
    const embedding =
      res.embeddings && res.embeddings[0] ? res.embeddings[0] : [];
    process.send?.({ opId, embedding });
  } catch (error) {
    process.send?.({
      opId,
      error: {
        message: /** @type {Error} */ (error).message,
        status: /** @type {any} */ (error).status,
      },
    });
  }
}

/**
 * @param {{ opId: string; texts: string[]; model: string; options: any; }} params
 */
async function handleEmbedBatch({ opId, texts, model, options }) {
  try {
    if (!model) {
      throw new Error('Embedding model was not provided in the request.');
    }
    const res = await ollama.embed({ model, input: texts, options });
    process.send?.({ opId, embeddings: res.embeddings });
  } catch (error) {
    process.send?.({
      opId,
      error: {
        message: /** @type {Error} */ (error).message,
        status: /** @type {any} */ (error).status,
      },
    });
  }
}

/**
 * @param {{ streamId: string; prompt: string; model: string; options: any; }} params
 */
async function handleGenerate({ streamId, prompt, model, options }) {
  try {
    const modelToUse = model || CHAT_MODEL;
    const stream = await ollama.generate({
      model: modelToUse ?? 'gemma3',
      prompt,
      stream: true,
      options,
    });
    for await (const chunk of stream) {
      process.send?.({
        streamId,
        type: 'chunk',
        payload: { response: chunk.response },
      });
    }
    process.send?.({ streamId, type: 'done' });
  } catch (error) {
    process.send?.({
      streamId,
      type: 'error',
      payload: {
        message: /** @type {Error} */ (error).message,
        status: /** @type {any} */ (error).status,
      },
    });
  }
}

/**
 * @param {{ streamId: string; messages: ChatMessage[]; model: string; options: any; }} params
 */
async function handleChat({ streamId, messages, model, options }) {
  try {
    const modelToUse = model || CHAT_MODEL;
    const stream = await ollama.chat({
      model: modelToUse ?? 'gemma3',
      messages,
      stream: true,
      options,
    });
    for await (const chunk of stream) {
      process.send?.({
        streamId,
        type: 'chunk',
        payload: { message: { content: chunk.message.content } },
      });
    }
    process.send?.({ streamId, type: 'done' });
  } catch (error) {
    process.send?.({
      streamId,
      type: 'error',
      payload: {
        message: /** @type {Error} */ (error).message,
        status: /** @type {any} */ (error).status,
      },
    });
  }
}

/**
 * @param {{ streamId: string; messages: ChatMessage[]; tools: Tool[]; model: string; options: any; }} params
 */
async function handleAgent({ streamId, messages, tools, model, options }) {
  try {
    const modelToUse = model || AGENT_MODEL;
    if (!modelToUse) {
      throw new Error('AGENT_MODEL environment variable is not set.');
    }
    const stream = await ollama.chat({
      model: modelToUse,
      messages,
      tools,
      stream: true,
      options,
    });

    for await (const chunk of stream) {
      process.send?.({
        streamId,
        type: 'chunk',
        payload: { message: chunk.message },
      });
    }
    process.send?.({ streamId, type: 'done' });
  } catch (error) {
    process.send?.({
      streamId,
      type: 'error',
      payload: {
        message: /** @type {Error} */ (error).message,
        status: /** @type {any} */ (error).status,
      },
    });
  }
}

process.on('message', (/** @type {any} */ msg) => {
  switch (msg.type) {
    case 'embed':
      handleEmbed(msg);
      break;
    case 'embed-batch':
      handleEmbedBatch(msg);
      break;
    case 'generate':
      handleGenerate(msg);
      break;
    case 'chat':
      handleChat(msg);
      break;
    case 'agent':
      handleAgent(msg);
      break;
  }
});
