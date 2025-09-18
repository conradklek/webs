# Webs: A Web Framework

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Webs is a full-stack JavaScript framework for a new generation of applications: software that is **fast, offline-capable, and intelligent by default**. It is built on an elegant local-first architecture that seamlessly synchronizes a client-side database with the server, providing an instantaneous user experience without loading spinners or network latency.

---

## The Architecture: Three Pillars of Modern Development

Webs is built on three foundational pillars that work in concert to provide a uniquely powerful developer experience.

### 1. The Local-First Sync Engine: Instant & Offline

The cornerstone of a Webs application is its data layer. We treat the user's device as the primary data source, using a client-side IndexedDB database as the single source of truth for the UI.

- **Zero-Latency UI:** All database operations (`put`, `delete`) happen _instantly_ on the client. The UI is not waiting for a server roundtrip.
- **Automatic Synchronization:** Changes are written to a local `outbox` table and seamlessly synchronized to the server in the background via WebSockets when a connection is available.
- **Effortless Offline Support:** Because the application is reading and writing locally, it continues to function perfectly when the user is offline. When the connection is restored, the sync engine sends all pending changes automatically.
- **Real-Time Collaboration:** The server broadcasts changes to all connected clients, ensuring data is kept in sync across a user's devices or between collaborating users in real-time.

This robust architecture makes your application resilient and incredibly fast by default.

### 2. The Integrated AI Suite: Context is Everything

Webs treats artificial intelligence as a first-class citizen, not an afterthought. It provides a complete, server-side suite for building applications with deep contextual understanding.

- **Automated RAG Pipeline:** The framework's most powerful feature. The server-side File System API is deeply integrated with the AI's vector store. When a user's file is written or synchronized, it's automatically chunked, converted to vector embeddings, and indexed. This turns the user's file system into a searchable, personal knowledge base with zero configuration.
- **Tool-Using Agents:** Define powerful AI agents in simple `.agent.webs` files. Equip them with tools (server-side functions) that can interact with the database or file system. The framework handles the entire tool-use loop, streaming text, tool calls, and results back to the client in real-time.
- **Persistent Conversations:** Build stateful, multi-device chat experiences with a single hook. Conversations are automatically persisted to the local database and synced, allowing a user to continue their chat seamlessly on any device.

### 3. The Developer Experience: Simple & Powerful

Webs is designed to make you productive. It combines the simplicity of file-based conventions with a powerful, modern reactivity system.

- **File-Based Everything:** Routes, layouts, components, and even AI agents are defined by the structure of your `src` directory. No complex configuration files.
- **Single-File Components:** `.webs` files encapsulate template, logic, and style in a familiar and organized way.
- **Composable UI Modules:** A unique pattern for creating complex, reusable UI elements like accordions or menus. A single `.webs` file can export multiple component definitions, using `provide` and `inject` to manage state elegantly.

---

## Core Concepts: The Webs Way

Get started with Webs by understanding its core patterns, from the simplest page to complex, stateful components.

### 1. Your First Page

The simplest Webs page is a file with just a `<template>` block. Create `src/app/index.webs`, and you have a homepage.

```html
<!-- src/app/index.webs -->
<template>
  <h1>Hello, Webs!</h1>
  <p>This is a static page rendered on the server.</p>
</template>
```

### 2. Adding State

To add interactivity, add a `<script type="module">` block and a `setup` function. The `setup` function is the heart of your component's logic. Return any state or functions from `setup` to make them available in your template.

```html
<!-- src/app/counter.webs -->
<script type="module">
  import { state } from '@conradklek/webs';

  export default {
    setup() {
      const count = state(0);
      function increment() {
        count.value++;
      }
      return { count, increment };
    },
  };
</script>

<template>
  <button type="button" @click="increment">Count is: {{ count }}</button>
</template>
```

### 3. Routing & Layouts

Webs uses a file-based router.

- `src/app/index.webs` -> `/`
- `src/app/about.webs` -> `/about`

Create a `layout.webs` file to define a shared UI structure. The page content will be rendered inside the `<slot>` element.

```html
<!-- src/app/layout.webs -->
<template>
  <div class="w-full min-h-screen p-6">
    <header class="w-full pb-8">
      <!-- You can place global components like a navbar here -->
    </header>
    <main class="w-full flex-1">
      <slot></slot>
    </main>
  </div>
</template>
```

### 4. Building Reusable Components

The most powerful pattern in Webs is creating **UI Modules**. A single `.webs` file can define and export a complete, self-contained UI element with multiple parts. This is the recommended way to build your UI library in `src/gui`.

This pattern uses `provide` to send data and functions down the component tree, and `inject` for child components to receive them.

**Example: A Reusable Accordion (`src/gui/accordion.webs`)**

