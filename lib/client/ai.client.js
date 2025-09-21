import { state } from '../engine/reactivity.js';
import { db } from './db.client.js';
import { onMounted, onUnmounted } from '../engine/component.js';
import { session } from './session.js';
import { createLogger } from '../shared/logger.js';

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
 * @typedef {keyof typeof AIErrors} AIErrorName
 */

/**
 * A map of error names to their corresponding classes for client-side reconstruction.
 * @internal
 * @type {Record<AIErrorName, typeof AIError>}
 */
const errorNameToClassMap = {
  AIError,
  TimeoutError,
  EmbeddingError,
  ChatError,
  StoreError,
};

/**
 * Reconstructs a specific AIError instance from a plain object received from the server.
 * @param {{name: string, message: string}} errorData - The plain object representing the error.
 * @returns {AIError} An instance of the appropriate AIError subclass.
 */
export function createErrorFromServer(errorData) {
  const ErrorClass =
    errorNameToClassMap[/** @type {AIErrorName} */ (errorData.name)] || AIError;
  return new ErrorClass(errorData.message);
}

/**
 * @file Defines the core types and interfaces for interacting with the AI client service.
 * This service provides a comprehensive API for text generation, stateful chat, semantic search,
 * and running server-side agents, forming the primary entry point for all client-side AI capabilities.
 */

/**
 * Represents a tool call requested by the AI model. The client is expected
 * to execute the specified function with the given arguments and return the result.
 * @typedef {object} ToolCall
 * @property {string} id - A unique identifier for this specific tool call. This ID is used to link the tool's result back to the initial request.
 * @property {object} function - The function to be executed.
 * @property {string} function.name - The name of the function to call (e.g., 'calculator', 'listFiles').
 * @property {object} function.arguments - A JSON object containing the arguments for the function, structured as defined in the tool's parameter schema.
 */

/**
 * Represents a single message in a chat conversation. This is the fundamental unit
 * of communication with the AI models.
 * @typedef {object} ChatMessage
 * @property {'user' | 'assistant' | 'system' | 'tool'} role - The role of the message sender.
 * @property {string} content - The textual content of the message. For the 'tool' role, this is often a JSON string representing the tool's output.
 * @property {string | number} [user_id] - Optional user ID for filtering or context, particularly in multi-user scenarios.
 * @property {ToolCall[]} [tool_calls] - An array of tool calls requested by the assistant. This is present only when `role` is 'assistant'.
 * @property {string} [tool_call_id] - The ID of the tool call this message is a response to. Required when `role` is 'tool'.
 * @property {string} [tool_name] - The name of the tool that was executed. Used for context when `role` is 'tool'.
 */

/**
 * Represents a chat session.
 * @typedef {object} Chat
 * @property {string} id - The unique ID of the chat.
 * @property {string} name - The user-facing name or title of the chat.
 * @property {string} [topic] - A brief topic or summary of the chat.
 * @property {number} owner_id - The ID of the user who owns the chat.
 * @property {string} created_at - An ISO 8601 timestamp of when the chat was created.
 */

/**
 * Describes the metadata associated with a semantic search result,
 * providing context about where the matched text was found.
 * @typedef {object} SearchResultMetadata
 * @property {string} filePath - The path to the source file of the result.
 * @property {number} startLine - The starting line number of the relevant text chunk in the file.
 * @property {number} endLine - The ending line number of the text chunk.
 * @property {string} [className] - If applicable, the name of the class containing the code chunk.
 * @property {string} [functionName] - If applicable, the name of the function or method.
 * @property {string} [summary] - An AI-generated summary of the text chunk, useful for quick previews.
 */

/**
 * Represents a single item returned from a semantic search query.
 * @typedef {object} SearchResult
 * @property {string} text - The actual text content of the search result.
 * @property {number} score - The relevance score of the result. Lower scores typically indicate a better match.
 * @property {SearchResultMetadata} metadata - Detailed metadata about the source of the text.
 */

/**
 * Provides an API for managing local AI models (e.g., via Ollama).
 * @typedef {object} AIModelService
 * @property {() => Promise<AIModel[]>} list - Retrieves a list of all locally available models.
 * @property {(modelName: string) => Promise<ReadableStream | null>} pull - Downloads a model from the registry. Returns a stream of progress events (JSON objects).
 * @property {(modelName: string) => Promise<any>} delete - Deletes a local model from the disk.
 */

