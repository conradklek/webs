# Routing in Webs

Webs uses a simple and intuitive **file-based routing** system. This means that the structure of your files within the `src/app` directory directly determines the URL routes of your application.

---

## How It Works

The framework automatically maps every JavaScript file in the `src/app` directory to a specific URL path. You don't need to configure a central routing file; you simply create a file, and a route is created for it.

### Route Mapping Rules

- **`src/app/index.js`** maps to the root path: **`/`**
- **`src/app/about.js`** maps to the path: **`/about`**
- **`src/app/profile.js`** maps to the path: **`/profile`**

And so on. The name of the file (without the `.js` extension) becomes the URL path segment.

### Example File Structure

Consider the following file structure:

```
src/
└── app/
    ├── index.js    # → Renders at /
    ├── about.js    # → Renders at /about
    ├── login.js    # → Renders at /login
    └── profile.js  # → Renders at /profile
```

With this structure, Webs automatically creates four pages for your application, accessible at the corresponding URLs.

---

## Navigating Between Routes

To create links between your pages, you should use the standard HTML `<a>` tag. The Webs client-side router will automatically intercept clicks on these links.

When a user clicks a link to another page within your application:

1.  The router prevents a full page reload.
2.  It fetches and renders the component for the new route.
3.  It updates the browser's URL using the History API.

This provides a fast, seamless navigation experience characteristic of a Single-Page Application (SPA), but with the initial-load benefits of Server-Side Rendering.

```javascript
// src/app/index.js
export default {
  name: "Home",
  template: `
    <div>
      <h1>Home Page</h1>
      <nav>
        <!-- This link will navigate to the component
             defined in src/app/about.js -->
        <a href="/about">About Us</a>

        <!-- This link will navigate to the component
             defined in src/app/profile.js -->
        <a href="/profile">My Profile</a>
      </nav>
    </div>
  `,
};
```

This simple, convention-over-configuration approach to routing makes it easy to build and reason about the structure of your application.