```html
<script type="module">
  import { provide, inject, state, computed } from '@conradklek/webs';

  // 1. Export named constants for each part of the component.
  export const AccordionItem = {
    name: 'accordion-item',
    props: { value: { type: String, required: true } },
    setup(props) {
      // Provide the item's unique value to its children
      provide('itemValue', props.value);
    },
    // The template can be a simple string...
    template: `<div class="w-full flex flex-col"><slot></slot></div>`,
  };

  export const AccordionTrigger = {
    name: 'accordion-trigger',
    setup() {
      // Inject the main accordion's logic and this item's value
      const accordion = inject('accordion');
      const value = inject('itemValue');
      return {
        toggle: () => accordion.toggle(value),
        isOpen: computed(() => accordion.openItems.has(value)),
      };
    },
    // ...or a function that receives a tagged template literal helper.
    template(html) {
      return html`
        <button @click="toggle" :aria-expanded="isOpen">
          <slot></slot>
        </button>
      `;
    },
  };

  export const AccordionContent = {
    name: 'accordion-content',
    setup() {
      const accordion = inject('accordion');
      const value = inject('itemValue');
      const isOpen = computed(() => accordion.openItems.has(value));
      return { isOpen };
    },
    template(html) {
      return html`
        {#if isOpen}
        <div class="pb-3 pt-1"><slot></slot></div>
        {/if}
      `;
    },
  };

  // 2. The default export is the main controller component.
  export default {
    name: 'accordion',
    components: {
      // 3. Locally register the sub-components.
      'accordion-item': AccordionItem,
      'accordion-trigger': AccordionTrigger,
      'accordion-content': AccordionContent,
    },
    props: {
      type: { default: 'single' }, // 'single' or 'multiple'
      collapsible: { default: false },
    },
    setup(props) {
      const openItems = state(new Set());

      function toggle(value) {
        // ...logic to open/close items based on props.type...
      }

      // 4. Provide state and methods to all descendant components.
      provide('accordion', { openItems, toggle });
    },
    template: `<div class="w-full"><slot></slot></div>`,
  };
</script>
```

**Using the Accordion Component:**

Now, any other component can use this entire suite of components as if they were built-in HTML tags.

```html
<template>
  <accordion type="single" collapsible>
    <accordion-item value="item-1">
      <accordion-trigger>What is Webs?</accordion-trigger>
      <accordion-content>A local-first AI framework.</accordion-content>
    </accordion-item>
    <accordion-item value="item-2">
      <accordion-trigger>Is it fast?</accordion-trigger>
      <accordion-content
        >Yes, it's designed for zero-latency UI.</accordion-content
      >
    </accordion-item>
  </accordion>
</template>
```

---

## Complete API Reference

### Reactivity Primitives

- **`state(initialValue)`**: Returns a reactive version of a value. Use `.value` for primitives, or access properties directly for objects/arrays.
- **`ref(initialValue)`**: Explicitly creates a `Ref` object with a `.value` property. Identical to `state()` for primitives.
- **`computed(getterFn)`**: Creates a cached, read-only `Ref` based on other reactive state.
- **`effect(sourceFn, callbackFn?)`**: Reactively runs side effects in response to state changes.

### Component Lifecycle Hooks

Import these from `@conradklek/webs` and call them inside your `setup` function.

- **`onMounted(callback)`**: Called after the component has been inserted into the DOM.
- **`onUnmounted(callback)`**: Called just before the component is removed from the DOM.
- **`onBeforeUpdate(callback)`**: Called right before the component re-renders due to a state change.
- **`onUpdated(callback)`**: Called after the component has re-rendered.

### Client-Side Hooks (Composables)

- **`table(tableName)`**: Get a reactive, auto-updating connection to a synchronized database table.
- **`action(actionName)`**: Call a server-side function defined in a component's `actions` object.
- **`useConversation(channel)`**: Create or join a persistent, real-time chat.
- **`useAgent(agentName)`**: Run a server-defined AI agent and stream its responses and tool calls.

### The `.webs` File Anatomy

A complete breakdown of a composable `.webs` component.

- **`<script type="module">`**: Contains all JavaScript logic.
  - **`export default { ... }`**: The main component definition.
    - **`name`**: The component's name (used for debugging).
    - **`components: { ... }`**: Locally register imported components.
    - **`props: { ... }`**: Define the component's public properties.
    - **`setup(props, context)`**: The composition API function where you define state and logic.
    - **`actions: { ... }`**: Define server-side functions. The special `prefetch` action runs before SSR.
    - **`template`**: A string or template literal `html` function (for IDE syntax highlighting) defining the component's structure.
  - **`export const SubComponent = { ... }`**: Optionally export named sub-components to create a UI Module.
- **`<template>`**: Contains the component's HTML structure, including template syntax like `{{ expression }}`, `{#if ...}`, and `{#each ...}`.
- **`<style>`**: Contains component-scoped CSS.

---

### Powerful CLI

- `bun run dev`: Starts the development server with HMR.
- `bun run start`: Builds the project and starts the production server.
- `bun run inspect`: Displays a report of all registered routes, components, and AI agents.
- `bun run shell`: Connects to a running dev server for interactive requests.
- `bun run grep <pattern>`: Searches for a pattern within the project source.
- `bun run analyze`: Runs tests and type analysis, providing a summary report.
- `bun run lock`: Creates a `webs.lock.txt` file containing project structure, source code, and analysis reports, perfect for providing context to an LLM.
- `bun run ai`: Starts an interactive AI session for your project (embedding, querying, chatting).