/**
 * Defines the full API surface of the client-side AI service.
 * @typedef {object} AIService
 * @property {(prompt: string, options?: { model?: string }) => Promise<ReadableStream | null>} generate - Sends a single prompt for text generation and returns a `ReadableStream`.
 * @property {(prompt: string, options?: { onChunk?: (chunk: string) => void, model?: string }) => Promise<string>} stream - A convenience wrapper around `generate`.
 * @property {(messages: ChatMessage[], options?: { model?: string }) => Promise<ReadableStream | null>} chat - Sends a conversation history to the AI and returns a streaming response.
 * @property {(message: ChatMessage, options?: { model?: string }) => Promise<void>} createChat - Initiates a new, persistent chat, automatically titles it, and redirects.
 * @property {() => Promise<Chat[]>} getChats - Retrieves a list of all chats for the current user.
 * @property {(id: string, updates: Partial<Pick<Chat, 'name' | 'topic'>>) => Promise<Chat>} updateChat - Updates the details of a chat.
 * @property {(id: string) => Promise<{ success: boolean }>} deleteChat - Deletes a chat and all its messages.
 * @property {(query: string, limit?: number) => Promise<SearchResult[]>} search - Performs a semantic search over indexed files.
 * @property {(agentName: string, messages: ChatMessage[], options?: object) => Promise<ReadableStream | null>} agent - Executes a server-side agent.
 * @property {AIModelService} models - An object for managing local AI models.
 */

/**
 * Represents a single message within the context of the `useChat` composable,
 * stored in the client-side IndexedDB.
 * @typedef {object} StoredChatMessage
 * @property {string} id - A unique ID for the message.
 * @property {string} chat_id - The ID of the chat this message belongs to.
 * @property {string} username - The username of the sender ('assistant' for AI messages).
 * @property {string} message - The text content of the message.
 * @property {number | null} user_id - The ID of the user who sent the message, or null for the AI assistant.
 * @property {string} created_at - An ISO 8601 timestamp of when the message was created.
 */

/**
 * Defines the reactive state for the `useChat` composable.
 * @typedef {object} ChatState
 * @property {StoredChatMessage[]} messages - An array of all messages in the chat, sorted chronologically.
 * @property {boolean} isLoading - True when fetching history or waiting for an AI response.
 * @property {Error | null} error - Any error that occurred.
 * @property {string} streamingResponse - The current AI response being streamed in real-time.
 */

/**
 * Configuration options for the `useChat` composable.
 * @typedef {object} UseChatOptions
 * @property {StoredChatMessage[]} [initialMessages] - Messages to hydrate the state with, from SSR.
 */

/**
 * The return type of the `useChat` composable.
 * @typedef {object} UseChatReturn
 * @property {import('../engine/reactivity.js').ReactiveProxy<ChatState>} state - The reactive state of the chat.
 * @property {(content: string) => Promise<void>} send - Sends a new message from the user to the chat.
 */

/**
 * Represents a locally available AI model that can be managed by the client,
 * typically interacting with a local Ollama instance.
 * @typedef {object} AIModel
 * @property {string} name - The unique name of the model (e.g., 'gemma3:latest').
 * @property {string} [license] - The license under which the model is distributed.
 * @property {string} [size] - The size of the model on disk (e.g., '4.5GB').
 * @property {string} [modified_at] - The ISO 8601 timestamp of when the model was last modified.
 */

/**
 * Represents a tool call event during an agent's execution run.
 * @typedef {object} ToolEvent
 * @property {string} name - The name of the tool being called.
 * @property {object} args - The arguments passed to the tool.
 * @property {any} [result] - The result returned by the tool after execution.
 * @property {'pending' | 'complete'} status - The current status of the tool call.
 */

/**
 * Defines the reactive state for the `useAgent` composable.
 * @typedef {object} AgentState
 * @property {ChatMessage[]} messages - The complete history of messages in the agent conversation.
 * @property {boolean} isLoading - True when the agent is processing a request.
 * @property {Error | null} error - Any error that occurred during the agent's run.
 * @property {string} streamingResponse - The current text being streamed by the agent.
 * @property {ToolEvent[]} toolEvents - A log of tool calls for the current run.
 */

/**
 * Configuration options for the `useAgent` composable.
 * @typedef {object} UseAgentOptions
 * @property {ChatMessage[]} [initialMessages] - Messages to hydrate the state with, useful for SSR.
 */

