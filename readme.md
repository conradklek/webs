# Webs

An Internet Framework.

## Core Concepts

### Components (`.webs` files)

```html
<!-- src/gui/counter.webs -->
<script>
  import { state } from "@conradklek/webs";

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
  <div>
    <p>Count: {{ count }}</p>
    <button type="button" @click="increment">Increment</button>
  </div>
</template>

<style>
  button {
    @apply bg-blue-500 text-white py-1.5 px-3 rounded active:opacity-50 cursor-pointer;
  }
</style>
```

### File-Based Routing & Layouts

Webs uses the file system to define routes. Any `.webs` file inside `src/app` becomes a page, with support for dynamic segments and catch-all routes.

- `src/app/index.webs` → `/`
- `src/app/users/[username].webs` → `/users/:username`
- `src/app/files/[...path].webs` → `/files/*` (catch-all)

Shared layouts are created with a `layout.webs` file, which automatically wraps all pages in its directory and subdirectories. Page content is rendered inside the `<slot>` element.

### Template Syntax

- **Interpolation**: `{{ expression }}`
- **Attribute Binding**: `:href="expression"`
- **Event Handling**: `@click="handler"`
- **Conditionals**: `{#if ...}`, `{:else if ...}`, `{:else}`
- **Lists**: `{#each items as item (item.id)}`

## Local-First Data & Sync

### 1. Data Schemas in Components

Define your database schemas directly within the components that use them. Tables marked with `sync: true` are automatically kept in sync between the server (SQLite), the client (IndexedDB), and all connected peers in real-time.

```html
<!-- src/gui/todo-list.webs -->
<script>
  export default {
    tables: {
      todos: {
        sync: true, // This is the magic!
        keyPath: "id",
        fields: {
          id: { type: "text", primaryKey: true },
          user_id: { type: "integer", notNull: true, references: "users(id)" },
          content: { type: "text", notNull: true },
          completed: { type: "boolean", default: 0 },
        },
      },
    },
    // ...
  };
</script>
```

### 2. The `useTable` Hook

The `useTable` hook is your primary tool for interacting with local data on the client. It provides a reactive state object that is automatically updated when the underlying data changes, whether from a local modification or a sync event from the server.

```javascript
import { useTable } from "@conradklek/webs";

export default {
  setup(props) {
    // Initializes with server-prefetched data and subscribes to real-time updates.
    const todos = useTable("todos", props.initialState?.initialTodos);

    return { todos: todos.state };
  },
};
```

### 3. Local-First Filesystem

Webs includes a built-in filesystem abstraction for handling user files with the same local-first principles. The `fs` utility provides a simple API for reading, writing, and listing files, which are automatically synced.

```javascript
import { fs, onReady, watch } from "@conradklek/webs";

export default {
  setup(props) {
    // `use` subscribes to a file's content, keeping it reactive.
    const file = fs(props.filePath).use(props.initialContent);

    // Save changes after a brief delay.
    let saveTimeout;
    function onInput(event) {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => {
        file.write(event.target.value); // Writes to local DB, queues for sync.
      }, 300);
    }

    return { file, onInput };
  },
};
```

### Client-Side Actions

To call a server action from your component, use the `action` helper. It provides a `call` function and a reactive `state` object (`{ data, error, isLoading }`) to easily manage UI feedback.

```javascript
// In a component's setup function
import { action } from "@conradklek/webs";

const createItem = action("create");

async function handleCreate() {
  await createItem.call("new-file.txt");
  if (createItem.state.error) {
    // Handle error
  }
}
```
