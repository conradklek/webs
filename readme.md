# webs.js

A JavaScript framework.

---

## Philosophy

The design of Webs is dictated by a single, foundational principle: the initial congestion window of a TCP connection. A payload exceeding approximately 14kB necessitates an additional network round trip, introducing significant, avoidable latency.

Webs is therefore engineered from the ground up to ensure that the critical-path assets of an application remain well within this **sub-14kB threshold**. By adhering to this directive, we facilitate a near-instantaneous initial render, providing a user experience that is not merely fast, but fundamentally more efficient at the transport layer.

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
    </div>
  `
}

// src/app/index.js
import Wrapper from '../components/Wrapper.js';
export default {
  name: "HomePage",
  components: { Wrapper },
  template: `
    <Wrapper>
      <p>This content will be placed inside the wrapper.</p>
    </Wrapper>
  `
}
```

#### Composable Components: The Card Example

A powerful pattern in Webs is creating small, composable components that work together. The `Card` component is a perfect example. It's built from several smaller pieces (`CardHeader`, `CardTitle`, `CardContent`, etc.) that are bundled together.

Here's how you would define the main `Card` component, which registers all its sub-components:

```javascript
// src/components/card/index.js
import Card from "./card.js";
import CardHeader from "./card-header.js";
import CardTitle from "./card-title.js";
import CardDescription from "./card-description.js";
import CardContent from "./card-content.js";
import CardFooter from "./card-footer.js";

export default {
  ...Card, // Spreads the base Card styles and template
  name: "Card",
  components: {
    CardHeader,
    CardTitle,
    CardDescription,
    CardContent,
    CardFooter,
  },
};
```

Now, when you use the `Card` component in a page, you have access to all the sub-component tags within its template, allowing for clean, semantic markup:

```javascript
// src/app/index.js
import Card from "../components/card/index.js";
import Button from "../components/Button.js";

export default {
  name: "Dashboard",
  components: {
    Card,
    Button,
  },
  template: `
    <Card>
      <CardHeader>
        <CardTitle>Create project</CardTitle>
        <CardDescription>Deploy your new project in one-click.</CardDescription>
      </CardHeader>
      <CardContent>
        <p>This is the main content area of the card. You can place forms, text, or other components here.</p>
      </CardContent>
      <CardFooter>
        <Button variant="outline">Cancel</Button>
        <Button class="ml-auto">Deploy</Button>
      </CardFooter>
    </Card>
  `,
};
```

#### Fallthrough Attributes

Any attributes you add to a component tag that are not declared as props (like `class`, `id`, or `type`) will be automatically passed down to the root element of that component's template. This makes it easy to work with standard HTML attributes.

### 3. Server-Side Rendering (SSR) & Hydration

Webs is a "universal" framework, running your code on both the server and the client.

1.  **SSR**: When you first visit a page, the server renders the complete HTML and sends it to your browser. This means you see content immediately, which is great for performance and SEO.
2.  **Hydration**: After the initial HTML is loaded, the client-side JavaScript takes over. It "hydrates" the static markup by attaching event listeners and making the page fully interactive, without re-rendering the DOM.

This gives you the instant load times of a traditional server-rendered app and the rich interactivity of a modern SPA.

---

## Backend & Data

### 4. Database & Migrations

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
        db.exec(\`
          CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE,
            password TEXT NOT NULL
          );
        \`);
      },
    },
  ],
};
```

### 5. Server Actions & Filesystem API

Server Actions are a key feature of Webs. They allow you to define functions inside your components that **only run on the server**. This makes it incredibly easy to perform secure operations like database queries or filesystem access without building a separate API.

When you call a Server Action from the client, Webs handles the secure communication. These actions receive a `context` object with access to `db`, the authenticated `user`, the `fs` API, and more.

The **Filesystem API** (`fs`) provides a convenient, promise-based way to interact with the server's file system directly within a Server Action.

```javascript
// src/app/files.js
export default {
  name: "Files",
  actions: {
    async read_notes(context) {
      const { fs, user } = context; // Safely access server resources
      // Read a user-specific file from the server
      const notes = await fs.cat(\`./user_data/\${user.id}/notes.txt\`).text();
      return { notes };
    },
  },
};
```

### 6. Authentication & Middleware

Webs comes with a complete, cookie-based authentication system and automatically provides secure API endpoints for user registration, login, and logout.

To protect routes or run code before a page is rendered, you use **middleware**. A middleware is a function that intercepts a navigation request. You can use it to check if a user is logged in and redirect them if they aren't. To apply middleware, you export a `middleware` array from a component file.

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

### 7. Template Syntax

Webs templates are standard HTML supercharged with a simple syntax for data binding and event handling.

- **Text Interpolation**: Use mustaches `{{ }}` to display reactive state.
  \`\`\`html
  <p>Welcome, {{ username }}!</p>
  \`\`\`
- **Attribute Binding**: Use the `:` shorthand to bind state to attributes.
  \`\`\`html
  <img :src="user_image" />
  \`\`\`
- **Event Handling**: Use the `@` symbol to listen for DOM events.
  \`\`\`html
  <button type="button" @click="increment">Click me</button>
  \`\`\`

### 8. Styling with Tailwind CSS

Webs has a deep, native integration with the **Tailwind CSS v4 engine**. You can write component-scoped styles directly in a `styles` property. This block gives you access to the full power of Tailwind, including `@theme` for defining design tokens and `@apply` for creating reusable component classes.

Of course, you can also use standard Tailwind utility classes directly in your template for rapid development.

```javascript
// src/components/custom-button.js
export default {
  name: "CustomButton",
  styles: \`
    @theme {
      --color-brand: oklch(0.84 0.18 117.33);
    }
    .btn-brand {
      @apply bg-brand text-white font-bold py-2 px-4 rounded;
    }
  \`,
  template: \`
    <button type="button" class="btn-brand">Click Me</button>
  \`,
};
```

## License

MIT
