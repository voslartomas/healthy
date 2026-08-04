/* global jest */
// Jest manual mock for @react-native-google-signin/google-signin. The real
// module is a native module and cannot load under Jest; the interactive
// sign-in flow is never driven in tests.
const GoogleSignin = {
  configure: jest.fn(),
  hasPlayServices: jest.fn(async () => true),
  signIn: jest.fn(async () => ({ type: 'cancelled', data: null })),
  signInSilently: jest.fn(async () => ({ type: 'noSavedCredentialFound' })),
  signOut: jest.fn(async () => null),
  getCurrentUser: jest.fn(() => null),
  getTokens: jest.fn(async () => ({ idToken: null, accessToken: 'test-access' })),
};

module.exports = {
  GoogleSignin,
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
    SIGN_IN_REQUIRED: 'SIGN_IN_REQUIRED',
  },
};
