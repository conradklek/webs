# Template Syntax

Webs templates are written in standard HTML, but they are enhanced with a special syntax that allows you to declaratively bind your component's logic and state to the DOM.

---

## Text Interpolation (Mustaches)

The most basic form of data binding is text interpolation, using the "mustache" syntax (double curly braces). This allows you to display reactive data from your component's state directly in your HTML.

```javascript
export default {
  name: "UserInfo",
  state() {
    return {
      username: "Alice"
    };
  },
  template: `
    <div>
      <!-- The content inside the <p> tag will update
           whenever `this.username` changes. -->
      <p>Welcome, {{ username }}!</p>
    </div>
  `
};
```

You can also use any valid JavaScript expression inside the mustaches.

```javascript
template: `
  <div>
    <p>User: {{ username.toUpperCase() }}</p>
    <p>Can vote: {{ age >= 18 ? 'Yes' : 'No' }}</p>
    <p>Clicked {{ count }} time{{ count === 1 ? '' : 's' }}</p>
  </div>
`;
```

---

## Attribute Binding

While you can use mustaches for text, you cannot use them inside standard HTML attributes. To bind a dynamic value to an attribute, you use the `w-bind` directive, or its shorthand, the colon (`:`).

```html
<!-- Full syntax -->
<img w-bind:src="image_url" />

<!-- Shorthand syntax -->
<img :src="image_url" />
```

This is useful for dynamically changing an element's attributes based on your component's state.

```javascript
export default {
  name: "ProfileImage",
  state() {
    return {
      user_image: "/path/to/image.jpg",
      is_disabled: true,
    };
  },
  template: `
    <div>
      <img :src="user_image" alt="User profile picture">
      <button :disabled="is_disabled">Submit</button>
    </div>
  `,
};
```

---

## Event Handling

To listen for DOM events, like clicks or keyboard inputs, you use the `@` directive.

The value of the directive is the name of a method from your component's `methods` object.

```html
<button type="button" @click="increment">Increment</button>
```

When the button is clicked, the `increment` method on the component instance will be called.

```javascript
export default {
  name: "Home",
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
    <button type="button" @click="increment">
      Clicked {{ count }} times!
    </button>
  `,
};
```
