# Getting Started

This guide introduces the fundamental concepts of the Webs framework by constructing a simple, interactive component. Webs is built on the [Bun](https://bun.sh/) runtime, which must be installed to proceed.

## Project Structure

A Webs project adheres to a clean and intuitive directory structure. All application source code resides within the `src` directory.

```
/
├── .webs/         # Framework temporary files (auto-generated)
├── src/
│   ├── app/       # Page components, layouts, and server logic
│   ├── gui/       # Reusable, globally available UI components
│   └── pub/       # Static public assets (images, fonts, etc.)
├── package.json
└── ...
```

The `src/app/` directory is central to the framework, as its file structure directly dictates the application's routes.

## Creating a Page

A page is defined by creating a `.webs` file within `src/app/`. During the development process, the Webs compiler transforms this file into a standard JavaScript module, allowing you to use modern JS features like `import` and `export`.

We will begin by creating the application's root page.

**`src/app/index.webs`**

```html
<template>
  <h1>Welcome to Webs</h1>
  <p>This page is rendered on the server.</p>
</template>
```

This file contains a single `<template>` block, which defines the static HTML structure for the route. To view this page, execute the development command from your terminal:

```bash
bun run dev
```

This command starts the development server, which compiles your files on-the-fly and serves the application, typically at `http://localhost:3000`.

## State and Interactivity

To introduce interactivity, we augment the component with a `<script>` block and reactive state. We will transform the static page into a dynamic counter.

**`src/app/index.webs`**

```html
<script>
  // 1. Import the `state` function from the framework's core library.
  import { state } from '@conradklek/webs';

  // 2. Export the component definition object.
  export default {
    // 3. The setup function is the component's composition entry point.
    setup() {
      // 4. Declare a reactive state variable initialized to 0.
      const count = state(0);

      // 5. Define a method to mutate the state.
      function increment() {
        // Primitives wrapped by state() are 'refs' and must be accessed via .value.
        count.value++;
      }

      // 6. Expose the reactive state and methods to the template.
      return { count, increment };
    },
  };
</script>

<template>
  <h1>Reactive Counter</h1>
  <!-- 7. Bind the count state to the template using interpolation. -->
  <p>Current count: {{ count }}</p>

  <!-- 8. Bind the increment method to the button's click event. -->
  <button @click="increment">Increment</button>
</template>
```

### Key Architectural Concepts:

- **`<script>` block**: The component's logic resides here. It is compiled into a standard JavaScript module.
- **`setup()` function**: This is the primary entry point for a component's logic and is invoked once upon component creation.
- **`state()`**: This is the core reactivity primitive. When a value is wrapped with `state()`, Webs tracks it for changes. When the value is mutated, any part of the UI that depends on it will automatically re-render.
- **Return from `setup`**: The object returned from `setup` forms the public context for the component's template. Anything you want to use in the `<template>` must be returned from `setup`.
- **Template Syntax**:
  - `{{ count }}`: An interpolation that reactively displays the value of `count`.
  - `@click="increment"`: An event handler that declaratively binds the `increment` method to the button's click event.

You have now implemented a fully reactive component, demonstrating the fundamental design pattern for building sophisticated user interfaces with Webs.
