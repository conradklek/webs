# Server Actions in Webs

Server Actions are a powerful feature in Webs that allow you to write and call server-side logic directly from your client-side components. This provides a seamless way to perform secure operations, like database mutations or accessing server-only resources, without the need to manually create and fetch from traditional API endpoints.

---

## What are Server Actions?

Imagine you need to add a new item to a database from a button click. Traditionally, you would:

1.  Create a REST API endpoint (e.g., `POST /api/items`).
2.  Write server-side logic to handle the request, validate data, and interact with the database.
3.  From your client-side component, use `fetch` to make a request to that endpoint.
4.  Handle loading states, errors, and the response on the client.

**Server Actions streamline this entire process.** You simply define a function on your component that is designated to run on the server, and Webs handles the rest.

---

## Defining a Server Action

To create a Server Action, you add an `actions` object to your component definition. Each function within this object is a Server Action.

- **Location**: These functions physically live in your component file but are **only executed on the server**.
- **Security**: Server Actions are secure by default. They can only be called by an authenticated user. Webs automatically handles session validation.
- **Server Context**: Each Server Action receives a special context object as its first argument, giving you access to server-side resources.

The context object contains:

- `db`: The application's database instance.
- `user`: The authenticated user object for the current session.
- `fs`: The server's filesystem module.
- `req`: The raw HTTP request object.

```javascript
// src/app/posts.js

export default {
  name: "Posts",
  // ... state, methods, template
  actions: {
    // This function runs on the server
    async create_post(context, title, content) {
      const { db, user } = context;

      // You have direct access to the database and the logged-in user
      const stmt = db.prepare(
        "INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)",
      );
      stmt.run(user.id, title, content);

      return { success: true, message: "Post created!" };
    },
  },
};
```

_Any additional arguments (like `title` and `content` above) are passed directly from the client when the action is called._

---

## Calling a Server Action

From your component's template or methods, you can call a Server Action through the special `actions` proxy object. Webs automatically creates this proxy on the client, which transforms the function call into a secure API request.

Calling `actions.create_post(...)` on the client triggers the `create_post` function on the server.

```javascript
// src/app/posts.js

export default {
  name: "Posts",
  state() {
    return {
      title: "",
      content: "",
      message: "",
    };
  },
  methods: {
    async handle_submit() {
      if (!this.title || !this.content) return;

      // Call the server action and wait for its response
      const result = await this.actions.create_post(this.title, this.content);

      if (result.success) {
        this.message = result.message;
        this.title = "";
        this.content = "";
      }
    },
  },
  template: `
    <div>
      <form @submit.prevent="handle_submit">
        <input w-model="title" placeholder="Post Title" />
        <textarea w-model="content" placeholder="Content..."></textarea>
        <button type="submit">Create Post</button>
      </form>
      <p w-if="message">{{ message }}</p>
    </div>
  `,
  actions: {
    async create_post(context, title, content) {
      // ... server-side logic from the example above ...
      const { db, user } = context;
      const stmt = db.prepare(
        "INSERT INTO posts (user_id, title, content) VALUES (?, ?, ?)",
      );
      stmt.run(user.id, title, content);
      return { success: true, message: "Post created!" };
    },
  },
};
```

This co-location of client-side logic and its corresponding server-side mutation makes your components more organized and easier to reason about, all while maintaining a strong security boundary.
