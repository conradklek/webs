import { store } from './reactivity.js';
import { createLogger } from './shared.js';

const logger = createLogger('[Session]');

const sessionStore = store({
  state: () => ({ user: null, error: null, isReady: false }),
  getters: {
    isLoggedIn() {
      return !!this.user;
    },
  },
  actions: {
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
        this.error = err.message;
        logger.error('Registration failed:', err);
        throw err;
      }
    },
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
        this.error = err.message;
        logger.error('Login failed:', err);
        throw err;
      }
    },
    async logout() {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        this.user = null;
        this.error = null;
      } catch (err) {
        logger.error('Logout failed:', err);
      }
    },
    setUser(user) {
      this.user = user || null;
      this.isReady = true;
    },
  },
});

export const session = sessionStore;
