import { config } from './config.js';
import { Ollama } from 'ollama';

const ollama = new Ollama({ host: config.host });

async function handleEmbed({ opId, text, model }) {
  try {
    const res = await ollama.embed({ model, input: text });
    const embedding =
      res.embeddings && res.embeddings[0] ? res.embeddings[0] : [];
    process.send?.({ opId, embedding });
  } catch (error) {
    process.send?.({
      opId,
      error: { message: error.message, status: error.status },
    });
  }
}

async function handleChat({ streamId, messages, model }) {
  try {
    const stream = await ollama.chat({ model, messages, stream: true });
    for await (const chunk of stream) {
      process.send?.({
        streamId,
        type: 'chunk',
        payload: chunk.message.content,
      });
    }
    process.send?.({ streamId, type: 'done' });
  } catch (error) {
    process.send?.({
      streamId,
      type: 'error',
      payload: { message: error.message, status: error.status },
    });
  }
}

process.on('message', (msg) => {
  if (msg.type === 'embed') {
    handleEmbed(msg);
  } else if (msg.type === 'chat') {
    handleChat(msg);
  }
});
