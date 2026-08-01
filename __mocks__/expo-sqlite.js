/* global jest */
// Jest manual mock for expo-sqlite. The native module has no JS implementation
// under Jest, so we provide an in-memory stub good enough for import-time and
// the goals service tests (which mock the repository directly anyway).
const memoryDb = {
  execAsync: jest.fn().mockResolvedValue(undefined),
  runAsync: jest.fn().mockResolvedValue({ changes: 0, lastInsertRowId: 0 }),
  getAllAsync: jest.fn().mockResolvedValue([]),
  getFirstAsync: jest.fn().mockResolvedValue(null),
  withTransactionAsync: jest.fn(async cb => {
    await cb();
  }),
};

module.exports = {
  openDatabaseAsync: jest.fn().mockResolvedValue(memoryDb),
  __memoryDb: memoryDb,
};
