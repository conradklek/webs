# Route Middleware

Middleware are functions that run **before** a route's component is rendered. They provide a powerful way to intercept a navigation request and run code, for example, to protect a route from unauthorized access, log analytics, or perform redirects.

---

## Creating Middleware

A middleware is simply a function that accepts three arguments: `to`, `from`, and `next`.

- **`to`**: An object representing the route the user is navigating **to**. It contains `path`, `params`, and the `component` definition.
- **`from`**: An object representing the route the user is coming **from**.
- **`next`**: A function that you **must call** to resolve the middleware and continue the navigation process.

### The `next()` Function

The behavior of the `next` function is critical:

- **`next()`**: Called with no arguments, it allows the navigation to proceed to the intended route.
- **`next('/some/path')`**: Called with a path string, it cancels the current navigation and redirects the user to the new path.

### Example: A Logging Middleware

Let's create a simple middleware that logs every navigation event to the console.

```javascript
// src/use/logger.js

export function use_logger(to, from, next) {
  // Log the navigation details.
  console.log(`Navigating from ${from.path ?? "/"} to ${to.path}`);

  // Always call next() to allow the navigation to continue.
  next();
}
```

---

## Applying Middleware to a Route

To apply middleware to a specific route, you export a `middleware` array from the component file for that route.

You can apply a single middleware or a chain of them. They will be executed in the order they are defined in the array.

### Applying a Single Middleware

Here, we apply our `use_logger` middleware to the `Login` component.

```javascript
// src/app/login.js
import { use_logger } from "../use/logger.js";

// This middleware will run before the Login component is rendered.
export const middleware = [use_logger];

export default {
  name: "Login",
  // ... component definition
};
```

### Chaining Multiple Middleware

For the `Profile` page, we want to both log the navigation and ensure the user is authenticated.

```javascript
// src/app/profile.js
import { use_logger } from "../use/logger.js";
import { use_auth } from "../use/auth.js"; // Assuming an auth middleware exists

// Middleware runs in order: first logger, then auth.
export const middleware = [use_logger, use_auth];

export default {
  name: "Profile",
  // ... component definition
};
```

If `use_logger` calls `next()`, the router will then proceed to execute `use_auth`. If `use_auth` calls `next('/login')`, the navigation to the profile page is cancelled, and the user is redirected. The component for the original route (`Profile`) will never be rendered.

This pipeline approach provides a flexible and powerful way to manage cross-cutting concerns for your application's routes.
