# webs.js

A javascript framework

```
webs/
├── packages/
│   ├── webs-framework/
│   │   ├── bin/
│   │   │   ├── cli.js
│   │   │   └── utils/
│   │   │       ├── build.js
│   │   │       ├── config.js
│   │   │       ├── routes.js
│   │   │       └── server.js
│   │   ├── client/
│   │   │   ├── db.js
│   │   │   ├── index.js
│   │   │   ├── session.js
│   │   │   └── sw.js
│   │   ├── lib/
│   │   │   ├── compiler.js
│   │   │   ├── parser.js
│   │   │   ├── reactivity.js
│   │   │   ├── renderer.js
│   │   │   └── runtime.js
│   │   ├── server/
│   │   │   ├── auth.js
│   │   │   ├── db.js
│   │   │   ├── fs.js
│   │   │   └── request-handler.js
│   │   ├── index.js
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── webs-components/
│       ├── ... (demo app files)
```

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
- `src/app/blog/index.js` → `/blog`

**Dynamic Routes**

To create a dynamic route, use square brackets in the filename. The value of the dynamic segment will be available in your component's `params` prop.

- `src/app/profile/[username].js` → `/profile/:username`
- `src/app/posts/[slug].js` → `/posts/:slug`

To navigate between pages, use standard `<a>` tags. The Webs router intercepts these clicks to provide a fast, single-page application experience without full page reloads.

### 2. Components

Components are the heart of a Webs application. They are plain JavaScript objects that encapsulate their own state, logic, and markup. Every component is the default export from a `.js` file.

#### Basic Definition

A component is defined by a few key properties:

- `name`: A unique string identifier for the component.
- `props`: An object defining the properties the component accepts from a parent.
- `setup(props, context)`: A function where all reactive state and logic for the component is defined. It runs once when the component is created.
- `template`: An HTML string (or a tagged template literal function) that defines the component's structure.

```javascript
// src/app/counter.js
import { useState, onMounted } from '@conradklek/webs';

export default {
  name: "Counter",
  setup(props, context) {
    const count = useState(0);

    function increment() {
      count++;
    }

    onMounted(() => {
      console.log("Counter component has been mounted!");
    });

    return {
      count,
      increment,
    };
  },
  template(html) {
    return html`
      <div>
        <p>Count: {{ count }}</p>
        <button type="button" @click="increment">Increment</button>
      </div>
    `;
  },
};
```

#### Props

Props allow you to pass data from a parent component to a child. You can define them with types and default values. They are passed as the first argument to the `setup` function.

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
  setup(props) {
    console.log(props.name);
  },
  template(html) {
    return html`<p>Hello, {{ name }}!</p>`;
  },
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
  template(html) {
    return html`
      <div>
        <Greeting name="Alice" />
        <Greeting />
      </div>
    `;
  },
};
```

#### Slots & Content Projection

To pass content _into_ a component, use the `<slot>` tag. Any child elements you place inside your custom component tag in the parent will be rendered where the `<slot>` tag is.

```javascript
// src/components/Wrapper.js
export default {
  name: "Wrapper",
  template(html) {
    return html`
      <div class="wrapper">
        <slot></slot>
      </div>
    `;
  },
}

// src/app/index.js
import Wrapper from '../components/Wrapper.js';

export default {
  name: "HomePage",
  components: { Wrapper },
  template(html) {
    return html`
      <Wrapper>
        <p>This content will be placed inside the wrapper.</p>
      </Wrapper>
    `;
  },
}
```

## Backend & Data

### 3. Database

Webs includes out-of-the-box support for an SQLite database, managed via Bun's native `bun:sqlite` driver. The framework provides a simple migration system to manage your database schema over time.

### 4. Server Actions

Server Actions are a key feature of Webs. They allow you to define functions inside your components that **only run on the server**. This makes it incredibly easy to perform secure operations like database queries without building a separate API.

When you call a Server Action from the client, Webs handles the secure communication. These actions receive a `context` object with access to the `db` instance and the authenticated `user`.

```javascript
// src/app/dashboard.js
export default {
  name: "Dashboard",
  actions: {
    async fetch_user_posts(context) {
      const { db, user } = context;
      if (!user) throw new Error("Unauthorized");
      return db.query("SELECT * FROM posts WHERE user_id = ?").all(user.id);
    },
  },
  // ...
};
```

### 5. Authentication & Middleware

Webs comes with a complete, cookie-based authentication system and automatically provides secure API endpoints for user registration (`/api/auth/register`), login (`/api/auth/login`), and logout (`/api/auth/logout`).

To protect routes or run code before a page is rendered, you use **middleware**. A middleware is a function that intercepts a navigation request. You can use it to check if a user is logged in and redirect them if they aren't.

To apply middleware, you export a named `middleware` array from a page component file.

```javascript
// src/app/profile/[username].js

export const middleware = [
  (to, from, next) => {
    console.log(`Navigating from ${from.path} to ${to.path}`);
    next();
  },
  (to, from, next) => {
    if (!to.user) {
      return next('/login');
    }
    next();
  }
];

export default {
  name: "Profile",
  // ... component definition
};
```

---

## Frontend

### 6. Template Syntax

Webs templates are standard HTML supercharged with a simple syntax for data binding and event handling.

- **Text Interpolation**: Use mustaches `{{ }}` to display reactive state.
  ```html
  <p>Welcome, {{ username }}!</p>
  ```
- **Event Handling**: Use the `@` symbol to listen for DOM events.
  ```html
  <button type="button" @click="increment">Click me</button>
  ```
- **Attribute Binding**: Use the `:` shorthand to bind state to attributes.
  ```html
  <img :src="user_image" />
  ```

**Attribute Fallthrough**

Any attribute you pass to a component that is _not_ a declared prop will automatically be applied to the root element of that component's template. This makes creating wrapper components incredibly clean.

```html
<!-- If you write this: -->
<CustomInput class="mt-4" data-testid="name-input" />

<!-- And CustomInput's template is: -->
<!-- <input type="text" class="input" /> -->

<!-- The final rendered output will be: -->
<input type="text" class="input mt-4" data-testid="name-input" />
```

### 6. Styling with Tailwind CSS

Webs has a deep, native integration with the **Tailwind CSS v4 engine**. You can write component-scoped styles directly in a `styles` property. This block gives you access to the full power of Tailwind, including `@theme` for defining design tokens and `@apply` for creating reusable component classes.

Of course, you can also use standard Tailwind utility classes directly in your template for rapid development.

```javascript
// src/components/custom-button.js
export default {
  name: "CustomButton",
  styles: `
  @theme {
    --color-brand: oklch(0.84 0.18 117.33);
  }
  @layer components {
    .btn-brand {
      @apply bg-brand text-white font-bold py-2 px-4 rounded;
    }
  }
`,
  template(html) {
    return html`<button type="button" class="btn-brand">Click Me</button>`;
  },
};
```

---

## License

MIT
