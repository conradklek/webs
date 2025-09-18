import { state } from '../core/reactivity.js';
import { db } from './db.client.js';
import { onMounted, onUnmounted } from '../core/component.js';

/**
 * @template T
 * @typedef {import('../core/reactivity.js').ReactiveProxy<T>} ReactiveProxy
 */

/**
 * @typedef {ReactiveProxy<{data: any[], isLoading: boolean, error: Error | null}> & {
 * hydrate: (serverData: any[]) => Promise<void>,
 * put: (record: any) => Promise<void>,
 * destroy: (key: any) => Promise<void>
 * }} TableState
 */

/**
 * A composable for calling server-side actions on a component.
 * @param {string} actionName - The name of the action function to call.
 * @param {string} [componentName] - The name of the component where the action is defined.
 */
export function action(actionName, componentName) {
  if (typeof window === 'undefined')
    return { call: () => Promise.resolve(null), state: {} };

  /** @type {import('../core/reactivity.js').ReactiveProxy<{data: any, error: Error | null, isLoading: boolean}>} */
  const s = state({ data: null, error: null, isLoading: false });

  /** @param {any[]} args */
  const call = async (...args) => {
    s.isLoading = true;
    s.error = null;
    s.data = null;
    try {
      const finalCompName =
        componentName ||
        /** @type {any} */ (window).__WEBS_STATE__?.componentName;
      const res = await fetch(`/__actions__/${finalCompName}/${actionName}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(args),
      });
      if (!res.ok)
        throw new Error((await res.text()) || `Action failed: ${res.status}`);
      s.data = await res.json();
    } catch (err) {
      s.error = err instanceof Error ? err : new Error(String(err));
    } finally {
      s.isLoading = false;
    }
  };
  return { call, state: s };
}

/**
 * A composable for interacting with a client-side database table.
 * @param {string} tableName - The name of the database table.
 * @param {any[]} [initialData=[]] - Optional initial data to populate the state.
 * @returns {TableState} A reactive state object with methods to interact with the table.
 */
export function table(tableName, initialData = []) {
  const tableDB = db(tableName);
  if (typeof window === 'undefined') {
    const mock = state({ data: initialData, isLoading: false, error: null });
    const mockWithMethods = /** @type {TableState} */ (
      /** @type {any} */ (mock)
    );
    mockWithMethods.hydrate = async () => {};
    mockWithMethods.put = async () => {};
    mockWithMethods.destroy = async () => {};
    return mockWithMethods;
  }

  const s = state({
    data: initialData || [],
    isLoading: true,
    error: /** @type {Error | null} */ (null),
  });

  const fetchData = async () => {
    try {
      s.isLoading = true;
      s.data = (await tableDB.getAll()) || [];
    } catch (e) {
      s.error = /** @type {Error} */ (e);
    } finally {
      s.isLoading = false;
    }
  };

  const unsubscribe = tableDB.subscribe(fetchData);
  onUnmounted(unsubscribe);

  const sWithMethods = /** @type {TableState} */ (/** @type {any} */ (s));

  /** @param {any[]} serverData */
  sWithMethods.hydrate = async (serverData) => {
    if (serverData && Array.isArray(serverData)) {
      await tableDB.bulkPut(serverData);
    }
    await fetchData();
  };

  sWithMethods.put = tableDB.put;
  sWithMethods.destroy = tableDB.delete;

  onMounted(async () => {
    if (!initialData || initialData.length === 0) {
      await fetchData();
    } else {
      s.isLoading = false;
    }
  });

  return sWithMethods;
}
