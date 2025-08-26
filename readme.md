# webs.js

A Javascript Framework

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

- `src/app/index.webs` → `/`
- `src/app/about.webs` → `/about`
- `src/app/blog/index.webs` → `/blog`

**Dynamic Routes**

To create a dynamic route, use square brackets in the filename. The value of the dynamic segment will be available in your component's `params` prop.

- `src/app/profile/[username].webs` → `/profile/:username`
- `src/app/posts/[slug].webs` → `/posts/:slug`

To navigate between pages, use standard `<a>` tags. The Webs router intercepts these clicks to provide a fast, single-page application experience without full page reloads.

### 2. Components

Components are the heart of a Webs application. They are defined in `.webs` files using a familiar structure of three blocks: `<script>`, `<template>`, and `<style>`. This approach, inspired by frameworks like Svelte, co-locates all the logic, markup, and styling for a component in a single, easy-to-manage file.

At build time, Webs uses a powerful Bun plugin to compile these `.webs` files into highly optimized, vanilla JavaScript modules.

#### Basic Definition

A component is defined by exporting a default object from the `<script>` block.

```html
<script>
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

#### Props

Props allow you to pass data from a parent component to a child. You define them in the `props` object within your script's default export. They are passed as the first argument to the `setup` function.

```html
<script>
  export default {
    name: "Greeting",
    props: {
      name: {
        type: String,
        default: "World",
      },
    },
    setup(props) {
      console.log(`Hello, ${props.name}`);
    },
  };
</script>

<template>
  <p>Hello, {{ name }}!</p>
</template>
```

#### Registering Child Components

To use a component within another, you must import it and register it in the `components` object. This makes the child component's tag available in the parent's template.

```html
<script>
  import Greeting from "../components/Greeting.webs";

  export default {
    name: "HomePage",
    components: {
      Greeting,
    },
  };
</script>

<template>
  <div>
    <Greeting name="Alice" />
    <Greeting />
  </div>
</template>
```

#### Slots & Content Projection

To pass content _into_ a component, use the `<slot>` tag. Any child elements you place inside your custom component tag in the parent will be rendered where the `<slot>` tag is.

```html
<template>
  <div class="wrapper">
    <slot></slot>
  </div>
</template>

```html
<script>
  import Wrapper from '../components/Wrapper.webs';

  export default {
    name: "HomePage",
    components: { Wrapper },
  };
</script>

<template>
  <Wrapper>
    <p>This content will be placed inside the wrapper.</p>
  </Wrapper>
</template>
```

## Backend & Data

### 3. Database

Webs includes out-of-the-box support for an SQLite database, managed via Bun's native `bun:sqlite` driver. The framework provides a simple migration system to manage your database schema over time.

### 4. Server Actions

Server Actions are a key feature of Webs. They allow you to define functions inside your components that **only run on the server**. This makes it incredibly easy to perform secure operations like database queries without building a separate API.

When you call a Server Action from the client, Webs handles the secure communication. These actions receive a `context` object with access to the `db` instance and the authenticated `user`.

```javascript
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
(This section remains the same)

### 7. Styling with Tailwind CSS

Webs has a deep, native integration with the **Tailwind CSS v4 engine**. You can write component-scoped styles directly in the `<style>` block of your `.webs` files. This block gives you access to the full power of Tailwind, including `@theme` for defining design tokens and `@apply` for creating reusable component classes.

Of course, you can also use standard Tailwind utility classes directly in your template for rapid development.

```html
<template>
  <button type="button" class="btn-brand">Click Me</button>
</template>

<style>
  @theme {
    --color-brand: oklch(0.84 0.18 117.33);
  }
  @layer components {
    .btn-brand {
      @apply bg-brand text-white font-bold py-2 px-4 rounded;
    }
  }
</style>
```

---

## License

MIT

