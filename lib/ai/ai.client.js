import { state } from '../core/reactivity.js';
import { db } from '../client/db.client.js';
import { onMounted, onUnmounted } from '../core/component.js';
import { session } from '../client/session.js';

/**
 * @file Contains all the JSDoc type definitions for the AI client service.
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
 * @typedef {object} ChatState
 * @property {string} data
 * @property {boolean} isLoading
 * @property {Error | null} error
 * @property {ReadableStream<Uint8Array> | null} stream
 */

/**
 * @typedef {object} AIModel
 * @property {string} name
 * @property {string} [license]
 * @property {string} [size]
 * @property {string} [modified_at]
 */

/**
 * @typedef {object} AgentRunner
 * @property {import('../core/reactivity.js').ReactiveProxy<ChatState>} state
 * @property {(messages: ChatMessage[]) => Promise<void>} run
 * @property {() => void} cleanup
 */

/**
 * @typedef {object} AIService
 * @property {(prompt: string, options?: { model?: string }) => Promise<ReadableStream | null>} generate
 * @property {(messages: ChatMessage[], options?: { model?: string }) => Promise<ReadableStream | null>} chat
 * @property {(query: string, limit?: number) => Promise<SearchResult[]>} search
 * @property {(agentName: string, messages: ChatMessage[], options?: object) => Promise<ReadableStream | null>} run
 * @property {{list: () => Promise<AIModel[]>, pull: (modelName: string) => Promise<ReadableStream | null>, delete: (modelName: string) => Promise<any>}} models
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
 * @typedef {object} ConversationMessage
 * @property {string} id
 * @property {string} channel
 * @property {string} username
 * @property {string} message
 * @property {number | null} user_id
 * @property {string} created_at
 */

/**
 * @typedef {object} ConversationState
 * @property {ConversationMessage[]} messages
 * @property {boolean} isLoading
 * @property {Error | null} error
 * @property {string} streamingResponse
 */

/**
 * @typedef {object} UseConversationReturn
 * @property {import('../core/reactivity.js').ReactiveProxy<ConversationState>} state
 * @property {(content: string) => Promise<void>} send
 */

/**
 * @typedef {object} ToolEvent
 * @property {string} name - The name of the tool being called.
 * @property {object} args - The arguments passed to the tool.
 * @property {any} [result] - The result returned by the tool.
 * @property {'pending' | 'complete'} status - The status of the tool call.
 */

/**
 * @typedef {object} AgentState
 * @property {ChatMessage[]} messages - The history of messages in the agent conversation.
 * @property {boolean} isLoading - True when the agent is processing.
 * @property {Error | null} error - Any error that occurred during the run.
 * @property {string} streamingResponse - The current text being streamed by the agent.
 * @property {ToolEvent[]} toolEvents - A log of tool calls and their results.
 */

/**
 * @typedef {object} UseAgentReturn
 * @property {import('../core/reactivity.js').ReactiveProxy<AgentState>} state - The reactive state of the agent interaction.
 * @property {(messages: ChatMessage[]) => Promise<void>} run - Executes the agent with a given set of messages.
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
   * @type {AIService['generate']}
   */
  const generate = async (prompt, options = {}) => {
    const response = await fetch('/api/ai/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, options }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`AI generation failed: ${errorText}`);
    }
    return response.body;
  };

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

  /**
   * @type {AIService['run']}
   */
  const run = async (agentName, messages, options = {}) => {
    const response = await fetch(`/api/ai/agent/run/${agentName}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, options }),
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Agent run failed for '${agentName}': ${errorText}`);
    }
    return response.body;
  };

  const models = {
    list: async () => {
      const response = await fetch('/api/ai/models/list');
      if (!response.ok) throw new Error('Failed to list models.');
      return response.json();
    },
    /** @param {string} modelName */
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
    /** @param {string} modelName */
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

  return { generate, chat, models, search, run };
}

/**
 * @internal
 * @returns {AIService}
 */
function getAiServiceInstance() {
  if (!aiServiceInstance) {
    aiServiceInstance = createAIService();
  }
  return aiServiceInstance;
}

/**
 * @overload
 * @returns {AIService} - The singleton AI service instance.
 */
/**
 * @overload
 * @param {string} prompt - A prompt for a simple, stateless text generation.
 * @param {object} [options] - Optional parameters for the generation.
 * @returns {Promise<ReadableStream | null>} - A stream of the generated text.
 */
/**
 * Provides access to the framework's AI capabilities.
 *
 * Can be used in two ways:
 * 1. As a function for simple generation: `ai("Why is the sky blue?")`
 * 2. As an object for advanced features: `ai.chat(messages)` or `ai.run('agent', ...)`
 */
const aiProxy = new Proxy(function () {}, {
  /**
   * @param {any} _
   * @param {any} __
   * @param {any[]} args
   */
  apply(_, __, args) {
    const instance = getAiServiceInstance();
    if (args.length > 0) {
      const [prompt, options] = args;
      return instance.generate(prompt, options);
    }
    return instance;
  },
  /**
   * @param {any} _
   * @param {keyof AIService} prop
   */
  get(_, prop) {
    const instance = getAiServiceInstance();
    return instance[prop];
  },
});

