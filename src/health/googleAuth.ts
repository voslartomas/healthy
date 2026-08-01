import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import * as SecureStore from 'expo-secure-store';

import { GOOGLE_HEALTH_SCOPES } from './GoogleHealthApi';
import { setGoogleHealthTokenProvider } from './index';

/**
 * Google OAuth 2.0 (PKCE, no client secret) for the Google Health cloud API.
 *
 * This is the piece that turns the token provider in {@link ./index} on. It runs
 * the Authorization-Code + PKCE flow with `expo-auth-session`, persists the
 * resulting tokens in the platform keychain via `expo-secure-store`, and
 * transparently refreshes the access token when it expires. Nothing here ever
 * writes a secret to source or logs — the client ID is public by design and the
 * PKCE flow uses NO client secret (the reference web dashboard's secret must not
 * ship in a mobile app; HEA-18 blocker note).
 *
 * The mobile OAuth client ID comes from `app.json` → `expo.extra.googleClientId`
 * (or an EAS/app-config override). When it is absent the flow is disabled and
 * {@link ./index.readSnapshot} cleanly renders sample data.
 */

// Google's OpenID endpoints. Hardcoded (rather than fetched) so the flow works
// offline-first and has no discovery round-trip; these are stable.
const DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

const STORE_KEY = 'googleHealth.tokens.v1';

interface StoredTokens {
  accessToken: string;
  refreshToken: string | null;
  /** Epoch ms when the access token expires. */
  expiresAt: number;
}

function clientId(): string | null {
  const id = (Constants.expoConfig?.extra as { googleClientId?: string } | undefined)
    ?.googleClientId;
  return id && id.length > 0 ? id : null;
}

/** True when a mobile OAuth client ID has been provisioned in app config. */
export function isGoogleHealthClientConfigured(): boolean {
  return clientId() != null;
}

function redirectUri(): string {
  // Uses the app's custom scheme ("healthapp://") registered in app.json.
  return AuthSession.makeRedirectUri({ scheme: 'healthapp' });
}

async function loadTokens(): Promise<StoredTokens | null> {
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredTokens;
  } catch {
    return null;
  }
}

async function saveTokens(t: StoredTokens): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(t));
}

function toStored(res: AuthSession.TokenResponse, prevRefresh?: string | null): StoredTokens {
  const expiresInMs = (res.expiresIn ?? 3600) * 1000;
  return {
    accessToken: res.accessToken,
    // Google only returns a refresh token on the first consent; keep the old one.
    refreshToken: res.refreshToken ?? prevRefresh ?? null,
    expiresAt: (res.issuedAt ? res.issuedAt * 1000 : Date.now()) + expiresInMs,
  };
}

/**
 * Run the interactive OAuth consent flow and persist the tokens.
 * Returns true on success. No-op → false when no client ID is configured.
 */
export async function connectGoogleHealth(): Promise<boolean> {
  const id = clientId();
  if (!id) return false;

  const request = new AuthSession.AuthRequest({
    clientId: id,
    scopes: [...GOOGLE_HEALTH_SCOPES],
    redirectUri: redirectUri(),
    usePKCE: true,
    // offline + consent so Google returns a refresh token we can persist.
    extraParams: { access_type: 'offline', prompt: 'consent' },
  });

  const result = await request.promptAsync(DISCOVERY);
  if (result.type !== 'success' || !result.params.code) return false;

  const token = await AuthSession.exchangeCodeAsync(
    {
      clientId: id,
      code: result.params.code,
      redirectUri: redirectUri(),
      extraParams: request.codeVerifier
        ? { code_verifier: request.codeVerifier }
        : undefined,
    },
    DISCOVERY,
  );

  await saveTokens(toStored(token));
  return true;
}

/** Forget the stored Google Health tokens (disconnect). */
export async function disconnectGoogleHealth(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY);
}

/** True when we hold tokens for Google Health (connected). */
export async function isGoogleHealthConnected(): Promise<boolean> {
  return (await loadTokens()) != null;
}

/**
 * Return a valid access token, refreshing it if expired. Null when the user has
 * not connected, no client ID is configured, or a refresh fails (caller then
 * falls back to sample data). Registered as the token provider in {@link init}.
 */
async function getAccessToken(): Promise<string | null> {
  const id = clientId();
  if (!id) return null;

  const stored = await loadTokens();
  if (!stored) return null;

  // Still valid (60s safety margin)?
  if (stored.expiresAt - 60_000 > Date.now()) return stored.accessToken;

  // Expired — refresh if we can.
  if (!stored.refreshToken) return null;
  try {
    const refreshed = await AuthSession.refreshAsync(
      { clientId: id, refreshToken: stored.refreshToken },
      DISCOVERY,
    );
    const next = toStored(refreshed, stored.refreshToken);
    await saveTokens(next);
    return next.accessToken;
  } catch {
    return null;
  }
}

let registered = false;

/**
 * Wire the Google Health token provider into the health layer. Call once on app
 * start (idempotent). Safe when no client ID is configured — the provider just
 * returns null and the app renders sample data.
 */
export function registerGoogleHealthAuth(): void {
  if (registered) return;
  registered = true;
  setGoogleHealthTokenProvider(getAccessToken);
}
