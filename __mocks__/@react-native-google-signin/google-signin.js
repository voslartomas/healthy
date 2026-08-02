/* global jest */
// Jest manual mock for @react-native-google-signin/google-signin. The real
// module is a native module and cannot load under Jest; the interactive
// sign-in flow is never driven in tests.
const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(async () => true),
  signIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
  signOut: jest.fn(async () => null),
  getCurrentUser: jest.fn(() => null),
  getTokens: jest.fn(async () => ({ idToken: null, accessToken: 'test-access' })),
};

module.exports = {
  GoogleSignin,
  statusCodes: {},
};
