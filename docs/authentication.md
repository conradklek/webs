# Authentication in Webs

Webs comes with a complete, built-in authentication system that handles user registration, login, logout, and session management out of the box. It's designed to be secure and easy to integrate into your application.

---

## Built-in API Endpoints

The framework automatically creates and serves three essential, server-side API endpoints for authentication. You do not need to create these yourself.

- `POST /api/auth/register`: Creates a new user.
- `POST /api/auth/login`: Authenticates a user and creates a session.
- `POST /api/auth/logout`: Logs out a user and destroys their session.

These endpoints are typically called from a global `session` store, which manages the user's state on the client and interacts with these APIs.

---

## Session Management

Webs uses a secure, cookie-based session management system.

1.  **Login**: When a user successfully logs in via the `/api/auth/login` endpoint, the server generates a unique, random session ID.
2.  **Cookie**: This session ID is stored in the database and sent to the client in a secure, `HttpOnly` cookie named `session_id`. This means the cookie cannot be accessed by client-side JavaScript, protecting it from XSS attacks.
3.  **Authentication**: On subsequent requests to the server (including Server Action calls), this cookie is automatically sent. The server uses the session ID to retrieve the corresponding user from the database, making the user's data available in your server-side logic.
4.  **Logout**: When a user logs out, the session is deleted from the database, and the cookie is expired on the client, effectively logging them out everywhere.

---

## Protecting Routes with Middleware

A common requirement is to restrict access to certain pages (like a user profile) to only logged-in users. This is accomplished using **middleware**.

Middleware are functions that run before a route is rendered. You can create a middleware function that checks the user's session and redirects them if they aren't authenticated.

**Example: Auth Middleware**

First, create a `session` store to manage the user's state on the client.

```javascript
// src/use/session.js
import { create_store } from "@conradklek/webs";

export const use_session = create_store({
  state: () => ({
    // The user is hydrated from the server on initial load
    user: typeof window !== "undefined" ? window.__WEBS_STATE__?.user : null,
  }),
  getters: {
    is_logged_in() {
      return !!this.user;
    },
  },
  // ... login, logout, register actions
});
```

Next, create the middleware that uses this store.

```javascript
// src/use/auth.js
import { use_session } from "./session.js";

export function use_auth(to, from, next) {
  // On the client, check if the user is logged in.
  if (!use_session.is_logged_in) {
    // If not, redirect to the login page.
    next("/login");
  } else {
    // Otherwise, allow navigation to proceed.
    next();
  }
}
```

Finally, apply the middleware to any component route you want to protect by exporting it from the component file.

```javascript
// src/app/profile.js
import { use_auth } from "../use/auth.js";

// This middleware will run before the Profile component is rendered.
export const middleware = [use_auth];

export default {
  name: "Profile",
  // ... component definition
};
```

This declarative approach makes it easy to secure your application's routes.
