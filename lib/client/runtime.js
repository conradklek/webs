export { createApp, hydrate, router, route } from '../engine/core.js';
export {
  state,
  ref,
  effect,
  computed,
  store,
  isRef,
  RAW_SYMBOL,
} from '../engine/reactivity.js';
export {
  onBeforeMount,
  onMounted,
  onBeforeUpdate,
  onUpdated,
  onUnmounted,
  onReady,
  onPropsReceived,
  provide,
  inject,
} from '../engine/component.js';
export {
  h,
  Text,
  Comment,
  Fragment,
  Teleport,
  createVnode,
} from '../engine/vdom.js';
export { compile, compileCache } from '../engine/compiler.js';

export { db } from './db.client.js';
export { fs } from './fs.client.js';
export { syncEngine } from './sync-engine.js';
export { session } from './session.js';
export { action, table } from './hooks.js';

export { ai, useAgent, useChat } from '../client/ai.client.js';

/**
 * @file Re-exports all public-facing APIs and type definitions for framework consumers.
 * This serves as the main entry point for the client-side bundle.
 */

/** JSDoc Type Definitions for consumers of the framework **/

/**
 * @template T
 * @typedef {import('../engine/reactivity.js').ReactiveProxy<T>} ReactiveProxy
 */
/** @typedef {import('./session.js').User} User */
/** @typedef {import('./session.js').SessionState} SessionState */
/** @typedef {import('./session.js').SessionGetters} SessionGetters */
/** @typedef {import('./session.js').SessionActions} SessionActions */
/** @typedef {import('./session.js').Session} Session */
/** @typedef {import('./hooks.js').TableState} TableState */
/** @typedef {import('./ai.client.js').UseChatReturn} UseChatReturn */
/** @typedef {import('./ai.client.js').UseAgentReturn} UseAgentReturn */
/** @typedef {import('./ai.client.js').ChatMessage} ChatMessage */
/** @typedef {import('./ai.client.js').ToolCall} ToolCall */
/** @typedef {import('./ai.client.js').Chat} Chat */
/** @typedef {import('./ai.client.js').SearchResult} SearchResult */
/** @typedef {import('./ai.client.js').SearchResultMetadata} SearchResultMetadata */
/** @typedef {import('./ai.client.js').AIModel} AIModel */
/** @typedef {import('./ai.client.js').AIModelService} AIModelService */
/** @typedef {import('./ai.client.js').AIService} AIService */
