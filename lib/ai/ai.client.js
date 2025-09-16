/**
 * @file Client-side service for interacting with the AI API endpoints.
 * Provides methods for searching, chatting, and managing AI models.
 */

import { onUnmounted } from '../core/lifecycle.js';
import { state } from '../core/reactivity.js';

/**
 * @typedef {import('../core/reactivity.js').ReactiveProxy<{data: string, isLoading: boolean, error: Error | null, stream: ReadableStream | null}>} ChatState
 */

/**
 * @typedef {object} ChatMessage
 * @property {'user' | 'assistant' | 'system'} role
 * @property {string} content
 * @property {string} [user_id]
 */

/**
 * @typedef {object} SearchResult
 * @property {string} text - The content of the search result.
 * @property {number} score - The relevance score of the result.
 * @property {{ filePath: string }} metadata - Metadata associated with the result.
 */

/**
 * @typedef {object} AIService
 * @property {(query: string, limit?: number) => Promise<SearchResult[]>} search - Performs a semantic search over indexed files.
 * @property {(messages: ChatMessage[], options?: object) => Promise<ReadableStream<Uint8Array> | null>} chat - Initiates a chat session with the AI.
 * @property {object} models - Methods for managing AI models.
 * @property {() => Promise<any[]>} models.list - Lists available AI models.
 * @property {(modelName: string) => Promise<ReadableStream<Uint8Array> | null>} models.pull - Downloads a model from the registry.
 * @property {(modelName: string) => Promise<any>} models.delete - Deletes a downloaded model.
 * @property {(initialMessages?: ChatMessage[]) => { state: ChatState, send: (messages: ChatMessage[]) => Promise<void>, cleanup: () => void }} useChat - A composable for reactive chat sessions.
 */

/**
 * @type {AIService | undefined}
 */
let aiServiceInstance;

/**
 * @internal
 * @returns {AIService}
 */
function createAIService() {
  /**
   * @type {AIService['search']}
   */
  const search = async (query, limit = 5) => {
    const response = await fetch('/api/ai/search/files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, limit }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI search failed: ${errorText}`);
    }
    return response.json();
  };

  /**
   * @type {AIService['chat']}
   */
  const chat = async (messages, options = {}) => {
    const response = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, options }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI chat failed: ${errorText}`);
    }
    return response.body;
  };

  const models = {
    /**
     * @type {AIService['models']['list']}
     */
    list: async () => {
      const response = await fetch('/api/ai/models/list');
      if (!response.ok) throw new Error('Failed to list models.');
      return response.json();
    },
    /**
     * @type {AIService['models']['pull']}
     */
    pull: async (modelName) => {
      const response = await fetch('/api/ai/models/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to pull model: ${errorText}`);
      }
      return response.body;
    },
    /**
     * @type {AIService['models']['delete']}
     */
    delete: async (modelName) => {
      const response = await fetch('/api/ai/models/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName }),
      });
      if (!response.ok) throw new Error('Failed to delete model.');
      return response.json();
    },
  };

  /**
   * @type {AIService['useChat']}
   */
  const useChat = (initialMessages = []) => {
    const s = state({
      data: '',
      isLoading: false,
      error: /** @type {Error | null} */ (null),
      stream: /** @type {ReadableStream | null} */ (null),
    });

    /** @type {ReadableStreamDefaultReader<Uint8Array> | undefined} */
    let reader;

    const cleanup = () => {
      if (reader) {
        try {
          reader.cancel();
        } catch (e) {
          /* Ignore cancel errors */
        }
        reader = undefined;
      }
      s.isLoading = false;
    };

    onUnmounted(cleanup);

    /**
     * @param {ChatMessage[]} messages
     */
    const send = async (messages) => {
      if (s.isLoading) return;
      s.isLoading = true;
      s.error = null;
      s.data = '';
      try {
        const stream = await chat(messages);
        if (stream) {
          s.stream = stream;
          reader = stream.getReader();
          const decoder = new TextDecoder();

          const read = () => {
            if (!reader) return;
            reader
              .read()
              .then(({ done, value }) => {
                if (done) {
                  cleanup();
                  return;
                }
                s.data += decoder.decode(value, { stream: true });
                read();
              })
              .catch((err) => {
                console.error('Stream read error:', err);
                s.error = new Error('Failed to read stream');
                cleanup();
              });
          };
          read();
        }
      } catch (/** @type {any} */ err) {
        s.error = err instanceof Error ? err : new Error(String(err));
        s.isLoading = false;
      }
    };

    if (initialMessages.length > 0) {
      send(initialMessages);
    }

    return { state: s, send, cleanup };
  };

  return { chat, models, useChat, search };
}

/**
 * Returns a singleton instance of the AI service.
 * @returns {AIService} The AI service instance.
 */
export function ai() {
  if (!aiServiceInstance) {
    aiServiceInstance = createAIService();
  }
  return aiServiceInstance;
}
