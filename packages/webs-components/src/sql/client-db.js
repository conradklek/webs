export default {
  version: 1,
  upgrade(db, oldVersion) {
    console.log(
      `[App] Upgrading IndexedDB from version ${oldVersion} to ${this.version}`,
    );
    if (!db.objectStoreNames.contains('todos')) {
      db.createObjectStore('todos', { keyPath: 'id' });
    }
  },
};
