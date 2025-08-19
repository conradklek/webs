# webs.js

A JavaScript framework.

---

## Philosophy

The design of Webs is dictated by a single, foundational principle: the initial congestion window of a TCP connection. A payload exceeding approximately 14kB necessitates an additional network round trip, introducing significant, avoidable latency.

Webs is therefore engineered from the ground up to ensure that the critical-path assets of an application remain well within this\*sub-14kB threshold\*\*. By adhering to this directive, we facilitate a near-instantaneous initial render, providing a user experience that is not merely fast, but fundamentally more efficient at the transport layer.

---

## Getting Started

The best way to start a new Webs project is by using the official scaffolding tool.

```bash
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

### 1. File-Based Routing

Routing in Webs is simple and intuitive. The framework automatically maps files in the `src/app` directory to URL routes. These files are your "page" components.

- `src/app/index.js` → `/`
- `src/app/about.js` → `/about`
- `src/app/profile.js` → `/profile`

To navigate between pages, use standard `<a>` tags. The Webs router intercepts these clicks to provide a fast, single-page application experience without full page reloads.

### 2. Components

Components are the heart of a Webs application. They are plain JavaScript objects that encapsulate their own state, logic, and markup. Every component is the default export from a `.js` file.

#### Basic Definition

A component is defined by a few key properties:

- `name`: A unique string identifier for the component.
- `state()`: A function that returns an object of reactive data.
- `methods`: An object containing functions that can be called from the template.
- `template`: An HTML string that defines the component's structure.

```javascript
// src/app/counter.js
export default {
  name: "Counter",
  state() {
    return {
      count: 0,
    };
  },
  methods: {
    increment() {
      this.count++;
    },
  },
  template: `
  <div>
    <p>Count: {{ count }}</p>
    <button type="button" @click="increment">Increment</button>
  </div>
`,
};
```

#### Props

Props allow you to pass data from a parent component to a child. You can define them with types and default values.

```javascript
// src/components/Greeting.js
export default {
  name: "Greeting",
  props: {
    name: {
      type: String,
      default: "World",
    },
  },
  template: `<p>Hello, {{ name }}!</p>`,
};
```

#### Registering Child Components

To use a component within another, you must import it and register it in the `components` object. This makes the child component's tag available in the parent's template.

```javascript
// src/app/index.js
import Greeting from "../components/Greeting.js";

export default {
  name: "HomePage",
  components: {
    Greeting,
  },
  template: `
  <div>
    <Greeting name="Alice" />
    <Greeting />
  </div>
`,
};
```

#### Slots & Content Projection

To pass content _into_ a component, use the `<slot>` tag. Any child elements you place inside your custom component tag in the parent will be rendered where the `<slot>` tag is.

```javascript
// src/components/Wrapper.js
export default {
  name: "Wrapper",
  template: `
  <div class="wrapper">
    <slot></slot>
  </div>`;
}

// src/app/index.js
import Wrapper from '../components/Wrapper.js';

export default {
  name: "HomePage",
  components: { Wrapper },
  template: `
  <Wrapper>
    <p>This content will be placed inside the wrapper.</p>
  </Wrapper>`;
}
```

## Backend & Data

### 3. Database & Migrations

Webs includes a simple but powerful system for managing an SQLite database. All configuration happens in `src/sql.js`, where you define your database name and an array of migrations.

Migrations are versioned changes to your schema. When the server starts, Webs automatically applies any new migrations, ensuring your database is always in sync with your code.

```javascript
// src/sql.js
export default {
  name: "app.db",
  migrations: [
    {
      version: 1,
      name: "initial_auth_schema",
      up: (db) => {
        db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );
`);
      },
    },
  ],
};
```

### 4. Server Actions & Filesystem API

Server Actions are a key feature of Webs. They allow you to define functions inside your components that\*only run on the server\*\*. This makes it incredibly easy to perform secure operations like database queries or filesystem access without building a separate API.

When you call a Server Action from the client, Webs handles the secure communication. These actions receive a `context` object with access to `db`, the authenticated `user`, the `fs` API, and more.

The\*Filesystem API\*\* (`fs`) provides a convenient, promise-based way to interact with the server's file system directly within a Server Action.

```javascript
// src/app/files.js
export default {
  name: "Files",
  actions: {
    async read_notes(context) {
      const { fs, db } = context; // Safely access server resources
      // Read a user-specific file from the server
      const notes = await fs.cat(`./user_data/${user.id}/notes.txt`).text();
      return { notes };
    },
  },
};
```

### 5. Authentication & Middleware

Webs comes with a complete, cookie-based authentication system and automatically provides secure API endpoints for user registration, login, and logout.

To protect routes or run code before a page is rendered, you use\*middleware\*\*. A middleware is a function that intercepts a navigation request. You can use it to check if a user is logged in and redirect them if they aren't. To apply middleware, you export a `middleware` array from a component file.

```javascript
// src/app/profile.js
import { use_logger } from "../use/logger.js";
import { use_auth } from "../use/auth.js";

// Middleware runs in order: first the logger, then the auth check.
export const middleware = [use_logger, use_auth];

export default {
  name: "Profile",
  // ... component definition
};
```

---

## Frontend

### 6. Template Syntax

Webs templates are standard HTML supercharged with a simple syntax for data binding and event handling.

-\*Text Interpolation\*\*: Use mustaches `{{ }}` to display reactive state.

```html
<p>Welcome, {{ username }}!</p>
```

-\*Event Handling\*\*: Use the `@` symbol to listen for DOM events.

```html
<button type="button" @click="increment">Click me</button>
```

- -\*Attribute Binding\*\*: Use the `:` shorthand to bind state to attributes. This is now more powerful than ever.

```html
<img :src="user_image" />
```

**Attribute Fallthrough**

Any attribute you pass to a component that isnot\* a declared prop will automatically be applied to the root element of that component's template. This makes creating wrapper components incredibly clean.

```html
<!-- If you write this: -->
<CustomInput class="mt-4" data-testid="name-input" />

<!-- And CustomInput's template is: -->
<!-- <input class="input" :value="value" /> -->

<!-- The final rendered output will be: -->
<input class="input mt-4" data-testid="name-input" value="..." />
```

**Declarative Class Binding**

The `:class` binding is supercharged. You can pass it an object to conditionally toggle classes, or an array to mix and match dynamic and static classes.

```html
<!-- Object Syntax -->
<div :class="{ 'active': isActive, 'text-danger': hasError }"></div>

<!-- Array Syntax -->
<div :class="[baseClass, { 'active': isActive }]"></div>
```

### 7. Styling with Tailwind CSS

Webs has a deep, native integration with the\*Tailwind CSS v4 engine\*\*. You can write component-scoped styles directly in a `styles` property. This block gives you access to the full power of Tailwind, including `@theme` for defining design tokens and `@apply` for creating reusable component classes.

Of course, you can also use standard Tailwind utility classes directly in your template for rapid development.

```javascript
// src/components/custom-button.js
export default {
  name: "CustomButton",
  styles: `
  @theme {
    --color-brand: oklch(0.84 0.18 117.33);
  }
  .btn-brand {
    @apply bg-brand text-white font-bold py-2 px-4 rounded;
  }
`,
  template: `<button type="button" class="btn-brand">Click Me</button>`,
};
```

---

## License

MIT
