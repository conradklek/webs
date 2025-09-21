# The Webs Framework

Webs is a full-stack JavaScript framework engineered for a new generation of applications: software that is **performant, offline-capable, and intelligent by default**. It is built on an elegant local-first architecture that seamlessly synchronizes a client-side database with the server, enabling an instantaneous user experience, free from network latency and loading spinners.

At its core, Webs is designed to unify three foundational pillars of modern software development:

### 1. The Local-First Sync Engine: Zero-Latency & Resilient

The cornerstone of a Webs application is its data layer. By treating the user's device as the primary data source, the framework leverages a client-side IndexedDB database as the single source of truth for the UI, resulting in a fundamentally faster and more resilient architecture.

- **Zero-Latency UI**: All database operations (`put`, `delete`) execute instantly on the client. The UI never waits for a server roundtrip, leading to an exceptionally responsive user experience.
- **Automatic Synchronization**: Changes are committed to a local `outbox` and seamlessly synchronized to the server in the background via WebSockets. The engine intelligently handles connection interruptions and ensures eventual consistency.
- **Effortless Offline Support**: Because the application reads and writes locally, it remains fully functional while offline. Upon reconnection, the sync engine automatically reconciles all pending changes.
- **Real-Time Collaboration**: The server broadcasts changes to all connected clients, ensuring data is kept in sync across a user's devices or between collaborating users in real-time.

### 2. The Integrated AI Suite: Context-Aware Intelligence

Webs treats artificial intelligence as a first-class citizen, providing a complete, server-side suite for building applications with deep contextual understanding of user data.

- **Automated RAG Pipeline**: The framework's file system API is deeply integrated with the AI's vector store. When a user's file is written or synchronized, it's automatically chunked, converted to vector embeddings, and indexed. This transforms the user's file system into a searchable, personal knowledge base with zero configuration.
- **Tool-Using Agents**: Define powerful AI agents in simple `.agent.webs` files. Equip them with tools—server-side functions—that can interact with the database, file system, or external APIs. The framework manages the entire tool-use loop, streaming text, tool calls, and results back to the client in real-time.
- **Persistent Conversations**: Build stateful, multi-device chat experiences with a single composable hook. Conversations are automatically persisted to the local database and synced, allowing a user to continue their dialogue seamlessly on any device.

### 3. The Developer Experience: Elegance & Power

Webs is designed for productivity, combining the simplicity of file-based conventions with a powerful, modern reactivity system.

- **File-Based Everything**: Routes, layouts, components, and even AI agents are defined by the structure of your `src` directory. This convention-over-configuration approach eliminates boilerplate and complex configuration files.
- **Single-File Components**: `.webs` files encapsulate template, logic, and style in a familiar and organized structure, enabling clear separation of concerns at the component level.
- **Composable UI Modules**: A unique pattern for creating complex, reusable UI elements. A single `.webs` file can export multiple component definitions that share logic via a `provide`/`inject` system, promoting elegant state management and code reuse.

---

# Getting Started

