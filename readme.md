# Webs.js

An Internet Framework.

## Core Concepts

### 1. Components (`.webs` files)

Components are the building blocks of a Webs application. They live in `.webs` files and use a simple structure of `<script>`, `<template>`, and `<style>` blocks.

The `<script>` block exports a default object that defines the component's logic. The `setup` function is the entry point for the component's composition API.

```html
<!-- src/gui/counter.webs -->
<script>
  import { state } from "@conradklek/webs";

  export default {
    name: "Counter",
    setup() {
      const count = state(0);

      function increment() {
        count.value++; // Access .value for refs
      }

      return {
        count,
        increment,
      };
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

### 2. File-Based Routing

Webs uses the file system to define routes. Any `.webs` file inside `src/app` becomes a page.

- `src/app/index.webs` → `/`
- `src/app/about.webs` → `/about`
- `src/app/users/[id].webs` → `/users/:id`

To navigate, just use standard `<a>` tags. The Webs router automatically intercepts clicks to provide a fast, SPA-like experience.

### 3. Layouts

To create a shared layout (e.g., with a header and footer), create a `layout.webs` file in a directory. It will automatically wrap all page components in that directory and its subdirectories. The page content is injected via the `<slot>` element.

```html
<!-- src/app/layout.webs -->
<template>
  <div class="app-container">
    <header>My App</header>
    <main>
      <slot></slot>
    </main>
    <footer>Copyright 2025</footer>
  </div>
</template>
```

## Data & Backend

Webs' most powerful feature is its integrated, offline-first data layer.

### 1. Defining Data Schemas

You can define your database table schemas directly inside the components that use them. Webs reads these definitions at build time, creates the necessary tables in SQLite, and sets up real-time synchronization.

A table with `sync: true` will be automatically synchronized between the server and all connected clients.

```html
<!-- src/gui/todo-list.webs -->
<script>
  export default {
    tables: {
      todos: {
        sync: true, // This enables real-time, offline-first sync!
        keyPath: "id",
        fields: {
          id: { type: "text", primaryKey: true },
          user_id: { type: "integer", notNull: true, references: "users(id)" },
          content: { type: "text", notNull: true },
          completed: { type: "boolean", default: 0 },
          created_at: { type: "timestamp", default: "CURRENT_TIMESTAMP" },
        },
      },
    },
    // ... component logic
  };
</script>
```

### 2. The `useTable` Hook

To interact with a synced table, use the `useTable` hook. It provides a reactive state object and methods to optimistically update the UI. Changes are automatically queued and synced with the server when online.

```javascript
import { state, useTable, session } from "@conradklek/webs";

export default {
  // ...
  setup(props) {
    const newTodoContent = state("");
    const todos = useTable("todos", props.initialState?.initialTodos || []);

    function addTodo() {
      const newTodoItem = {
        id: crypto.randomUUID(),
        content: newTodoContent.value,
        user_id: session.user.id,
        // ... other fields
      };
      // Optimistically updates UI and queues for server sync
      todos.put(newTodoItem);
      newTodoContent.value = "";
    }

    return { todos: todos.state, addTodo };
  },
};
```

### 3. Server Actions & Data Fetching

To run secure code on the server, define functions in the `actions` object of a page component. The special `ssrFetch` action is used to fetch data during server-side rendering, which is then passed as the `initialState` prop.

```javascript
// src/app/todos.webs
export default {
  actions: {
    async ssrFetch({ db, user }) {
      if (!user) return { initialTodos: [] };
      const todos = db
        .query("SELECT * FROM todos WHERE user_id = ?")
        .all(user.id);
      return { initialTodos: todos };
    },
  },
  // ...
};
```

To call other actions from the client, use the `action` hook.

```javascript
// In a component's setup function
const { call: myAction, state: actionState } = action("someOtherAction");

myAction("some-argument");
```

### 4. Authentication

Webs provides built-in API endpoints for auth:

- `/api/auth/register`
- `/api/auth/login`
- `/api/auth/logout`

On the client, use the globally available `session` store to manage authentication state and call these endpoints.

```javascript
import { session } from "@conradklek/webs";

// Check if user is logged in
if (session.isLoggedIn) {
  console.log(session.user);
}

// Log a user in
await session.login("user@example.com", "password");

// Log out
await session.logout();
```

---

## License

MIT
