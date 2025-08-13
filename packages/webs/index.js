/**
 * @module webs
 * @description A JavaScript Framework
 * This is the main entry point for the framework, exporting all the public APIs
 * for building applications. It includes core functions for app creation,
 * reactivity, state management, and rendering.
 */

// --- Core Application & Routing ---
export { create_app, create_router } from "./runtime-dom.js";
export { render_to_string } from "./runtime-ssr.js";

// --- Reactivity System ---
export { reactive, computed, effect } from "./reactivity.js";

// --- State Management ---
export { create_store } from "./store.js";

// --- Advanced Rendering & VDOM ---
export { h, Fragment, Teleport } from "./renderer.js";

