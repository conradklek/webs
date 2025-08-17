# Server-Side Rendering (SSR) in Webs

Webs is a "universal" framework, meaning it can run the same component code on both the server and the client. This capability enables Server-Side Rendering (SSR), a powerful feature that significantly improves performance and Search Engine Optimization (SEO).

---

## What is SSR?

By default, many JavaScript frameworks render an empty HTML page and then use client-side JavaScript to build the content in the user's browser. This can lead to a blank screen on initial load and can be challenging for search engine crawlers to index properly.

**Server-Side Rendering** solves this by running your application on the server first. When a user requests a page, the server:

1.  Renders the necessary components into a complete HTML string.
2.  Sends this fully-formed HTML to the browser.

The result is that the user sees meaningful content almost instantly, without waiting for a JavaScript bundle to download and execute.

---

## How SSR Works in Webs

In a Webs application, the process is seamless and automatic:

1.  **Initial Request**: When a user navigates to a URL, the request hits the Webs server.
2.  **Component Rendering**: The server identifies the correct component for the route and renders it to static HTML. This process includes fetching any necessary data and computing the initial state.
3.  **State Serialization**: The initial state of the rendered component (including local state, user data from the session, and URL parameters) is serialized into a JSON object.
4.  **HTML Response**: The server sends a response containing the pre-rendered HTML along with a `<script>` tag that attaches the serialized state to the global `window.__WEBS_STATE__` object.

A simplified server response looks like this:

```html
<!DOCTYPE html>
<html>
  <head>
    <title>My Webs App</title>
  </head>
  <body>
    <!-- The pre-rendered HTML for your component -->
    <div id="root">
      <div>
        <p>Welcome back, @anon!</p>
      </div>
    </div>

    <!-- The initial state is embedded in the page -->
    <script>
      window.__WEBS_STATE__ = {
        user: { username: "anon", email: "anon@webs.site" },
        params: {},
        componentState: { $count: 10 },
      };
    </script>

    <!-- The client-side JavaScript bundle -->
    <script type="module" src="/app-d2a1b3.js"></script>
  </body>
</html>
```

---

## Hydration: Bringing the Page to Life

The browser initially displays the static HTML from the server. The next step is **hydration**.

Hydration is the process where the client-side JavaScript takes over the static HTML, making it fully interactive. When the Webs client-side runtime loads, it:

1.  **Reads Initial State**: It reads the state from `window.__WEBS_STATE__`.
2.  **Initializes Components**: It initializes the components with this pre-existing state.
3.  **Attaches Event Listeners**: It attaches all the necessary event listeners (like `@click` handlers) to the existing DOM elements.

Crucially, Webs **does not re-render** the HTML. It assumes the markup is already correct and simply "hydrates" it, making it dynamic. This process is highly efficient and results in a very fast Time to Interactive (TTI).

After hydration, the application behaves like a standard Single-Page Application (SPA). Subsequent navigations are handled by the client-side router without full page reloads.

By combining the instant feedback of a server-rendered page with the rich interactivity of a client-side application, Webs provides a superior user experience out of the box.
