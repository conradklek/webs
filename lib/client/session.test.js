import { test, expect, describe, beforeEach, mock, afterEach } from 'bun:test';
import { session } from './session.js';
import * as reactivity from '../core/reactivity.js';

// Since `session.js` depends on the `store` function from `reactivity.js`,
// we mock `store` to create a predictable, non-proxied object for testing.
// This isolates the session logic from the complexities of the reactivity system.
const mockState = { user: null, error: null, isReady: false };
mock.module('../core/reactivity.js', () => ({
  store: mock((config) => {
    // Create a simple object that merges state, getters, and actions.
    const state = config.state();
    const storeInstance = {
      ...state,
    };
    // Bind actions to the store instance so `this` works correctly.
    for (const key in config.actions) {
      storeInstance[key] = config.actions[key].bind(storeInstance);
    }
    // Define getters on the store instance.
    for (const key in config.getters) {
      Object.defineProperty(storeInstance, key, {
        get: () => config.getters[key].call(storeInstance),
      });
    }
    return storeInstance;
  }),
}));

describe('Session Store', () => {
  beforeEach(() => {
    // Reset the store's state before each test
    // Now that we've mocked the store, we can access its properties directly.
    session.user = null;
    session.error = null;

    // Mock global fetch
    global.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 1, email: 'test@example.com' }),
        text: () => Promise.resolve(''),
      }),
    );
  });

  afterEach(() => {
    mock.restore();
  });

  test('initial state should be logged out', () => {
    expect(session.user).toBeNull();
    expect(session.isLoggedIn).toBe(false);
    expect(session.error).toBeNull();
  });

  test('login action should update user on success', async () => {
    await session.login('test@example.com', 'password');
    expect(session.user).not.toBeNull();
    expect(session.user.id).toBe(1);
    expect(session.isLoggedIn).toBe(true);
    expect(session.error).toBeNull();
  });

  test('setUser should correctly update the user state', () => {
    const newUser = { id: 2, email: 'new@user.com', username: 'new' };
    // The mocked store gives us a direct `setUser` method.
    session.setUser(newUser);
    expect(session.user).toEqual(newUser);
    expect(session.isLoggedIn).toBe(true);

    session.setUser(null);
    expect(session.user).toBeNull();
    expect(session.isLoggedIn).toBe(false);
  });
});
