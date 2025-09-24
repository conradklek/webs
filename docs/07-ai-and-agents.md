# AI & Agents

Webs integrates a sophisticated AI suite as a first-class citizen, enabling the development of intelligent applications. The system is built around local AI models powered by **Ollama** and a vector store using **`sqlite-vec`**.

## Client-Side AI Service

The primary client-side entry point for all AI capabilities is the globally available `ai` service. It offers a clean, promise-based API for interacting with the server-side AI module.

- `ai.generate(prompt)`: Streams a response for a single text prompt.
- `ai.chat(messages)`: Streams a response for a stateful, multi-turn conversation.
- `ai.search(query)`: Performs semantic search over the user's indexed files.
- `ai.agent(agentName, messages)`: Executes a server-side agent and streams its execution.

## UI Composables

For common AI patterns, the framework provides reactive composable hooks.

### `useChat(chatId)`

This composable creates a persistent, real-time AI chat interface. It automatically handles message history from IndexedDB and synchronizes the conversation across devices. It returns a reactive `state` object and a `send` function.

### `useAgent(agentName)`

This composable provides a real-time connection to a server-side agent. It streams the agent's execution, including text responses and tool usage, allowing you to build rich UIs that visualize the agent's thought process. It returns a reactive `state` object and a `run` function. The `state` object contains a `toolEvents` array that logs each tool call's name, arguments, and status (`pending` or `complete`).

## Server-Side Agents

The most powerful feature of the AI suite is the ability to define autonomous agents in `.agent.webs` files. An agent consists of a system prompt, a set of tools it can use, and the functions that implement those tools.

### Defining an Agent

The framework automatically handles the "tool-use loop": when the LLM decides to call a function, the framework intercepts the request, executes your corresponding server-side function with the correct arguments and context (`db`, `user`, `fs`), and feeds the result back to the LLM to continue its reasoning process.

**`src/app/file-manager.agent.webs`**

```javascript
// Import the standard library of pre-defined tools and their implementations.
import { allTools, coreTools } from '@conradklek/webs/ai';

// 1. Define the agent's core instructions.
export const system_prompt = 'You are an expert file management assistant.';

// 2. Define the tools the agent is allowed to use.
// 'allTools' is a predefined library of common file and database tools.
export const tools = [...allTools];

// 3. Export the functions that implement the tools.
// 'coreTools' contains the implementations for the predefined 'allTools'.
export default {
  ...coreTools,

  // You can also define your own custom tools.
  // The first argument is always the server context.
  async summarizeFile({ fs, ai }, { path }) {
    const content = await fs.cat(path).then((f) => f.text());
    const summaryStream = await ai.generate(`Summarize this text: ${content}`);
    let summary = '';
    for await (const chunk of summaryStream) {
      summary += chunk;
    }
    return summary;
  },
};

// 4. Add the custom tool's definition to the `tools` export so the LLM knows about it.
tools.push({
  type: 'function',
  function: {
    name: 'summarizeFile',
    description: 'Summarizes the content of a specific file.',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'The path to the file.' },
      },
      required: ['path'],
    },
  },
});
```
