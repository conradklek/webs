# Introduction to The Webs Framework

Webs is a full-stack JavaScript framework engineered for a new generation of applications: software that is **performant, offline-capable, and intelligent by default**. It is built on an elegant local-first architecture that seamlessly synchronizes a client-side database with the server, enabling an instantaneous user experience, free from network latency and loading spinners.

At its core, Webs is designed to unify three foundational pillars of modern software development, each supported by a sophisticated underlying engine.

### 1. The Local-First Sync Engine: Zero-Latency & Resilient

The cornerstone of a Webs application is its data layer. By treating the user's device as the primary data source, the framework leverages a client-side **IndexedDB** database as the single source of truth for the UI, resulting in a fundamentally faster and more resilient architecture.

- **Zero-Latency UI**: All database operations (`put`, `delete`) execute instantly against the local IndexedDB. The UI never waits for a server roundtrip.
- **Automatic Synchronization**: Changes are committed to a local `outbox` table and seamlessly synchronized to the server-side **SQLite** database in the background via WebSockets. The sync engine intelligently handles connection interruptions and ensures eventual consistency.
- **Effortless Offline Support**: Because the application reads and writes locally, it remains fully functional while offline. Upon reconnection, the sync engine automatically reconciles all pending changes.
- **Real-Time Collaboration**: The server broadcasts changes to all connected clients for a given user, ensuring data is kept in sync across devices in real-time.

### 2. The Integrated AI Suite: Context-Aware Intelligence

Webs treats artificial intelligence as a first-class citizen, providing a complete, server-side suite powered by **Ollama** for building applications with deep contextual understanding of user data.

- **Automated RAG Pipeline**: The framework's file system API is deeply integrated with a **`sqlite-vec`** vector store. When a user's file is written or synchronized, it's automatically chunked, converted to vector embeddings, and indexed. This transforms the user's file system into a searchable, personal knowledge base with zero configuration.
- **Tool-Using Agents**: Define powerful AI agents in simple `.agent.webs` files. Equip them with tools—server-side functions that can interact with the database, file system, or external APIs. The framework manages the entire tool-use loop, streaming text, tool calls, and results back to the client in real-time.
- **Persistent Conversations**: Build stateful, multi-device chat experiences with a single `useConversation` composable. Conversations are automatically persisted to the local database and synced, allowing a user to continue their dialogue seamlessly on any device.

### 3. The Developer Experience: Elegance & Power

Webs is designed for productivity, combining the simplicity of file-based conventions with a powerful, modern reactivity system and rendering engine.

- **File-Based Everything**: Routes, API endpoints, layouts, components, and even AI agents are defined by the structure of your `src` directory. This convention-over-configuration approach eliminates boilerplate.
- **Optimized Rendering**: `.webs` files are compiled into highly optimized JavaScript render functions. These functions generate a **Virtual DOM (VDOM)** representation of your UI, allowing the framework to perform efficient, targeted updates to the actual DOM when state changes.
- **Fine-Grained Reactivity**: At the heart of the framework is a reactivity system inspired by modern best practices. By wrapping state in `state()` or `ref()`, you create reactive data sources. The framework tracks where these sources are used and automatically updates the VDOM—and consequently the DOM—when they change.
