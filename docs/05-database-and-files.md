# Database & File System

Webs is architected around a powerful local-first data layer that ensures a zero-latency user experience and effortless offline capability. This is achieved through a dual-database system and a sandboxed file system, both connected by a real-time synchronization engine.

## Local-First Architecture

The framework treats the user's device as the primary source of truth. The UI interacts exclusively with a client-side **IndexedDB** database, resulting in instantaneous data operations. On the server, a **SQLite** database acts as the authoritative data store.

### Schema Definition

You define your database schema in the `server-config.js` file. Tables intended for client-side use must be marked with `sync: true`. This flag tells the framework to manage migrations on the server and create the necessary object stores and indexes in the client's IndexedDB.

**`server-config.js`**

```javascript
export function getDbConfig() {
  return {
    name: 'fw.db',
    version: 1,
    tables: {
      todos: {
        sync: true, // This table will be available on the client
        keyPath: 'id',
        fields: {
          id: { type: 'text', primaryKey: true },
          content: { type: 'text', notNull: true },
          completed: { type: 'integer', default: 0 },
          user_id: { type: 'integer', references: 'users(id)' },
        },
        indexes: [{ name: 'by-user', keyPath: 'user_id' }],
      },
    },
  };
}
```

### The Sync Engine

When you perform a write operation (`put`, `delete`) on a synced table from the client, two things happen:

1. The change is immediately applied to the local IndexedDB, so the UI updates instantly.
2. An operation record is added to a special `outbox` table in IndexedDB.

A background **Sync Engine**, communicating via WebSockets, processes this `outbox`. It sends each operation to the server, which validates it and persists it to SQLite. The server then broadcasts the change to all of that user's connected clients, ensuring data consistency across devices. This process is resilient to network interruptions; if the user is offline, operations queue in the `outbox` until connection is restored.

## Client-Side Data Access

The framework provides two main APIs for interacting with the client database.

### The `table()` Composable

The primary method for interacting with data within a component is the `table()` composable. It provides a **reactive, real-time connection** to a table. The returned state object automatically updates whenever the underlying data changes, whether from a local mutation or an incoming sync event.

```javascript
// A reactive, auto-updating connection to the 'todos' table.
const todos = table('todos');

// todos.data contains the array of records.
// todos.isLoading is a boolean.
// todos.put(record) and todos.destroy(key) are optimistic update methods.
```

### The `db()` Utility

For more granular or non-reactive database operations, the `db()` utility provides a direct, promise-based API to a table's underlying methods, such as `get(key)` and `query(indexName, value)`.

```javascript
import { db } from '@conradklek/webs';

const usersTable = db('users');
const user = await usersTable.get(someId);
```

## File System (`fs`)

The file system provides a sandboxed, user-specific API for managing files on both the client and server. It is built on the same synchronization engine as the database, making file operations automatically persistent and real-time. Each user is allocated a private, sandboxed directory on the server.

The client-side `fs(path)` function returns an API object for interacting with files and directories.

- **Directory Operations**: `fs('/my-folder/').ls()` lists contents.
- **File Operations**: `fs('/my-file.txt').read()`, `.write(content)`, and `.rm()` manage files.
