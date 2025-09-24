# Components & The Reactivity System

The architecture of a Webs application is centered on a powerful component model, driven by a fine-grained reactivity system. This allows you to build complex UIs declaratively.

## The Component Model

At runtime, every component in your application is represented by a **Component Instance**. This internal object holds all the state, props, and context for the component to render and update. It's created by the framework's renderer from a component definition.

### Single-File Components (`.webs`)

You define components in `.webs` files, which encapsulate the logic, template, and styling for a piece of the UI. A `.webs` file is composed of three sections:

- **`<script>`**: Contains the component's JavaScript logic. You export a component definition object from here.
- **`<template>`**: Defines the HTML structure and bindings. This is compiled into a highly optimized render function.
- **`<style>`**: Contains component-scoped CSS.

### The `setup` Function

The `setup(props, context)` function is the core of a component's logic. It's invoked once when the component instance is created.

- `props`: A reactive object containing the component's resolved properties.
- `context`: A non-reactive object containing:
  - `attrs`: Fallthrough attributes not declared in `props`.
  - `slots`: An object representing content injected by the parent component.
  - `params`: Route parameters from the URL.

The object returned from `setup` becomes the public render context for the template.

### Lifecycle Hooks

To execute logic at specific points in a component's lifecycle, import and invoke the lifecycle functions within `setup`.

- `onMounted(callback)`: Executes after the component's rendered DOM nodes are inserted into the page. Ideal for DOM-related initialization.
- `onUnmounted(callback)`: Executes just before the component is removed. Perfect for cleanup (e.g., clearing intervals or subscriptions).
- `onUpdated(callback)`: Executes after the component re-renders due to a state change.

```javascript
import { onMounted, onUnmounted } from '@conradklek/webs';

export default {
  setup() {
    let intervalId;
    onMounted(() => {
      intervalId = setInterval(() => console.log('tick'), 1000);
    });
    onUnmounted(() => {
      clearInterval(intervalId);
    });
  },
};
```

## The Reactivity System

The reactivity system automatically updates the UI in response to state changes. It works by tracking dependencies and re-running effects when those dependencies are modified.

### Core Primitives: `state()` and `ref()`

Reactive data is declared with `state()` or its alias, `ref()`.

- For **objects and arrays**, `state()` returns a deep reactive proxy. Mutations are tracked automatically.
- For **primitive values** (strings, numbers, booleans), `state()` returns a `ref` object. The underlying value must be accessed and mutated via the `.value` property.

```javascript
import { state, ref, RAW_SYMBOL } from '@conradklek/webs';

// Returns a reactive Proxy
const user = state({ name: 'Webs' });
user.name = 'Gemini'; // This mutation is tracked

// Returns a Ref
const count = ref(0);
count.value++; // This mutation is tracked

// Access the raw, non-reactive object
const rawUser = user[RAW_SYMBOL];
```

### Derived State: `computed()`

A `computed()` property creates a derived, read-only `ref`. It caches its value and only re-evaluates when its underlying reactive dependencies change.

```javascript
import { state, computed } from '@conradklek/webs';

const user = state({ firstName: 'John', lastName: 'Doe' });
const fullName = computed(() => `${user.firstName} ${user.lastName}`);

console.log(fullName.value); // "John Doe"
user.firstName = 'Jane';
console.log(fullName.value); // "Jane Doe" (automatically updated)
```

### Side Effects: `effect()`

The `effect()` function runs a function immediately, tracks its dependencies, and re-runs the function whenever those dependencies change. This is the mechanism that powers component rendering. You can also use it to create "watchers" that react to specific state changes.

```javascript
import { state, effect } from '@conradklek/webs';

const count = state(0);

// Watcher: only runs when count.value changes.
effect(
  () => count.value, // Source to watch
  (newValue, oldValue) => {
    // Callback
    console.log(`Count changed from ${oldValue} to ${newValue}`);
  },
);

count.value++; // Logs: "Count changed from 0 to 1"
```

### Global State: `store()`

For state shared across the entire application, the `store()` function creates a centralized, reactive store combining state, computed getters, and actions.

**`src/stores/session.js`**

```javascript
import { store } from '@conradklek/webs';

export const sessionStore = store({
  state: () => ({ user: null, lastLogin: null }),
  getters: {
    isLoggedIn: (state) => !!state.user,
  },
  actions: {
    login(state, userData) {
      state.user = userData;
      state.lastLogin = new Date();
    },
    logout(state) {
      state.user = null;
    },
  },
});
```
