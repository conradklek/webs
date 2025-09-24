# Routing & Data Loading

Webs employs a file-based routing system that maps the structure of your `src/app` directory to the application's URL structure. This convention-over-configuration approach eliminates the need for manual routing configuration.

## Page Routes

Every `.webs` file within `src/app` that is not a `layout.webs` file becomes a page.

- `src/app/index.webs` -> `/`
- `src/app/about.webs` -> `/about`
- `src/app/dashboard/settings.webs` -> `/dashboard/settings`

### Dynamic Routes

To create routes with dynamic parameters, use square brackets in the filename. The captured parameter is made available to the component in the `setup` function's context.

- `src/app/posts/[id].webs` -> will match `/posts/123`, `/posts/my-first-post`, etc.

**`src/app/posts/[id].webs`**

```html
<script>
  export default {
    setup(props, { params }) {
      // For a URL like /posts/123, params will be { id: '123' }
      const postId = params.id;
      return { postId };
    },
  };
</script>
```

## Layouts

Shared UI structures can be defined by creating a `layout.webs` file. This layout will automatically wrap all sibling pages and pages in subdirectories. Page content is rendered into the layout's `<slot>` element. Layouts can be nested.

**`src/app/dashboard/layout.webs`**

```html
<template>
  <div class="dashboard-grid">
    <aside class="sidebar">...</aside>
    <main class="content">
      <!-- The content for the active page is rendered here -->
      <slot></slot>
    </main>
  </div>
</template>
```

## Client-Side Navigation

The framework includes a client-side router that intercepts navigation to provide a fluid, single-page application experience. When a user clicks an internal `<a>` tag, the router prevents a full-page reload. Instead, it makes a special request to the server with an `X-Webs-Navigate: true` header. The server recognizes this header and sends back a JSON payload containing the necessary data for the destination page, which the client then uses to update the view.

### Programmatic Navigation

To navigate programmatically (e.g., after a form submission), import and use the `router` object.

```javascript
import { router } from '@conradklek/webs';

async function handleFormSubmit() {
  // ... submission logic ...
  await router.push('/dashboard');
}
```

## Page Data Loading with `prefetch`

To fetch data on the server before a page component is rendered, export a special server action named `prefetch`. This function is executed by the server in two scenarios:

1.  During the initial Server-Side Rendering (SSR) of the page.
2.  When a user triggers a client-side navigation to the page.

The object returned by `prefetch` is serialized and delivered to your component as the `initialState` prop, making it the canonical method for page-level data fetching.

**`src/app/posts/[id].webs`**

```html
<script>
  import { state } from '@conradklek/webs';

  // This `actions` object and its contents run exclusively on the server.
  export const actions = {
    async prefetch({ db, params, user }) {
      // The context contains the database instance, route params, and user session.
      const post = db
        .query('SELECT * FROM posts WHERE id = ? AND user_id = ?')
        .get(params.id, user.id);
      return { post }; // This object gets passed to props.initialState
    },
  };

  export default {
    props: {
      initialState: { default: () => ({}) },
    },
    setup(props) {
      // Hydrate the component's state with the server-fetched data.
      const post = state(props.initialState.post || null);
      return { post };
    },
  };
</script>

<template>
  {#if post}
  <h1>{{ post.title }}</h1>
  <article>{{ post.content }}</article>
  {:else}
  <p>Post not found.</p>
  {/if}
</template>
```
