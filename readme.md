# Webs

An Internet Framework.

## Core Concepts

### 1. Components (`.webs` files)

Components are the building blocks of a Webs application. They are single files that contain their own logic, markup, and styles, making them highly portable and easy to understand.

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
    @apply bg-blue-500 text-white font-bold py-2 px-4 rounded;
  }
</style>
```

To use a component inside another, import it and register it in the `components` object.

```html
<!-- src/app/index.webs -->
<script>
  import Counter from "../gui/counter.webs";
  export default {
    components: {
      "my-counter": Counter,
    },
  };
</script>

<template>
  <my-counter />
</template>
```

### 2. File-Based Routing & Layouts

Webs uses the file system to define routes. Any `.webs` file inside `src/app` becomes a page, with support for dynamic segments and catch-all routes.

- `src/app/index.webs` → `/`
- `src/app/users/[username].webs` → `/users/:username`
- `src/app/files/[...path].webs` → `/files/*` (catch-all)

Shared layouts are created with a `layout.webs` file, which automatically wraps all pages in its directory and subdirectories. Page content is rendered inside the `<slot>` element.

### 3. Template Syntax

Webs uses a Svelte-inspired template syntax for its simplicity and power.

- **Interpolation**: `{{ expression }}`
- **Attribute Binding**: `:href="expression"` or `:href="{ `...` }"` for complex expressions.
- **Event Handling**: `@click="handler"`
- **Conditionals**: `{#if ...}`, `{:else if ...}`, `{:else}`
- **Lists**: `{#each items as item (item.id)}` with a unique key for efficient updates.

## Local-First Data & Sync

Webs is designed from the ground up for building local-first, offline-capable applications.

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

### 2. The `table` Hook

The `table` hook is your primary tool for interacting with local data on the client. It provides a reactive state object that is automatically updated when the underlying data changes, whether from a local modification or a sync event from the server.

```javascript
import { table } from "@conradklek/webs";

export default {
  setup(props) {
    // Initializes with server-prefetched data and subscribes to real-time updates.
    const todos = table("todos", props.initialState?.initialTodos);

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

## Server Interaction & Data Fetching

### 1. Resilient Actions with `request`

For operations that need to be resilient to network failures, Webs provides a powerful `request` utility. It wraps any `async` function and allows you to chain combinators like `.retry()` to define its execution strategy.

```javascript
import { request } from "@conradklek/webs";

export default {
  actions: {
    // This action will be retried up to 2 times if it fails.
    prefetch: request(async ({ db, user }) => {
      // ... fetch data
    }).retry(2),

    // Another resilient action.
    create: request(async ({ fs }, name) => {
      // ... create a file
    }).retry(3),
  },
  //...
};
```

### 2. The `prefetch` Action

The `prefetch` action is a special, reserved name. It's used to fetch the essential data a page needs before it's rendered. It runs on the server for the initial page load and on the client during client-side navigation, ensuring your components always have the data they need.

```javascript
// src/app/todos.webs
import { request } from "@conradklek/webs";

export default {
  actions: {
    prefetch: request(async ({ db, user }) => {
      if (!user) throw new Error("Permission Denied");
      const todos = db
        .query("SELECT * FROM todos WHERE user_id = ?")
        .all(user.id);
      return { initialTodos: todos };
    }).retry(2),
  },
  // ...
};
```

### 3. Client-Side Actions

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

### 4. File Uploads

The framework includes a dedicated, streaming endpoint for file uploads at `/api/fs/*`. Files are written directly to the user's filesystem space and the changes are broadcast to all clients in real-time.

```html
<input type="file" @change="handleFileUpload" />
```

```javascript
async function handleFileUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  // Stream the file to the server.
  const response = await fetch(`/api/fs/path/to/${file.name}`, {
    method: "PUT",
    body: file,
  });
  // The UI will update automatically via the sync engine.
}
```
