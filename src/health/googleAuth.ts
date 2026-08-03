import Constants from 'expo-constants';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { Platform } from 'react-native';

import { GOOGLE_HEALTH_SCOPES } from './GoogleHealthApi';
import { setGoogleHealthTokenProvider } from './index';

/**
 * Native Google Sign-In for the Google Health cloud API.
 *
 * Uses the Google Play services auth flow (one-tap consent sheet, no browser,
 * no redirect URI) via `@react-native-google-signin/google-signin`. Access
 * tokens for {@link GOOGLE_HEALTH_SCOPES} are issued and refreshed by Play
 * services, so there is no client secret, no PKCE dance and no refresh-token
 * storage — {@link getAccessToken} just asks the SDK for the current token.
 *
 * Setup requirements (Google Cloud Console):
 *  - An Android OAuth client for package `cz.healthapp` + this build's SHA-1
 *    (debug keystore for dev, Play App Signing for release).
 *  - The OAuth consent screen must list the googlehealth.* scopes, and the
 *    signed-in account must be a test user while the app is unverified.
 * No client ID is needed in app config on Android; `expo.extra.googleWebClientId`
 * is only used for iOS/offline-access if ever provided.
 */

function webClientId(): string | undefined {
  const id = (
    Constants.expoConfig?.extra as { googleWebClientId?: string } | undefined
  )?.googleWebClientId;
  return id && id.length > 0 ? id : undefined;
}

/**
 * iOS OAuth client ID. Required by the native SDK on iOS (in lieu of a
 * GoogleService-Info.plist) so `configure` can resolve the client; must match
 * the reversed-client-id URL scheme registered via the google-signin plugin.
 */
function iosClientId(): string | undefined {
  const id = (
    Constants.expoConfig?.extra as { googleIosClientId?: string } | undefined
  )?.googleIosClientId;
  return id && id.length > 0 ? id : undefined;
}

/** True when native Google sign-in is available on this platform. */
export function isGoogleHealthClientConfigured(): boolean {
  return Platform.OS === 'android' || Platform.OS === 'ios';
}

/**
 * Run the interactive native sign-in flow.
 * Returns true on success, false when the user cancels or Play services is
 * unavailable.
 */
export async function connectGoogleHealth(): Promise<boolean> {
  if (!isGoogleHealthClientConfigured()) return false;
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const response = await GoogleSignin.signIn();
    console.log('[GoogleHealth] signIn response type:', response.type);
    if (response.type !== 'success') return false;
    // Which of the requested scopes did the user actually grant? Missing health
    // scopes here is the usual reason a request 403s ("insufficient
    // authentication scopes"). The nutrition WRITE scope in particular is often
    // absent on first consent.
    let granted = response.data.scopes ?? [];
    console.log('[GoogleHealth] granted scopes:', granted);
    let missing = GOOGLE_HEALTH_SCOPES.filter(s => !granted.includes(s));
    if (missing.length > 0) {
      // signIn reuses the cached grant and won't re-prompt for a scope added
      // later, so explicitly request the missing ones via incremental consent.
      console.warn('[GoogleHealth] requesting missing scopes:', missing);
      try {
        const added = await GoogleSignin.addScopes({ scopes: missing });
        if (added?.type === 'success') granted = added.data.scopes ?? granted;
      } catch (err) {
        console.warn('[GoogleHealth] addScopes failed', err);
      }
      missing = GOOGLE_HEALTH_SCOPES.filter(s => !granted.includes(s));
    }
    if (missing.length > 0) {
      // Still missing after an explicit request → the scope isn't grantable for
      // this account: it must be added to the OAuth consent screen in Cloud
      // Console and the account added as a test user (restricted scope).
      console.warn('[GoogleHealth] STILL missing after addScopes:', missing);
    }
    return true;
  } catch (err) {
    console.warn('Google sign-in failed', err);
    return false;
  }
}

/**
 * Disconnect from Google Health. Revokes the OAuth grant (not just a local
 * sign-out) so that reconnecting forces a fresh consent screen — this is what
 * lets the user grant a newly-added scope (e.g. nutrition write). `signOut`
 * alone keeps the cached grant, so the next sign-in would silently reuse the
 * old (read-only) permissions.
 */
export async function disconnectGoogleHealth(): Promise<void> {
  try {
    await GoogleSignin.revokeAccess();
  } catch {
    // Not signed in, or revoke unsupported — fall through to signOut.
  }
  try {
    await GoogleSignin.signOut();
  } catch {
    // Already signed out.
  }
}

/**
 * Restore a persisted sign-in into the current process.
 *
 * The native SDK keeps the signed-in account across app launches, but
 * `getCurrentUser()` stays null on a fresh start until `signInSilently()` runs —
 * so without this, tokens (and therefore the health snapshot) are unavailable
 * after every restart even though the user is still connected. De-duped via a
 * shared promise so the concurrent startup reads trigger only one silent sign-in;
 * a failed attempt isn't cached, so a later retry (or a fresh connect) can still
 * succeed.
 */
let restoring: Promise<boolean> | null = null;
async function ensureSignedIn(): Promise<boolean> {
  if (GoogleSignin.getCurrentUser() != null) return true;
  if (!restoring) {
    restoring = (async () => {
      try {
        const res = await GoogleSignin.signInSilently();
        return res?.type === 'success' || GoogleSignin.getCurrentUser() != null;
      } catch {
        // No saved credential, or silent sign-in unavailable — treat as signed out.
        return false;
      } finally {
        restoring = null;
      }
    })();
  }
  return restoring;
}

/** True when a user is signed in (connected), restoring a persisted session
 * first so it survives an app restart. */
export async function isGoogleHealthConnected(): Promise<boolean> {
  return ensureSignedIn();
}

/**
 * Return a valid access token for the Google Health scopes, or null when no
 * user is signed in. Restores a persisted session first (so it works on a fresh
 * launch), then Play services refreshes expired tokens transparently.
 */
async function getAccessToken(): Promise<string | null> {
  try {
    if (!(await ensureSignedIn())) return null;
    const { accessToken } = await GoogleSignin.getTokens();
    return accessToken;
  } catch (err) {
    console.warn('Google token fetch failed', err);
    return null;
  }
}

let registered = false;

/**
 * Configure the SDK and wire the token provider into the health layer. Call
 * once on app start (idempotent).
 */
export function registerGoogleHealthAuth(): void {
  if (registered) return;
  registered = true;
  GoogleSignin.configure({
    scopes: [...GOOGLE_HEALTH_SCOPES],
    webClientId: webClientId(),
    iosClientId: iosClientId(),
  });
  setGoogleHealthTokenProvider(getAccessToken);
  // Kick off session restore up-front so the first health read after launch
  // already has a token instead of returning an empty snapshot.
  void ensureSignedIn();
}
