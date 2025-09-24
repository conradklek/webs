# Server-Side Logic

Webs is a full-stack framework that simplifies development by colocating server-side logic with its corresponding frontend component in a single `.webs` file. The framework provides two primary mechanisms for securely executing code on the server: **API Route Handlers** and **Server Actions**.

## API Route Handlers

Any page component (`.webs` file in `src/app`) can function as an API endpoint by exporting named functions that correspond to HTTP methods: `get`, `post`, `patch`, `put`, and `del`. This is ideal for building traditional REST or RPC-style APIs.

Each handler function receives a `context` object containing all necessary server-side resources:

- `req`: The standard Request object, augmented with `user`, `db`, and `params`.
- `db`: The server-side SQLite database instance.
- `user`: The authenticated user object, if a session is active.
- `params`: An object containing dynamic route parameters.
- `fs`: A user-sandboxed file system API.

**`src/app/feedback.webs`**

```javascript
// This code executes exclusively on the server.
export default {
  // This function handles POST requests made to the `/feedback` route.
  async post({ req, db, user }) {
    const { message } = await req.json();

    if (!message || typeof message !== 'string') {
      return new Response('Invalid payload', { status: 400 });
    }

    // Persist the feedback to the database.
    db.prepare('INSERT INTO feedback (message, user_id) VALUES (?, ?)').run(
      message,
      user?.id,
    );

    return Response.json({ success: true });
  },
};
```

## Server Actions

Server Actions are functions designed for seamless RPC-style (Remote Procedure Call) communication from client-side code. They are defined within a component's exported `actions` object.

### Defining Actions

To define server actions, export a top-level `actions` object from your component's `<script>` block. Each key in this object becomes an RPC endpoint.

**`src/app/tasks.webs`**

```javascript
export const actions = {
  // Each key defines an action. The first argument is always the server context.
  // Subsequent arguments are passed from the client's `call` function.
  async createTask({ db, user }, content, priority) {
    // This code runs securely on the server.
    const result = db
      .prepare(
        'INSERT INTO tasks (content, priority, user_id) VALUES (?, ?, ?)',
      )
      .run(content, priority, user.id);
    return { success: true, taskId: result.lastInsertRowid };
  },
};
```

### Invoking Actions with `action()`

On the client, the `action()` composable provides a type-safe way to invoke a server action. It returns a `call` function to trigger the remote procedure and a reactive `state` object (`isLoading`, `data`, `error`) to track its lifecycle.

```html
<script>
  import { action } from '@conradklek/webs';

  export default {
    setup() {
      // Create a client-side handle for the 'createTask' server action.
      // The framework proxies this call to `/__actions__/app/tasks/createTask`.
      const { call: createTask, state } = action('createTask');

      async function handleNewTask() {
        const content = 'My new high-priority task';
        const priority = 'high';
        await createTask(content, priority); // Arguments are passed to the server action.

        if (state.data?.success) {
          // ... refresh task list or show success message
        }
      }

      return { handleNewTask, taskState: state };
    },
  };
</script>
```