/**
 * The return type of the `useAgent` composable.
 * @typedef {object} UseAgentReturn
 * @property {import('../engine/reactivity.js').ReactiveProxy<AgentState>} state - The reactive state of the agent interaction.
 * @property {(messages: ChatMessage[]) => Promise<void>} run - Executes the agent with a given set of messages.
 */

/** @type {AIService | undefined} */
let aiServiceInstance;

/**
 * @param {ReadableStream} stream
 * @param {(chunk: string) => void} [onChunk]
 */
async function readTextStream(stream, onChunk) {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let fullText = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    fullText += chunk;
    if (onChunk) {
      onChunk(chunk);
    }
  }
  return fullText;
}

function createAIService() {
  /**
   * @param {string} url
   * @param {any} body
   * @param {string} errorContext
   * @param {string} [method='POST']
   */
  const handleRequest = async (url, body, errorContext, method = 'POST') => {
    const response = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      if (response.status === 302 && response.headers.get('Location')) {
        const location = response.headers.get('Location');
        if (location) {
          window.location.href = location;
        }
        return new Response(null, { status: 200 });
      }
      const errorText = await response.text();
      try {
        const errorData = JSON.parse(errorText);
        throw createErrorFromServer(errorData);
      } catch (e) {
        if (e instanceof AIError) throw e;
        throw new AIError(`${errorContext} failed: ${errorText}`);
      }
    }

    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return response.json();
    }
    return response.body;
  };

  /**
   * @param {string} prompt
   * @param {{ model?: string }} [options={}]
   */
  const generate = (prompt, options = {}) =>
    handleRequest('/api/ai/generate', { prompt, options }, 'AI generation');

  /**
   * @param {string} prompt
   * @param {{ onChunk?: (chunk: string) => void, model?: string }} [options={}]
   */
  const stream = async (prompt, options = {}) => {
    const stream = await generate(prompt, options);
    if (!stream) return '';
    return readTextStream(stream, options.onChunk);
  };

  /**
   * @param {string} query
   * @param {number} [limit=5]
   */
  const search = (query, limit = 5) =>
    handleRequest('/api/ai/search/files', { query, limit }, 'AI search');

  /**
   * @param {ChatMessage[]} messages
   * @param {{ model?: string }} [options={}]
   */
  const chat = (messages, options = {}) =>
    handleRequest('/api/ai/chat', { messages, options }, 'AI chat');

  /**
   * @param {ChatMessage} message
   * @param {{ model?: string }} [options={}]
   */
  const createChat = async (message, options = {}) => {
    await handleRequest(
      '/api/ai/chats/new',
      { message, options },
      'AI create chat',
    );
  };

  const getChats = () =>
    handleRequest('/api/ai/chats', undefined, 'Get chats', 'GET');

  /**
   * @param {string} id
   * @param {Partial<Pick<Chat, 'name' | 'topic'>>} updates
   */
  const updateChat = (id, updates) =>
    handleRequest(`/api/ai/chats/${id}`, updates, 'Update chat', 'PATCH');

  /** @param {string} id */
  const deleteChat = (id) =>
    handleRequest(`/api/ai/chats/${id}`, undefined, 'Delete chat', 'DELETE');

  /**
   * @param {string} agentName
   * @param {ChatMessage[]} messages
   * @param {object} [options={}]
   */
  const agent = (agentName, messages, options = {}) =>
    handleRequest(
      `/api/ai/agent/${agentName}`,
      { messages, options },
      `Agent execution for '${agentName}'`,
    );

  const models = {
    list: async () =>
      handleRequest('/api/ai/models/list', undefined, 'List models', 'GET'),
    /** @param {string} modelName */
    pull: async (modelName) =>
      handleRequest('/api/ai/models/pull', { model: modelName }, 'Pull model'),
    /** @param {string} modelName */
    delete: async (modelName) =>
      handleRequest(
        '/api/ai/models/delete',
        { model: modelName },
        'Delete model',
      ),
  };

  return {
    generate,
    stream,
    chat,
    createChat,
    getChats,
    updateChat,
    deleteChat,
    models,
    search,
    agent,
  };
}

function getAiServiceInstance() {
  if (!aiServiceInstance) {
    aiServiceInstance = createAIService();
  }
  return aiServiceInstance;
}

