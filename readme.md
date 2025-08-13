# webs.js

A JavaScript Framework.

## Philosophy

The webs.js framework is predicated on a foundational principle of radical efficiency. Our methodology is informed by a critical understanding of network protocols, specifically the mechanics of TCP slow start. As detailed in the seminal article, ["Why your website should be under 14kB in size"](https://endtimes.dev/why-your-website-should-be-under-14kb-in-size/), the initial congestion window of a TCP connection is typically limited to 10 packets.

This constraint dictates that a payload exceeding approximately 14kB necessitates an additional round trip, introducing significant, avoidable latency. The webs.js framework is therefore engineered from first principles to ensure that the critical-path assets of an application remain well within this 14kB threshold. By adhering to this directive, we facilitate a near-instantaneous initial render, providing a user experience that is not merely fast, but fundamentally more efficient at the transport layer. This is our core tenet: performance is not a feature, but a prerequisite.

## Features

- **Performance:** A sub-14kb gzipped footprint, engineered for near-instant initial loads in accordance with TCP slow start principles.
- **Server-Side Rendering (SSR):** Renders pages on the server for optimal SEO and perceived performance.
- **Client-Side Hydration:** Seamlessly takes over on the client for a rich, interactive experience.
- **Built-in Reactivity:** A simple, powerful reactivity system (reactive, computed) inspired by the best.
- **Integrated Database:** Comes with a ready-to-use SQLite database layer with a built-in migration system.
- **Authentication Included:** Helpers for session management and user authentication out of the box.
- **File-based Routing:** Simple and intuitive routing based on your file structure.
- **All-in-One Tooling:** Includes a dev server, HMR, asset bundling with Tailwind CSS, and more, with zero configuration.

## Tutorial

The best way to start a new `webs` project is by using the official scaffolding tool.

```bash
# Create a new project
npx create-webs-app my-awesome-project

# Navigate into your project
cd my-awesome-project

# Install dependencies
bun install

# Start the development server
bun run dev
```

Your new site is now running at `http://localhost:3000`!

---

## Concepts

`webs` uses a simple, object-based component syntax that will feel familiar and intuitive.

### Components

A component is a plain JavaScript object with `name`, `state`, `methods`, and a `template`.

**`src/app/index.js`**
```javascript
import { use_session } from "../use/session.js";

export default {
  name: "Home",
  // State is a function that returns a reactive object.
  state: () => ({
    count: 0,
  }),
  // Methods have `this` bound to the component's state.
  methods: {
    increment() {
      this.count++;
    },
  },
  // Write your HTML directly in a template string.
  template: `
    <div>
      <h1>Home Page</h1>
      <button @click="increment">
        Clicked {{ count }} time{{ count === 1 ? '' : 's' }}
      </button>
    </div>
  `,
};
```

### Template Syntax

The template compiler supports familiar directives:
- **Interpolation**: `{{ count }}`
- **Event Binding**: `@click="increment"`
- **Two-Way Binding**: `w-model="email"`
- **Conditionals**: `w-if="..."` and `w-else`

### State Management

For shared state, `webs` provides a `create_store` utility.

**`src/use/session.js`**
```javascript
import { create_store } from "webs/store.js";

export const use_session = create_store({
  state: () => ({
    current_user: null,
    auth_error: null,
  }),
  getters: {
    is_logged_in() {
      return !!this.current_user;
    },
  },
  actions: {
    async login(email, password) {
      // ... implementation
    },
    async logout() {
      // ... implementation
    }
  },
});
```

This store can then be imported and used in any component.

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

MIT License. See the `LICENSE` file for details.

