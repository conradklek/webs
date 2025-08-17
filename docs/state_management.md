# Global State Management in Webs

While Webs components manage their own local state effectively, sometimes you need to share data across different parts of your application. For example, user authentication status, a shopping cart's contents, or theme settings are all pieces of state that multiple components might need to access or modify.

For these scenarios, Webs provides a simple and powerful solution for centralized state management, inspired by modern data stores.

---

## `create_store`: The Heart of Global State

The core of state management in Webs is the `create_store` function. It allows you to define a self-contained, reactive "store" that holds your application's shared state, the methods to change that state, and ways to compute derived state.

A store is defined with three key properties: `state`, `actions`, and `getters`.

```javascript
import { create_store } from "@conradklek/webs";

export const my_store = create_store({
  state: () => ({
    // ... initial state properties
  }),
  actions: {
    // ... methods to change the state
  },
  getters: {
    // ... computed values based on state
  },
});
```

Let's break down each part.

---

### 1. `state`

The `state` property is a **function that returns an object**. This object contains the initial data for your store. By making it a function, we ensure that each instance of your application gets a fresh state object, which is crucial for preventing shared state issues, especially during Server-Side Rendering (SSR).

All data within the `state` object is made fully **reactive** automatically.

```javascript
// src/use/counter-store.js

import { create_store } from "@conradklek/webs";

export const use_counter = create_store({
  state: () => ({
    count: 0,
    last_updated: null,
  }),
});
```

---

### 2. `actions`

`actions` are functions that modify the state. They are the **only** recommended way to change your store's data. By centralizing state mutations in actions, your application becomes more predictable and easier to debug.

Inside an action, `this` is bound to the store instance, giving you direct access to the state properties.

```javascript
// src/use/counter-store.js

// ...
export const use_counter = create_store({
  state: () => ({
    count: 0,
    last_updated: null,
  }),
  actions: {
    increment(amount = 1) {
      this.count += amount;
      this.last_updated = new Date();
    },
    decrement(amount = 1) {
      this.count -= amount;
      this.last_updated = new Date();
    },
    reset() {
      this.count = 0;
      this.last_updated = null;
    },
  },
});
```

---

### 3. `getters`

`getters` allow you to compute derived state based on your store's state. Think of them as **computed properties** for your store. They are reactive and will only re-evaluate when one of their dependencies changes.

Like actions, `this` is bound to the store instance.

```javascript
// src/use/counter-store.js

// ...
export const use_counter = create_store({
  state: () => ({
    count: 0,
    last_updated: null,
  }),
  actions: {
    // ...
  },
  getters: {
    doubled() {
      return this.count * 2;
    },
    is_even() {
      return this.count % 2 === 0;
    },
  },
});
```

---

## Using a Store in a Component

To use a store in your component, simply import it and return it from the `setup()` function. This makes the store's state, actions, and getters available in your component's template and methods.

```javascript
// src/app/counter.js

import { use_counter } from "../use/counter-store.js";

export default {
  name: "Counter",
  setup() {
    // Make the entire store available to the component context
    return {
      counter: use_counter,
    };
  },
  template: `
    <div class="p-8 flex flex-col items-center gap-4">
      <p class="text-2xl font-bold">Count: {{ counter.count }}</p>
      <!-- ... -->
    </div>
  `,
};
```

Because the store is reactive, any component using it will automatically update its view whenever the store's state changes.

---

## Persisted Component State

In addition to global stores, Webs offers a powerful feature for automatically persisting a component's **local state** to the browser's `localStorage`. This is incredibly useful for remembering user preferences, form data, or UI state across page reloads without needing a global store.

To make a piece of local state persistent, simply prefix its name with a dollar sign (`$`).

### How It Works

When a component is initialized, Webs checks its `state` definition.

1.  If a state property starts with `$`, like `$count`, Webs will first look in `localStorage` for a previously saved value.
2.  If a value is found, it will be used as the initial state, overriding the default.
3.  Whenever this reactive property changes, Webs automatically saves the new value back to `localStorage`.

The key used in `localStorage` is a combination of the component's `name` and the state property's name (e.g., `Home:$count`).

### Example: A Persisted Counter

Here is a simple component that remembers its count even if you refresh the page.

```javascript
// src/app/home.js

export default {
  name: "Home",
  state() {
    return {
      // This count will be saved to localStorage
      $count: 0,
    };
  },
  methods: {
    increment() {
      this.$count++;
    },
  },
  template: `
    <div>
      <p>This button has been clicked {{ $count }} time{{ $count === 1 ? '' : 's' }}!</p>
      <button @click="increment">Click Me</button>
    </div>
  `,
};
```
