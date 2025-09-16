/**
 * @file Manages client-side authentication state.
 */
import { createLogger } from '../core/logger.js';
import { store } from '../core/reactivity.js';

const logger = createLogger('[Session]');

/**
 * @typedef {object} User
 * @property {number} id
 * @property {string} username
 * @property {string} email
 */

/**
 * @typedef {object} SessionState
 * @property {User | null} user
 * @property {string | null} error
 * @property {boolean} isReady
 */

/**
 * @typedef {object} SessionGetters
 * @property {() => boolean} isLoggedIn
 */

/**
 * @typedef {object} SessionActions
 * @property {(credentials: {email: string, username: string, password: string}) => Promise<void>} register
 * @property {(email: string, password: string) => Promise<User | undefined>} login
 * @property {() => Promise<void>} logout
 * @property {(user: User | null) => void} setUser
 */

/**
 * @typedef {import('../core/reactivity.js').ReactiveProxy<SessionState> & SessionGetters & SessionActions} Session
 */

/**
 * The session management object.
 * @type {Session}
 */
export const session = store({
  state: () => ({
    user: null,
    error: null,
    isReady: false,
  }),
  getters: {
    /**
     * @this {SessionState}
     * @returns {boolean}
     */
    isLoggedIn() {
      return !!this.user;
    },
  },
  actions: {
    /**
     * @this {SessionState}
     * @param {User | null} user
     */
    setUser(user) {
      this.user = user || null;
      this.isReady = true;
    },
    /**
     * @this {SessionState & SessionActions}
     * @param {{email: string, username: string, password: string}} credentials
     */
    async register({ email, username, password }) {
      this.error = null;
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, username, password }),
        });
        if (!response.ok)
          throw new Error((await response.text()) || 'Registration failed');
      } catch (err) {
        this.error = /** @type {Error} */ (err).message;
        logger.error('Registration failed:', err);
        throw err;
      }
    },
    /**
     * @this {SessionState & SessionActions}
     * @param {string} email
     * @param {string} password
     * @returns {Promise<User | undefined>}
     */
    async login(email, password) {
      this.error = null;
      try {
        const response = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });
        if (!response.ok)
          throw new Error((await response.text()) || 'Login failed');
        const userData = await response.json();
        this.user = userData;
        return userData;
      } catch (err) {
        this.error = /** @type {Error} */ (err).message;
        logger.error('Login failed:', err);
        throw err;
      }
    },
    /** @this {SessionState & SessionActions} */
    async logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        this.user = null;
        this.error = null;
      } catch (err) {
        logger.error('Logout failed:', err);
      }
    },
  },
});
