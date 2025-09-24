# The Webs Framework

Webs is a full-stack JavaScript framework engineered for a new generation of applications: software that is **performant, offline-capable, and intelligent by default**. It is built on an elegant local-first architecture that seamlessly synchronizes a client-side database with the server, enabling an instantaneous user experience, free from network latency and loading spinners.

At its core, Webs unifies three foundational pillars of modern software development:

1.  **A Local-First Sync Engine**: For a zero-latency, offline-capable UI.
2.  **An Integrated AI Suite**: For building context-aware, intelligent applications.
3.  **An Elegant Developer Experience**: Combining file-based conventions with a powerful reactivity system.

---

### Introduction & Philosophy

Webs is built on the principle that modern applications should be fast and resilient by default. It achieves this with a **local-first architecture**, where the user's device is the primary data source. This eliminates network latency for UI interactions, provides inherent offline support, and simplifies the development of real-time collaborative features through a background sync engine.

### Getting Started

Getting a project running is simple. Webs uses a file-based structure, so creating a page is as easy as adding a `.webs` file to the `src/app` directory. Interactivity is introduced by adding a `<script>` block to your component, defining reactive state with `state()`, and exposing it to your `<template>` through a `setup()` function.

### Components & The Reactivity System

The UI is built from **Single-File Components** (`.webs` files) that encapsulate their own logic, template, and style. The core of a component is the `setup()` function, where you can use lifecycle hooks like `onMounted` and `onUnmounted`.

The reactivity system automatically updates the UI when state changes. It is powered by a few core primitives:

- `state()` or `ref()`: To create reactive data sources.
- `computed()`: To create derived state that caches its value.
- `effect()`: To run side effects in reaction to state changes (this is what powers rendering).
- `store()`: To create centralized, global state for your application.

### Routing & Data Loading

Webs uses a **file-based router**. The file and folder structure inside `src/app` directly maps to your application's URLs. Dynamic routes are created using square brackets (e.g., `[id].webs`), and shared UI is handled via `layout.webs` files. The framework features a client-side router for SPA-like navigation and a powerful `prefetch` server action to load data before a page is rendered.

### Database & File System

The data layer features a client-side **IndexedDB** instance that is automatically synchronized with a server-side **SQLite** database. By marking a table with `sync: true` in your schema, you enable a real-time, resilient data flow managed by the framework's **Sync Engine**. Data can be reactively accessed in components using the `table()` composable. A similar sync-enabled, sandboxed **File System API** is available via the `fs()` utility.

### Server-Side Logic

Webs makes it easy to run code securely on the server. You have two primary options, both colocated within your page components:

1.  **API Route Handlers**: Export functions named after HTTP methods (`post`, `patch`, etc.) to create traditional API endpoints.
2.  **Server Actions**: Export an `actions` object containing functions that can be called from the client like RPCs using the `action()` composable.

### AI & Agents

The integrated AI suite, powered by **Ollama**, is a first-class citizen. A global `ai` service on the client provides access to text generation, semantic search, and more. Composable hooks like `useChat()` and `useAgent()` make building complex AI UIs trivial. The most powerful feature is the ability to define server-side, **tool-using agents** in `.agent.webs` files, allowing the AI to interact with your database, file system, and external APIs.

### Advanced Guides & CLI

The framework includes a powerful **Command-Line Interface (CLI)** for managing your development workflow. `bun run dev` starts a full-featured dev server with an interactive shell, while `bun run start` creates a highly optimized production build, complete with a service worker for offline support. For performance-critical tasks, you can even write native C functions and call them directly from your server-side logic.
