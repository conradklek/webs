import { createLogger } from './shared.js';

const logger = createLogger('[DevTools]');
let appInstance = null;
const listeners = new Map();

const events = {
  on(event, callback) {
    if (!listeners.has(event)) {
      listeners.set(event, []);
    }
    listeners.get(event).push(callback);
  },

  emit(event, data) {
    if (listeners.has(event)) {
      listeners.get(event).forEach((cb) => cb(data));
    }
  },

  off(event, callback) {
    if (listeners.has(event)) {
      const eventListeners = listeners.get(event);
      const index = eventListeners.indexOf(callback);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  },
};

export function initDevTools() {
  if (typeof window === 'undefined') {
    return;
  }

  logger.log('Initializing global __WEBS_DEVEVOPER__');

  window.__WEBS_DEVELOPER__ = {
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
