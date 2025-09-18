export { createApp, hydrate, router, route } from '../core/core.js';
export {
  state,
  ref,
  effect,
  computed,
  store,
  isRef,
  RAW_SYMBOL,
} from '../core/reactivity.js';
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
} from '../core/component.js';
export {
  h,
  Text,
  Comment,
  Fragment,
  Teleport,
  createVnode,
} from '../core/vdom.js';
export { compile, compileCache } from '../renderer/compiler.js';

export { db } from './db.client.js';
export { fs } from './fs.client.js';
export { syncEngine } from './sync-engine.js';
export { session } from './session.js';
export { action, table } from './hooks.js';

export { ai, useConversation } from '../ai/ai.client.js';

/** JSDoc Type Definitions for consumers of the framework **/

/**
 * @template T
 * @typedef {import('../core/reactivity.js').ReactiveProxy<T>} ReactiveProxy
 */

/**
 * @typedef {import('./session.js').User} User
 */

/**
 * @typedef {import('./session.js').SessionState} SessionState
 */

/**
 * @typedef {import('./session.js').SessionGetters} SessionGetters
 */

/**
 * @typedef {import('./session.js').SessionActions} SessionActions
 */

/**
 * @typedef {import('./session.js').Session} Session
 */

/**
 * @typedef {import('./hooks.js').TableState} TableState
 */

/**
 * @template T
 * @typedef {ReactiveProxy<{ data: T | null; isLoading: boolean; error: Error | null; }> & { write: (content: any, options?: import('./fs.client.js').FsOperationOptions) => Promise<void>, rm: (options?: import('./fs.client.js').FsOperationOptions) => Promise<void> }} UseFsState
 */

/**
 * @typedef {'connecting' | 'open' | 'closed'} SocketStatus
 */

/**
 * @typedef {object} SocketState
 * @property {SocketStatus} status - The current status of the WebSocket connection.
 * @property {any} data - The most recent message received from the server.
 * @property {Error | null} error - Any error that occurred with the connection.
 */

/**
 * @typedef {object} UseSocketReturn
 * @property {ReactiveProxy<SocketState>} state - The reactive state of the WebSocket.
 * @property {(data: any) => void} send - A function to send data to the server.
 * @property {() => void} close - A function to manually close the connection.
 */

/**
 * @typedef {import('../ai/ai.client.js').UseConversationReturn} UseConversationReturn
 */
