# Webs

A web framework.

## Core Concepts

### Components (`.webs` files)

```html
<!-- src/gui/counter.webs -->
<script>
  import { state } from '@conradklek/webs';

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
    @apply bg-blue-500 text-white py-1.5 px-3 rounded active:opacity-50 cursor-pointer;
  }
</style>
```

### File-Based Routing & Layouts

Webs uses the file system to define routes. Any `.webs` file inside `src/app` becomes a page, with support for dynamic segments and catch-all routes.

- `src/app/index.webs` → `/`
- `src/app/users/[username].webs` → `/users/:username`
- `src/app/files/[...path].webs` → `/files/*` (catch-all)

Shared layouts are created with a `layout.webs` file, which automatically wraps all pages in its directory and subdirectories. Page content is rendered inside the `<slot>` element.

### Template Syntax

- **Interpolation**: `{{ expression }}`
- **Attribute Binding**: `:href="expression"`
- **Event Handling**: `@click="handler"`
- **Conditionals**: `{#if ...}`, `{:else if ...}`, `{:else}`
- **Lists**: `{#each items as item (item.id)}`
