# Components in Webs

Components are the heart of a Webs application. They are reusable, self-contained pieces of UI that encapsulate their own structure, data, and logic. A component in Webs is a plain JavaScript object with a few special properties that bring it to life.

---

## The Component Object

Every component is defined as a default export from a `.js` file. Let's look at a basic "counter" component to understand its structure.

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
      <button @click="increment">Increment</button>
    </div>
  `,
};
```

This simple object has everything it needs to function. Let's break down its core properties.

### `name`

- **Type**: `String`
- **Required**

The `name` property gives your component a unique identity. It's used for debugging, in development tools, and is required for the component to be registered correctly.

```javascript
name: "Counter";
```

---

### `state`

- **Type**: `Function`

The `state` property is a **function that returns an object**. This object contains all the reactive data for the component.

- **Reactivity**: Any property defined in the `state` object is automatically reactive. When you change a state property, any part of the template that uses it will update automatically.
- **Why a function?**: Defining `state` as a function ensures that each instance of the component gets its own unique state object. If it were just an object, all instances of the component would share the same state, leading to unpredictable bugs.

```javascript
state() {
  return {
    count: 0,
  };
}
```

---

### `methods`

- **Type**: `Object`

The `methods` object contains all the functions that your component will use. These methods are often used as event handlers in the template.

- **`this` Context**: Inside a method, the `this` keyword is automatically bound to the component's context. This gives you direct access to your component's `state` (e.g., `this.count`), as well as its other methods.

```javascript
methods: {
  increment() {
    // 'this' refers to the component instance,
    // so we can access 'count' from the state.
    this.count++;
  },
}
```

---

### `template`

- **Type**: `String`

The `template` property is a string containing the HTML markup for your component. It's where you define the structure of your UI. This template is "supercharged" with special syntax for data binding, event handling, and more, which allows it to interact seamlessly with your component's `state` and `methods`.

```javascript
template: `
  <div>
    <p>Count: {{ count }}</p>
    <button @click="increment">Increment</button>
  </div>
`;
```

These four properties form the foundation of every component in a Webs application, providing a clean and organized way to build your user interface.
