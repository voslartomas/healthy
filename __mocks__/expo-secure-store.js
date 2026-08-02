/* global jest */
// Jest manual mock for expo-secure-store: an in-memory keychain stub so modules
// that persist tokens can be imported and exercised without the native module.
const store = new Map();

module.exports = {
  getItemAsync: jest.fn(async key => (store.has(key) ? store.get(key) : null)),
  setItemAsync: jest.fn(async (key, value) => {
    store.set(key, value);
  }),
  deleteItemAsync: jest.fn(async key => {
    store.delete(key);
  }),
  __store: store,
};
