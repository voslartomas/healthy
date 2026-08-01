/* global jest */
// Jest manual mock for expo-auth-session. The real module pulls in native
// browser/crypto modules; tests only need it to import cleanly. The interactive
// flow (promptAsync) is never driven under Jest — it resolves to "dismiss".
class AuthRequest {
  constructor(config) {
    this.config = config;
    this.codeVerifier = 'test-verifier';
  }
  async promptAsync() {
    return { type: 'dismiss' };
  }
}

module.exports = {
  AuthRequest,
  makeRedirectUri: jest.fn(() => 'healthapp://redirect'),
  exchangeCodeAsync: jest.fn(async () => ({
    accessToken: 'test-access',
    refreshToken: 'test-refresh',
    expiresIn: 3600,
    issuedAt: Math.floor(Date.now() / 1000),
  })),
  refreshAsync: jest.fn(async () => ({
    accessToken: 'test-access-2',
    expiresIn: 3600,
    issuedAt: Math.floor(Date.now() / 1000),
  })),
};
