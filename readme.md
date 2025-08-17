# webs.js

A JavaScript framework.

---

## Philosophy

The design of webs.js is dictated by a single, foundational principle: the initial congestion window of a TCP connection. A payload exceeding approximately 14kB necessitates an additional network round trip, introducing significant, avoidable latency.

Webs is therefore engineered from the ground up to ensure that the critical-path assets of an application remain well within this 14kB threshold. By adhering to this directive, we facilitate a near-instantaneous initial render, providing a user experience that is not merely fast, but fundamentally more efficient at the transport layer.

**Performance is not a feature, but a prerequisite.**

---

## Features

- **Sub-14kB Footprint**: A minimal gzipped footprint, engineered for near-instant loads.
- **Server-Side Rendering (SSR)**: Pre-renders pages on the server for fast initial loads and excellent SEO, then seamlessly hydrates into a full SPA.
- **Component-Based**: Build your UI with simple, object-based components that encapsulate state, logic, and markup.
- **Integrated Tooling**: A zero-configuration dev server with HMR, asset bundling, and more.
- **Tailwind CSS v4 Engine**: Deep, component-scoped integration with the next generation of Tailwind CSS.
- **Server Actions**: Securely call server-side logic directly from your client-side components.
- **Built-in Database**: Includes a ready-to-use SQLite database layer with a simple migration system.
- **Authentication**: Comes with helpers and API endpoints for session management and user authentication out of the box.
- **File-based Routing**: Intuitive routing that maps files in your `src/app` directory to URL routes.

---

## Getting Started

The best way to start a new Webs project is by using the official scaffolding tool.

```bash
# Create a new project
bunx create-webs-app my-project

# Navigate into your project
cd my-project

# Install dependencies
bun install

# Start the development server
bun run dev
```

Your new site is now running at `http://localhost:3000`!

---

## Core Concepts

### Components

A component is a plain JavaScript object with `name`, `state`, `methods`, and a `template`.

**`src/app/index.js`**

```javascript
export default {
  name: "Home",
  // State is a function that returns a reactive object.
  state: () => ({
    count: 0,
  }),
  // Methods have `this` bound to the component's context.
  methods: {
    increment() {
      this.count++;
    },
  },
  // Write your HTML directly in a template string.
  template: `
    <div>
      <h1>Welcome to Webs!</h1>
      <button @click="increment">
        Clicked {{ count }} time{{ count === 1 ? '' : 's' }}
      </button>
    </div>
  `,
};
```

### Template Syntax

The template compiler supports familiar directives for creating dynamic views:

- **Text Interpolation**: `{{ count }}`
- **Attribute Binding**: `:disabled="isDisabled"`
- **Event Binding**: `@click="increment"`
- **Two-Way Binding**: `w-model="email"`
- **Conditionals**: `w-if="..."` and `w-else`

### Global State Management

For shared state, Webs provides a `create_store` utility.

**`src/use/session.js`**

```javascript
import { create_store } from "@conradklek/webs";

export const use_session = create_store({
  state: () => ({
    user: null,
    error: null,
  }),
  getters: {
    is_logged_in() {
      return !!this.user;
    },
  },
  actions: {
    async login(email, password) {
      // ... implementation calls /api/auth/login
    },
    // ... other actions
  },
});
```

### Database & Migrations

Define your database schema and migrations in a simple configuration file.

**`src/sql.js`**

```javascript
export default {
  name: "app.db", // Your SQLite database file
  migrations: [
    {
      version: 1,
      name: "initial_auth_schema",
      up: (db) => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
          );
        `);
      },
    },
  ],
};
```

---

## License

MIT
