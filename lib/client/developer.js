/**
 * @file Initializes the global developer tools interface.
 * This module creates the `window.__WEBS_DEVELOPER__` object,
 * providing a bridge for external devtools to inspect and interact with the application instance.
 */

import { createLogger } from '../core/logger.js';
/**
 * @typedef {import('../core/core.js').App} App
 */

const logger = createLogger('[DevTools]');
/**
 * @internal
 * @type {App | null}
 */
let appInstance = null;
/**
 * @internal
 * @type {Map<string, Array<Function>>}
 */
const listeners = new Map();

/**
 * @typedef {object} DevToolsEvents
 * @property {(event: string, callback: Function) => void} on - Registers an event listener.
 * @property {(event: string, data: any) => void} emit - Emits an event to all listeners.
 * @property {(event: string, callback: Function) => void} off - Removes a specific event listener.
 */

/**
 * @internal
 * @type {DevToolsEvents}
 */
const events = {
  on(event, callback) {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    const eventListeners = listeners.get(event);
    if (eventListeners) {
      eventListeners.push(callback);
    }
  },

  emit(event, data) {
    listeners.get(event)?.forEach((cb) => cb(data));
  },

  off(event, callback) {
    const eventListeners = listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  },
};

/**
 * Initializes the developer tools global hook.
 * This function should be called when the application is bootstrapping on the client.
 */
export function initDevTools() {
  if (typeof window === 'undefined') {
    return;
  }

  logger.log('Initializing global __WEBS_DEVEVOPER__');

  /**
   * @global
   * @namespace __WEBS_DEVELOPER__
   * @property {(app: App) => void} registerApp - Registers the main application instance.
   * @property {() => App | null} getApp - Retrieves the registered application instance.
   * @property {DevToolsEvents} events - An event emitter for devtools communication.
   */
  // @ts-ignore
  window.__WEBS_DEVELOPER__ = {
    /** @param {App} app */
    registerApp(app) {
      logger.log('Application instance registered with devtools.');
      appInstance = app;
      events.emit('app:init', app);
    },

    getApp() {
      return appInstance;
    },

    events,
  };
}
