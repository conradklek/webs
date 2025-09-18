# Webs Framework Architecture

This document provides a high-level overview of the architecture of the Webs framework. It is intended for contributors and anyone interested in understanding the core design principles and how the various components interact.

## High-Level Overview

Webs is a full-stack, file-based JavaScript framework designed for building modern, local-first web applications. Its architecture is divided into several key systems that work in concert:

- **Compiler & Renderer**: Translates `.webs` single-file components into optimized, reactive render functions.
- **Reactivity Engine**: A lightweight, dependency-tracking system for managing application state.
- **Server**: A backend powered by Bun that handles Server-Side Rendering (SSR), API routing, authentication, and real-time data synchronization.
- **Sync Engine**: Orchestrates local-first data persistence and bi-directional synchronization between the client and server.
- **AI Service**: An integrated service for Retrieval-Augmented Generation (RAG) and semantic search over user data.

## Core Concepts

### 1. The Compiler (`/lib/renderer`)

The Webs compiler is a crucial part of the framework's performance and developer experience.

- **Input**: Takes `.webs` Single-File Components (SFCs) containing `<template>`, `<script>`, and `<style>` blocks.
- **Process**: It parses the HTML template into an Abstract Syntax Tree (AST) and then transforms this AST into an intermediate representation optimized for code generation.
- **Output**: Generates a highly optimized JavaScript render function. This function creates a Virtual DOM (VDOM) tree, which is used by the renderer to update the DOM efficiently.
- **Security**: The expression parser is **non-evaluating**, meaning it safely handles template bindings without using `eval()` or `new Function()`, preventing injection vulnerabilities.

### 2. The Reactivity Engine (`/lib/core/reactivity.js`)

The reactivity system is the heart of the framework's state management.

- **Primitives**: It provides core primitives like `state()`, `computed()`, and `effect()`.
- **Mechanism**: It uses a dependency-tracking system based on JavaScript Proxies. When a reactive object's property is accessed within an `effect`, a dependency is registered. When the property is modified, all dependent effects are re-run.
- **Inspiration**: It is inspired by modern reactivity systems but is a custom, lightweight implementation tailored specifically for the Webs framework.

### 3. The Sync Engine (`/lib/client/sync-engine.js`)

Webs is designed with a **local-first** philosophy, and the Sync Engine is the key to this.

- **Client-Side**: On the client, all database mutations (`put`, `delete`) are first written to a local IndexedDB "outbox" table. This makes the UI feel instantaneous, even when offline.
- **Transport**: A persistent WebSocket connection is used for real-time, bi-directional communication with the server.
- **Reconciliation**: The engine sends operations from the outbox to the server one by one. The server processes the operation, updates its own database, and broadcasts the change to all other connected clients for that user. Upon receiving an acknowledgment (`ack`) from the server, the client removes the operation from its outbox.

### 4. The AI Service (`/lib/ai`)

The AI service provides powerful, integrated machine learning capabilities.

- **RAG Pipeline**: It implements a full Retrieval-Augmented Generation (RAG) pipeline. When a user chats with the AI, their query is used to perform a semantic search against a vector store of their own data. The relevant data is then injected into the AI prompt as context, allowing the model to give accurate, context-aware answers.
- **Vector Store**: Uses `sqlite-vec` to create and manage vector embeddings of user files and data, enabling efficient semantic search.
- **Asynchronous Processing**: All computationally expensive AI tasks (like generating embeddings) are offloaded to a dedicated worker process (`ai.worker.js`) to ensure the main server thread remains non-blocking and responsive.