This guide introduces the fundamental concepts of the Webs framework by constructing an interactive component. Webs is built on the [Bun](https://bun.sh/) runtime, which must be installed to proceed.

## Project Structure

A Webs project adheres to a clean and intuitive directory structure. All application source code resides within the `src` directory.

```
/
├── .webs/         # Framework temporary files (auto-generated)
├── src/
│   ├── app/       # Page components, layouts, and server logic
│   ├── gui/       # Reusable, globally available UI components
│   └── pub/       # Static public assets (images, fonts, etc.)
├── package.json
└── ...
```

The `src/app/` directory is central to the framework, as its file structure directly dictates the application's routes.

## Creating a Page

A page is defined by creating a `.webs` file within `src/app/`. We will begin by creating the application's root page.

**`src/app/index.webs`**

```html
<template>
  <h1>Welcome to Webs</h1>
  <p>This page is rendered on the server.</p>
</template>
```

This file contains a single `<template>` block, which defines the static HTML structure for the route.

To view this page, execute the development command from your terminal:

```bash
bun run dev
```

This command initiates the development server and launches the application in your default browser, typically at `http://localhost:3000`. Any subsequent changes to your source files will be reflected instantly in the browser.

## State and Interactivity

To introduce interactivity, we augment the component with a `<script>` block and reactive state. We will transform the static page into a dynamic counter.

**`src/app/index.webs`**

```html
<script>
  // 1. Import the `state` function from the framework's core library.
  import { state } from '@conradklek/webs';

  // 2. Export the component definition object.
  export default {
    // 3. The setup function is the component's composition entry point.
    setup() {
      // 4. Declare a reactive state variable initialized to 0.
      const count = state(0);

      // 5. Define a method to mutate the state.
      function increment() {
        // Primitives wrapped by state() are 'refs' and must be accessed via .value.
        count.value++;
      }

      // 6. Expose the reactive state and methods to the template.
      return { count, increment };
    },
  };
</script>

<template>
  <h1>Reactive Counter</h1>
  <!-- 7. Bind the count state to the template using interpolation. -->
  <p>Current count: {{ count }}</p>

  <!-- 8. Bind the increment method to the button's click event. -->
  <button @click="increment">Increment</button>
</template>
```

### Key Architectural Concepts:

- **`<script>` block**: The component's logic resides here. It is treated as a standard JavaScript module.
- **`setup()` function**: This is the primary entry point for a component's logic and is invoked once upon component creation.
- **`state()`**: This is the core reactivity primitive. When a value is wrapped with `state()`, Webs tracks it for changes. When the value is mutated, any part of the template that depends on it will automatically re-render.
- **Return from `setup`**: The object returned from `setup` forms the public context for the component's template.
- **Template Syntax**:
  - `{{ count }}`: An interpolation that reactively displays the value of `count`.
  - `@click="increment"`: An event handler that declaratively binds the `increment` method to the button's click event.

You have now implemented a fully reactive component, demonstrating the fundamental design pattern for building sophisticated user interfaces with Webs.

---

# Components & Reactivity

The architecture of a Webs application is centered on a powerful component model, driven by a fine-grained reactivity system. This paradigm enables the construction of complex, interactive user interfaces in a declarative and maintainable fashion.

## Single-File Components (`.webs`)

Applications are composed of Single-File Components (`.webs` files), each encapsulating the logic, template, and styling for a discrete piece of the UI.

A `.webs` file is typically composed of three sections:

- **`<script>`**: Contains the component's JavaScript logic, including state, methods, and lifecycle hooks.
- **`<template>`**: Defines the HTML structure and bindings for the component.
- **`<style>`**: Contains component-scoped CSS (though styling is typically handled via utility classes directly in the template).

### The Component Definition

Within the `<script>` tag, the component's behavior is defined by exporting a component definition object. The framework's compiler intelligently identifies the primary component export, whether it's a `default` export, a single named export, or a named export that matches the filename in PascalCase.

The `setup` function is the core of the component definition.

```html
<!-- src/app/my-component.webs -->
<script>
  import { state } from '@conradklek/webs';

  export default {
    // Define the component's public API via props.
    props: {
      initialCount: { default: 0 },
    },

    // The setup function is the composition entry point.
    setup(props) {
      // Define reactive state, often initialized from props.
      const count = state(props.initialCount);

      // Define methods that encapsulate state mutations.
      function increment() {
        count.value++;
      }

      // Expose the public context for the template.
      return { count, increment };
    },
  };
</script>

<template>
  <button @click="increment">Count is: {{ count }}</button>
</template>
```

### The `setup` Function

The `setup(props, context)` function is invoked once per component instance.

- `props`: A reactive object containing the component's resolved properties.
- `context`: A non-reactive object containing:
  - `attrs`: Fallthrough attributes not declared in `props`.
  - `slots`: An object representing content injected by the parent component.
  - `params`: Route parameters from the URL.

The object returned from `setup` constitutes the public render context for the template.

### Lifecycle Hooks

To execute logic at specific points in a component's lifecycle, import and invoke the lifecycle functions within `setup`.

- `onMounted(callback)`: Executes after the component is mounted to the DOM.
- `onUnmounted(callback)`: Executes just before the component is unmounted, ideal for cleanup.
- `onBeforeUpdate(callback)`: Executes before a re-render is triggered by a state change.
- `onUpdated(callback)`: Executes after a re-render has completed.

```javascript
import { onMounted, onUnmounted } from '@conradklek/webs';

export default {
  setup() {
    let intervalId;
    onMounted(() => {
      intervalId = setInterval(() => console.log('tick'), 1000);
    });
    onUnmounted(() => {
      clearInterval(intervalId);
    });
  },
};
```

### Dependency Injection with `provide` and `inject`

For sharing state across a deep component tree without "prop drilling," the framework provides a dependency injection system. An ancestor can `provide` a value, and any descendant can `inject` it.

**Provider Component**

```javascript
import { provide, state } from '@conradklek/webs';

export default {
  setup() {
    const theme = state({ color: 'dark' });
    provide('theme', theme); // Makes the theme state available to all descendants.
  },
};
```

**Consumer Component**

```javascript
import { inject } from '@conradklek/webs';

export default {
  setup() {
    const theme = inject('theme'); // Injects the value.
    const analyticsId = inject('analyticsId', 'default-id'); // Can provide a default.
    return { theme };
  },
};
```

---

## The Reactivity System

The reactivity system enables automatic UI updates in response to state changes.

### `state()` and `ref()`

Reactive data is declared with the `state()` function.

- For **objects and arrays**, `state()` returns a deep reactive proxy. Mutations are tracked automatically.
- For **primitive values**, `state()` returns a `ref` object. The underlying value must be accessed and mutated via the `.value` property.

The `ref()` function is an alias for `state()` with a primitive value.

```javascript
import { state, ref } from '@conradklek/webs';

const user = state({ name: 'Webs' }); // Reactive Proxy
const count = state(0); // Ref
const isActive = ref(true); // Ref

// Mutations trigger updates
user.name = 'Gemini';
count.value++;
```

### `computed()`

A `computed()` property is a derived, read-only `ref`. It caches its value and only re-evaluates when its underlying reactive dependencies change.

```javascript
import { state, computed } from '@conradklek/webs';

const user = state({ firstName: 'John', lastName: 'Doe' });

const fullName = computed(() => `${user.firstName} ${user.lastName}`);

console.log(fullName.value); // "John Doe"
user.firstName = 'Jane';
console.log(fullName.value); // "Jane Doe"
```

### `effect()`

The `effect()` function is the core of the reactivity system. It runs a function immediately, tracks its dependencies, and re-runs it when dependencies change. It supports two patterns:

1.  **Autorun**: A function that runs on creation and any time its dependencies are updated.
2.  **Watcher**: Watches a specific data source and executes a callback with the new and old values upon change.

```javascript
import { state, effect } from '@conradklek/webs';

const count = state(0);
const user = state({ name: 'Webs' });

// 1. Autorun: logs immediately, then on every change to count.value
effect(() => console.log(`Count: ${count.value}`));

// 2. Watcher: only runs when user.name changes.
effect(
  () => user.name, // Source
  (newName, oldName) => {
    // Callback
    console.log(`Name changed from ${oldName} to ${newName}`);
  },
);
```

### Global State with `store()`

For state shared across the entire application, the `store()` function creates a centralized, reactive store combining state, computed getters, and actions.

**`src/stores/counter.js`**

```javascript
import { store } from '@conradklek/webs';

export const counterStore = store({
  state: () => ({ count: 0 }),
  getters: {
    double: (state) => state.count * 2,
  },
  actions: {
    increment(state) {
      state.count++;
    },
  },
});
```

---

# AI & Agents

Webs integrates a sophisticated AI suite as a first-class citizen, enabling the development of intelligent, context-aware applications. The system is built around local AI models powered by Ollama and provides a comprehensive toolkit for everything from simple text generation to complex, tool-using autonomous agents.

## Client-Side AI Service

The primary client-side entry point for all AI capabilities is the globally available `ai` service. It offers a clean, promise-based API for interacting with the server-side AI module.

- `ai.generate(prompt)`: Streams a response for a single text prompt.
- `ai.chat(messages)`: Streams a response for a stateful, multi-turn conversation.
- `ai.search(query)`: Performs semantic search over the user's indexed files.
- `ai.agent(agentName, messages)`: Executes a server-side agent.
- `ai.models`: An API for managing local Ollama models (`list`, `pull`, `delete`).

**Example: Simple Text Generation**

```javascript
import { ai, state } from '@conradklek/webs';

const response = state('');
const isLoading = state(false);

async function askQuestion() {
  isLoading.value = true;
  const stream = await ai.generate(
    'Explain the theory of relativity in simple terms.',
  );
  if (stream) {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      response.value += decoder.decode(value);
    }
  }
  isLoading.value = false;
}
```

## UI Composables

For common AI-powered UI patterns, the framework provides reactive composable hooks.

### `useConversation(channel)`

This composable creates a persistent, real-time AI chat interface. It automatically handles message history from IndexedDB and synchronizes the conversation across devices.

- **Returns**: `{ state, send }`
  - `state`: A reactive object containing `messages`, `isLoading`, `error`, and `streamingResponse`.
  - `send(message)`: A function to send a user's message and trigger an AI response.

### `useAgent(agentName)`

This composable provides a real-time connection to a server-side agent. It streams the agent's thought process, including text responses and tool usage, allowing you to build rich UIs that visualize the agent's execution.

- **Returns**: `{ state, run }`
  - `state`: A reactive object containing `messages`, `isLoading`, `error`, `streamingResponse`, and `toolEvents`.
  - `agent(messages)`: A function to execute the agent with a given message history.

## Server-Side Agents

The most powerful feature of the AI suite is the ability to define autonomous agents. Agents are defined in special `.agent.webs` files within your `src/app` directory. An agent consists of a system prompt, a set of tools it can use, and the functions that implement those tools.

### Defining an Agent

An agent file exports its configuration and tool implementations.

**`src/app/file-manager.agent.webs`**

```javascript
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

  // You can define custom tools here.
  async summarizeFile({ fs }, { path }) {
    const content = await fs.cat(path).then((f) => f.text());
    // ... call an LLM to summarize the content ...
    return 'This is a summary.';
  },
};

// Add the custom tool definition to the 'tools' export
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

The framework automatically handles the "tool-use loop": when the LLM decides to call a function, the framework intercepts the request, executes your corresponding server-side function with the correct arguments and context (`db`, `user`, `fs`), and feeds the result back to the LLM to continue its reasoning process.

---

# Database & State Management

Webs is architected around a powerful local-first data layer that ensures a zero-latency user experience and effortless offline capability. This is achieved through a dual-database system seamlessly connected by a real-time synchronization engine.

## Local-First Architecture

The framework treats the user's device as the primary source of truth. The UI interacts exclusively with a client-side IndexedDB database, resulting in instantaneous data operations and eliminating network-related loading states.

- **Server Database**: A server-side SQLite database acts as the authoritative data store and the central hub for synchronization.
- **Client Database**: An IndexedDB instance in the browser mirrors the server schema for specified tables and serves as the live data source for the application's UI.
- **Sync Engine**: A WebSocket-based engine handles the real-time, bidirectional synchronization of data between the client and server. It uses an `outbox` table on the client to queue changes made while offline, ensuring eventual consistency upon reconnection.

## Schema Definition

You define your database schema in a single configuration file. Tables intended for client-side use must be marked with `sync: true`. The framework uses this definition to manage migrations on the server and to create the necessary object stores and indexes in the client's IndexedDB.

**Example Schema (`server-config.js`)**

```javascript
export function getDbConfig() {
  return {
    name: 'fw.db',
    version: 1,
    tables: {
      todos: {
        sync: true, // This table will be available on the client
        keyPath: 'id',
        fields: {
          id: { type: 'text', primaryKey: true },
          content: { type: 'text', notNull: true },
          completed: { type: 'integer', notNull: true, default: 0 },
          user_id: { type: 'integer', notNull: true, references: 'users(id)' },
        },
        indexes: [{ name: 'by-user', keyPath: 'user_id' }],
      },
      // ... other tables (e.g., users, sessions)
    },
  };
}
```

## Client-Side Data Access

### The `table()` Composable

The primary method for interacting with data in a component is the `table()` composable. It provides a reactive, real-time connection to a specific database table. The returned state object automatically updates whenever the underlying data changes, whether due to local mutations or incoming sync events.

```html
<script>
  import { table, state } from '@conradklek/webs';

  export default {
    setup() {
      // A reactive, auto-updating connection to the 'todos' table.
      const todos = table('todos');
      const newTodoContent = state('');

      async function addTodo() {
        if (!newTodoContent.value.trim()) return;

        // `put` is an optimistic update. It resolves instantly.
        // The sync engine handles the server update in the background.
        await todos.put({
          id: crypto.randomUUID(),
          content: newTodoContent.value,
          completed: 0,
        });
        newTodoContent.value = '';
      }

      async function deleteTodo(id) {
        // `destroy` is also an optimistic update.
        await todos.destroy(id);
      }

      return { todos, newTodoContent, addTodo, deleteTodo };
    },
  };
</script>

<template>
  {#if todos.isLoading}
  <p>Loading...</p>
  {/if}
  <ul>
    {#each todos.data as todo (todo.id)}
    <li>
      <span>{{ todo.content }}</span>
      <button @click="deleteTodo(todo.id)">Delete</button>
    </li>
    {/each}
  </ul>
  <!-- Form to add new todo -->
</template>
```

The `table()` composable returns a reactive state object with the following properties:

- `data`: An array containing the records from the table.
- `isLoading`: A boolean indicating if the initial data fetch is pending.
- `error`: An error object if any operation fails.
- `put(record)`: An async function to add or update a record.
- `destroy(key)`: An async function to delete a record by its primary key.

### The `db()` Utility

For more granular or non-reactive database operations, the `db()` utility provides a direct API to a table's underlying methods.

```javascript
import { db } from '@conradklek/webs';

// Get a handle to the 'users' table
const usersTable = db('users');

async function findUser(id) {
  // Retrieve a single record by its primary key
  const user = await usersTable.get(id);
  return user;
}

async function findAdmins() {
  // Query using a defined index
  const admins = await usersTable.query('by-role', 'admin');
  return admins;
}
```

---

# Routing

Webs employs a file-based routing system that maps the structure of your `src/app` directory to the application's URL structure. This convention-over-configuration approach eliminates the need for manual routing configuration.

## Page Routes

Every `.webs` file within `src/app` is mapped to a route.

- `src/app/index.webs` -> `/`
- `src/app/about.webs` -> `/about`
- `src/app/dashboard/settings.webs` -> `/dashboard/settings`

### Index Routes

A file named `index.webs` serves as the root for its directory segment.

- `src/app/posts/index.webs` -> `/posts`

### Dynamic Routes

To create routes with dynamic parameters, use square brackets in the filename. The captured parameter is made available to the component.

- `src/app/posts/[id].webs` -> will match `/posts/123`, `/posts/my-first-post`, etc.

The parameter's value is accessible in the component's `setup` function via the `context.params` object.

**Example: Accessing Route Parameters**
`src/app/posts/[id].webs`

```html
<script>
  export default {
    setup(props, { params }) {
      // For a URL like /posts/123, params will be { id: '123' }
      const postId = params.id;
      return { postId };
    },
  };
</script>

<template>
  <h1>Post Details for ID: {{ postId }}</h1>
</template>
```

## Layouts

Shared UI structures, or layouts, can be defined by creating a `layout.webs` file. This layout will automatically wrap all sibling pages and pages in subdirectories. Page content is rendered into the layout's `<slot>` element.

Layouts can be nested to create complex UI structures.

**Example: A Nested Layout Structure**

```
src/app/
├── layout.webs      # Root layout (e.g., site header/footer)
├── dashboard/
│   ├── layout.webs  # Dashboard layout (e.g., sidebar)
│   ├── index.webs   # Renders at /dashboard
│   └── settings.webs# Renders at /dashboard/settings
└── index.webs       # Renders at /
```

In this example, a request to `/dashboard/settings` would render the `settings.webs` component within the `dashboard/layout.webs`, which is in turn rendered within the root `layout.webs`.

`src/app/dashboard/layout.webs`

```html
<template>
  <div class="dashboard-grid">
    <aside class="sidebar">
      <!-- Sidebar navigation -->
    </aside>
    <main class="content">
      <!-- The content for the current page is rendered here -->
      <slot></slot>
    </main>
  </div>
</template>
```

## Navigation

The framework includes a client-side router that intercepts navigation to provide a fluid, single-page application experience, avoiding full-page reloads.

### Link-Based Navigation

The router automatically intercepts `click` events on standard `<a>` tags. If the `href` attribute points to an internal route, the framework prevents the default browser behavior. Instead, it fetches the required data for the destination page and surgically updates the DOM.

```html
<template>
  <nav>
    <!-- These links trigger client-side navigation -->
    <a href="/">Home</a>
    <a href="/dashboard/settings">Settings</a>
  </nav>
</template>
```

### Programmatic Navigation

To navigate programmatically (e.g., after a form submission), import and use the `router` object.

```javascript
import { router } from '@conradklek/webs';

async function handleFormSubmit() {
  // ... submission logic ...
  await router.push('/dashboard');
}
```

## Data Loading with `prefetch`

To fetch data on the server before a page component is rendered, export a special server action named `prefetch`. This function runs in two scenarios:

1.  On the server during the initial Server-Side Rendering (SSR) of the page.
2.  On the server when a user triggers a client-side navigation to the page.

The object returned by `prefetch` is delivered to your component as the `initialState` prop, making it the canonical method for page-level data fetching.

**Example: Prefetching Page Data**
`src/app/posts/[id].webs`

```html
<script>
  import { state } from '@conradklek/webs';

  export const actions = {
    async prefetch({ db, params }) {
      const post = db.query('SELECT * FROM posts WHERE id = ?').get(params.id);
      return { post };
    },
  };

  export default {
    props: {
      initialState: { default: () => ({}) },
    },
    setup(props) {
      const post = state(props.initialState.post || null);
      return { post };
    },
  };
</script>

<template>
  {#if post}
  <h1>{{ post.title }}</h1>
  <article>{{ post.content }}</article>
  {:else}
  <p>Post not found.</p>
  {/if}
</template>
```

---

# Server-Side Logic

Webs is a full-stack framework designed to colocate server-side logic with its corresponding frontend component. This approach simplifies the development workflow by keeping related code in a single file. The framework provides two primary mechanisms for executing code on the server: **API Route Handlers** and **Server Actions**.

## API Route Handlers

Any page component (`.webs` file in `src/app`) can function as an API endpoint by exporting named functions that correspond to HTTP methods: `get`, `post`, `patch`, `put`, and `del`. This pattern is ideal for building traditional REST or RPC-style APIs.

Each handler function receives a `context` object containing all necessary server-side resources:

- `req`: The standard Request object, augmented with `user`, `db`, and `params`.
- `db`: The server-side SQLite database instance.
- `user`: The authenticated user object, if a session is active.
- `params`: An object containing dynamic route parameters.
- `fs`: A user-sandboxed file system API for secure file operations.

**Example: A Form Submission Endpoint**
`src/app/feedback.webs`

```html
<script>
  // This code executes exclusively on the server.
  export default {
    // This function handles POST requests made to the `/feedback` route.
    async post({ req, db, user }) {
      const { message } = await req.json();

      if (!message || typeof message !== 'string') {
        return new Response('Invalid payload: message is required.', {
          status: 400,
        });
      }

      // Persist the feedback to the database.
      db.prepare('INSERT INTO feedback (message, user_id) VALUES (?, ?)').run(
        message,
        user?.id,
      );

      return Response.json({ success: true, messageId: this.lastInsertRowid });
    },
  };
</script>

<template>
  <!-- Client-side form component -->
</template>
```

## Server Actions

Server Actions are functions designed for seamless RPC-style (Remote Procedure Call) communication from client-side code. They are defined within a component's `actions` object and can be invoked securely from the client.

### Defining Actions

To define server actions, export a top-level `actions` object from your component's `<script>` block.

```javascript
// In src/app/tasks.webs
export const actions = {
  // Each key defines an action that can be called from the client.
  // The first argument is always the server context.
  async createTask({ db, user }, content) {
    // This code runs on the server.
    const result = db
      .prepare('INSERT INTO tasks (content, user_id) VALUES (?, ?)')
      .run(content, user.id);
    return { success: true, taskId: result.lastInsertRowid };
  },
};
```

### Invoking Actions with `action()`

On the client, the `action()` composable provides a type-safe way to invoke a server action. It returns a `call` function to trigger the remote procedure and a reactive `state` object (`isLoading`, `data`, `error`) to track its lifecycle.

```html
<script>
  import { action } from '@conradklek/webs';

  export default {
    setup() {
      // Create a client-side handle for the 'createTask' server action.
      const { call: createTask, state } = action('createTask');

      async function handleNewTask(content) {
        await createTask(content);
        if (state.data?.success) {
          // ... refresh task list or show success message
        }
      }

      return { handleNewTask, taskState: state };
    },
  };
</script>

<template>
  <button @click="handleNewTask('My new task')" :disabled="taskState.isLoading">
    {#if taskState.isLoading} Creating... {:else} Add Task {/if}
  </button>

  {#if taskState.error}
  <p class="error">Error: {{ taskState.error.message }}</p>
  {/if}
</template>
```

### Data Loading with `prefetch`

A reserved server action, `prefetch`, is executed before a page component is rendered. This applies to both the initial server-side render (SSR) and subsequent client-side navigations. It is the canonical mechanism for fetching the data a page requires.

The object returned by `prefetch` is passed directly to the component as the `initialState` prop.

**Example: Prefetching a User Profile**
`src/app/users/[username].webs`

```html
<script>
  import { state } from '@conradklek/webs';

  export const actions = {
    async prefetch({ db, params }) {
      const profile = db
        .query('SELECT * FROM users WHERE username = ?')
        .get(params.username);
      return { profile };
    },
  };

  export default {
    props: {
      initialState: { default: () => ({}) },
    },
    setup(props) {
      const userProfile = state(props.initialState.profile || null);
      return { userProfile };
    },
  };
</script>

<template>
  {#if userProfile}
  <h1>{{ userProfile.username }}'s Profile</h1>
  {:else}
  <p>User not found.</p>
  {/if}
</template>
```

---

# Deployment & CLI

Webs is equipped with a comprehensive command-line interface (CLI) that streamlines the entire development lifecycle, from running a local dev server to building a highly optimized production bundle.

## Development Server

To start the development server, run the `dev` command. This is your primary command during development.

```bash
bun run dev
```

The `dev` command initiates a complete development environment:

- **On-the-Fly Compilation**: Compiles `.webs` files into executable JavaScript in a temporary `.webs` directory.
- **Database Seeding**: In development mode, seeds the database with initial data for consistent testing.
- **Interactive Shell**: Opens an interactive shell for running commands, making API requests, and interacting with AI agents directly from the terminal.

## Production Build

To build your application for deployment, use the `start` command.

```bash
bun run start
```

This command orchestrates a production-ready build process:

1.  **Compilation & Bundling**: Compiles all `.webs` components and bundles all client-side JavaScript and CSS into optimized, minified files. Filenames are hashed to ensure proper cache invalidation.
2.  **Offline Support**: Generates a Service Worker that automatically caches all application assets. This enables the application to be fully functional even when the user is offline.
3.  **Production Server**: Launches a performant web server configured to serve the production assets.

The output of the build process is placed in the `/dist` directory, which can be deployed to any static hosting provider or run on your own server.

## Command-Line Interface Reference

The `webs` CLI is your toolkit for managing, analyzing, and deploying your application.

### Core Commands

- `webs dev`
  Starts the development server and interactive shell.

- `webs start`
  Builds the application for production and starts the production server.

### Project Analysis & Inspection

- `webs inspect`
  Scans the project and prints a detailed report of all discovered pages, API routes, reusable UI components, and AI agents. Essential for understanding the application's surface area.

- `webs analyze`
  Executes the project's test suite via Bun's test runner and performs a TypeScript type check, providing a consolidated analysis report.

- `webs grep <pattern>`
  Performs a recursive search for a text pattern within the project's source files.

### Documentation & AI Context

- `webs docs`
  Parses all JSDoc comments within the source code and generates a structured `api-docs.json` file, useful for building automated API documentation.

- `webs lock`
  Creates a `webs.lock.txt` file in the project root. This file contains a complete snapshot of your project's file structure and the full source code of every file. It is an invaluable tool for providing complete and accurate context to a Large Language Model (LLM) for debugging, analysis, or feature development.
