// This file defines the schema for the client-side IndexedDB.
// The framework will automatically import and use this configuration.

export default {
  version: 1, // Increment this version number to trigger an upgrade.

  /**
   * @param {IDBDatabase} db The database instance.
   * @param {number} oldVersion The previous version number.
   */
  upgrade(db, oldVersion) {
    console.log(
      `[App] Upgrading IndexedDB from version ${oldVersion} to ${this.version}`,
    );

    // Create the 'todos' object store if it doesn't exist.
    // This is where the application's data will be stored locally.
    if (!db.objectStoreNames.contains('todos')) {
      db.createObjectStore('todos', { keyPath: 'id' });
    }
  },
};
