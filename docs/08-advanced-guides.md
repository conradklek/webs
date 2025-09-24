# Advanced Guides

This section covers the command-line interface and how to accelerate performance-critical logic with native C modules.

## Deployment & CLI

Webs is equipped with a comprehensive command-line interface (CLI) that streamlines the development lifecycle.

### Development (`bun run dev`)

This is your primary command during development. It starts a complete environment that:

- Compiles `.webs` and C files on-the-fly into executable JavaScript in a temporary `.webs` directory.
- Watches for file changes and triggers hot-reloads.
- Seeds the database with initial data for consistent testing.
- Opens an interactive developer shell for running commands, making API requests, and interacting with AI agents directly from the terminal.

### Production Build (`bun run start`)

This command orchestrates a production-ready build process:

1.  **Compilation & Bundling**: Compiles all `.webs` components and uses Bun's bundler to create optimized, minified, and hash-named client-side JavaScript and CSS files in the `/dist` directory.
2.  **Offline Support**: Generates a Service Worker that automatically caches all application assets, enabling full offline functionality.
3.  **Production Server**: Launches a performant web server configured to serve the production assets.

## Native C Modules

For performance-critical server-side logic, Webs allows you to write and call native C functions directly from your components. Leveraging Bun's Foreign Function Interface (`bun:ffi`), the framework automatically compiles your C code and makes the functions available to your server actions.

### How It Works

1.  **Create a C source file** (e.g., `fast-math.c`).
2.  **Import the C file** in your component's `<script>` block, appending `?native` to the path. This signals to the compiler that this is a native module.
3.  **Export a `symbols` object**. This object defines the function signatures for your C code, telling the JavaScript runtime how to call the native functions and what types to expect.
4.  **Access compiled functions** via the `cc` property on the server context object (`prefetch`, `post`, etc.).

### Example: High-Performance Math

**`src/app/fast-math.c`**

```c
// A simple function that adds two integers.
int add(int a, int b) {
  return a + b;
}
```

**`src/app/calculator.webs`**

```html
<script>
  // 1. Import the C source file with the `?native` suffix.
  import source from './fast-math.c?native';

  // 2. Export the symbol definitions for the C functions.
  // This must match the function signatures in the .c file.
  export const symbols = {
    add: {
      args: ['int', 'int'],
      returns: 'int',
    },
  };

  export const actions = {
    // 3. The compiled 'add' function is injected into the context's `cc` object.
    async prefetch({ cc }) {
      const result = cc.add(10, 32); // Calls the native C code!
      return { result };
    },
  };

  export default {
    props: { initialState: { default: () => ({}) } },
    setup(props) {
      return { result: props.initialState.result };
    },
  };
</script>

<template>
  <h1>The result from our C function is: {{ result }}</h1>
</template>
```