export const ai =
  /** @type {AIService & ((prompt?: string, options?: object) => (Promise<ReadableStream | null> | AIService))} */ (
    aiProxy
  );

/**
 * A composable for interacting with a server-side AI agent in real-time.
 * @param {string} agentName - The name of the agent to run.
 * @returns {UseAgentReturn}
 */
export function useAgent(agentName) {
  if (typeof window === 'undefined') {
    const mockState = state({
      messages: [],
      isLoading: false,
      error: null,
      streamingResponse: '',
      toolEvents: [],
    });
    return { state: mockState, run: async () => {} };
  }

  const s = state({
    messages: /** @type {ChatMessage[]} */ ([]),
    isLoading: false,
    error: /** @type {Error | null} */ (null),
    streamingResponse: '',
    toolEvents: /** @type {ToolEvent[]} */ ([]),
  });

  /** @param {ChatMessage[]} messages */
  const run = async (messages) => {
    s.isLoading = true;
    s.error = null;
    s.streamingResponse = '';
    s.toolEvents = [];
    s.messages = [...messages];

    try {
      const stream = await ai.run(agentName, messages);
      if (!stream) return;

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep the last, possibly incomplete, line

        for (const line of lines) {
          if (line.trim() === '') continue;
          try {
            const event = JSON.parse(line);
            switch (event.type) {
              case 'chunk':
                s.streamingResponse += event.content || '';
                break;
              case 'tool_start':
                s.toolEvents.push({
                  name: event.name,
                  args: event.args,
                  status: 'pending',
                });
                break;
              case 'tool_end': {
                const toolEvent = s.toolEvents.find(
                  (e) => e.name === event.name && e.status === 'pending',
                );
                if (toolEvent) {
                  toolEvent.result = event.result;
                  toolEvent.status = 'complete';
                }
                break;
              }
            }
          } catch (e) {
            console.error('Failed to parse agent stream event:', line, e);
          }
        }
      }
    } catch (e) {
      s.error = e instanceof Error ? e : new Error(String(e));
    } finally {
      if (s.streamingResponse) {
        s.messages.push({
          role: 'assistant',
          content: s.streamingResponse,
        });
      }
      s.isLoading = false;
    }
  };

  return { state: s, run };
}

/**
 * A composable for creating a persistent, real-time AI chat.
 * @param {string} channel - A unique identifier for the chat channel.
 * @returns {UseConversationReturn}
 */
export function useConversation(channel) {
  if (typeof window === 'undefined') {
    const mockState = state({
      messages: [],
      isLoading: false,
      error: null,
      streamingResponse: '',
    });
    return { state: mockState, send: async () => {} };
  }

  const s = state({
    messages:
      /** @type {import('./ai.client.js').ConversationMessage[]} */ ([]),
    isLoading: true,
    error: /** @type {Error | null} */ (null),
    streamingResponse: '',
  });

  const chatDb = db('chat_messages');

  const fetchHistory = async () => {
    try {
      s.isLoading = true;
      const allMessages = await chatDb.query('by-channel', channel);
      if (allMessages) {
        s.messages = allMessages.sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        );
      }
    } catch (e) {
      s.error = e instanceof Error ? e : new Error(String(e));
    } finally {
      s.isLoading = false;
    }
  };

  onMounted(fetchHistory);
  const unsubscribe = chatDb.subscribe(fetchHistory);
  onUnmounted(unsubscribe);

  /** @param {string} content */
  const send = async (content) => {
    if (!session.user) {
      s.error = new Error('User not logged in.');
      return;
    }

    s.isLoading = true;
    s.error = null;
    s.streamingResponse = '';

    try {
      const userMessage = {
        id: crypto.randomUUID(),
        channel,
        username: session.user.username,
        message: content,
        user_id: session.user.id,
        created_at: new Date().toISOString(),
      };
      await chatDb.put(userMessage);

      // The subscription will update the local state, but we can grab the latest for the API call
      const allMessages = (await chatDb.query('by-channel', channel)) || [];
      const history = allMessages
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
        .map(
          (/** @type {ConversationMessage} */ msg) =>
            /** @type {ChatMessage} */ ({
              role:
                msg.username === /** @type {any} */ (session.user).username
                  ? 'user'
                  : 'assistant',
              content: msg.message,
            }),
        );

      const stream = await ai.chat(history);
      if (!stream) return;

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        s.streamingResponse += chunk;
        fullResponse += chunk;
      }

      if (fullResponse) {
        const aiMessage = {
          id: crypto.randomUUID(),
          channel,
          username: 'assistant',
          message: fullResponse,
          user_id: null,
          created_at: new Date().toISOString(),
        };
        await chatDb.put(aiMessage);
      }
    } catch (e) {
      s.error = e instanceof Error ? e : new Error(String(e));
    } finally {
      s.isLoading = false;
      s.streamingResponse = '';
    }
  };

  return { state: s, send };
}