const aiProxy = new Proxy(function () {}, {
  apply(_, __, args) {
    const instance = getAiServiceInstance();
    if (args.length > 0) {
      const [prompt, options] = args;
      return instance.generate(prompt, options);
    }
    return instance;
  },
  get(_, prop) {
    const instance = getAiServiceInstance();
    return instance[/** @type {keyof AIService} */ (prop)];
  },
});

export const ai =
  /** @type {AIService & ((prompt?: string, options?: object) => (Promise<ReadableStream | null> | AIService))} */ (
    aiProxy
  );

/**
 * @param {string} agentName
 * @param {UseAgentOptions} [options={}]
 */
export function useAgent(agentName, options = {}) {
  /** @type {AgentState} */
  const initialState = {
    messages: options.initialMessages || [],
    isLoading: false,
    error: null,
    streamingResponse: '',
    toolEvents: [],
  };

  if (typeof window === 'undefined') {
    return { state: state(initialState), run: async () => {} };
  }

  const s =
    /** @type {import('../engine/reactivity.js').ReactiveProxy<AgentState>} */ (
      state(initialState)
    );

  /** @param {ChatMessage[]} messages */
  const run = async (messages) => {
    s.isLoading = true;
    s.error = null;
    s.streamingResponse = '';
    s.toolEvents = [];
    s.messages = [...messages];

    try {
      const stream = await ai.agent(agentName, messages);
      if (!stream) return;

      let buffer = '';
      await readTextStream(stream, (/** @type {string} */ chunk) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

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
      });
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
 * A composable for creating a persistent, real-time AI chat that syncs across devices.
 * It automatically handles message history from IndexedDB and real-time updates.
 *
 * @param {string | null} chatId - A unique identifier for the chat. If null, a new chat will be created on the first `send`.
 * @param {UseChatOptions} [options={}] - Options for initialization.
 * @returns {UseChatReturn} An object containing the reactive `state` and the `send` function.
 */
export function useChat(chatId, options = {}) {
  /** @type {ChatState} */
  const initialState = {
    messages: options.initialMessages || [],
    isLoading: !options.initialMessages,
    error: null,
    streamingResponse: '',
  };

  if (typeof window === 'undefined') {
    return { state: state(initialState), send: async () => {} };
  }

  const s = state(initialState);
  const chatDb = db('chat_messages');

  const fetchHistory = async () => {
    if (!chatId) {
      s.isLoading = false;
      return;
    }
    if (s.messages.length > 0) {
      s.isLoading = false;
      return;
    }
    try {
      s.isLoading = true;
      const allMessages = await chatDb.query('by-chat', chatId);
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

  if (chatId) {
    onMounted(fetchHistory);
    const unsubscribe = chatDb.subscribe(fetchHistory);
    onUnmounted(unsubscribe);
  }

  /** @param {string} content */
  const send = async (content) => {
    if (!session.user) {
      s.error = new AIError('User not logged in.');
      return;
    }

    if (!chatId) {
      await ai.createChat({ role: 'user', content });
      return;
    }

    s.isLoading = true;
    s.error = null;
    s.streamingResponse = '';

    try {
      const userMessage = {
        id: crypto.randomUUID(),
        chat_id: chatId,
        username: session.user.username,
        message: content,
        user_id: session.user.id,
        created_at: new Date().toISOString(),
      };
      await chatDb.put(userMessage);

      const allMessages = (await chatDb.query('by-chat', chatId)) || [];
      const historyForApi = allMessages
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        )
        .map((msg) => {
          /** @type {ChatMessage['role']} */
          const role =
            msg.username === session.user?.username ? 'user' : 'assistant';
          return {
            role,
            content: msg.message,
          };
        });

      const stream = await ai.chat(historyForApi);
      if (!stream) return;

      const fullResponse = await readTextStream(
        stream,
        (/** @type {string} */ chunk) => {
          s.streamingResponse += chunk;
        },
      );

      if (fullResponse) {
        const aiMessage = {
          id: crypto.randomUUID(),
          chat_id: chatId,
          username: 'assistant',
          message: fullResponse,
          user_id: null,
          created_at: new Date().toISOString(),
        };
        await chatDb.put(aiMessage);
      }
    } catch (e) {
      s.error = e instanceof Error ? e : new AIError(String(e));
      if (e instanceof ChatError) {
        console.error('A chat-specific error occurred:', e.message);
      }
    } finally {
      s.isLoading = false;
      s.streamingResponse = '';
    }
  };

  return { state: s, send };
}
