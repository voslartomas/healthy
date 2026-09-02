// Pin the timezone to UTC BEFORE the worker processes fork (they inherit this
// process.env), so day-boundary logic (startOfLocalDay, nightIndex) is
// deterministic regardless of the machine/CI zone. Setting it in a setup file
// is too late — Node caches the zone before those run.
process.env.TZ = 'UTC';

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest/setup.js'],
};
