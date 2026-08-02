# HEA-18 — Provision a native Google OAuth client (owner task)

**Who:** the person holding the owner Google account that owns the `google-health-web-dashboard`
Cloud project.
**Time:** ~5 minutes in the Google Cloud Console. **No code change** — the app already reads the
client ID from `app.json` → `expo.extra.googleClientId` and runs a correct public-client PKCE flow
(`src/health/googleAuth.ts`, no secret anywhere).

## Why not just reuse the web dashboard's client ID

The web dashboard uses a **"Web application"** OAuth client: it ships a `client_secret` and only
accepts `https://…/callback` redirects (see `google-health/src/auth/google-oauth.ts`). A mobile app
is a **public client** — it must ship **no secret** (a secret in a distributable is extractable) and
it redirects to a custom scheme (`healthapp://`). So we provision a **native** client in the **same
project** — same consent screen, same enabled Google Health API, same test users, nothing re-approved.

## Steps

1. Open the **same Google Cloud project** that backs the web dashboard →
   **APIs & Services → Credentials**.
2. **Create Credentials → OAuth client ID → Android**:
   - **Package name:** `com.healthapp`
   - **SHA-1 signing certificate fingerprint:** for a local debug build,
     `keytool -list -v -keystore ~/.android/debug.keystore -alias androiddebugkey -storepass android -keypass android`
     and copy the `SHA1:` line. For a release/EAS build, use that keystore's SHA-1 (or the EAS-managed
     credential's fingerprint from `eas credentials`).
3. **Create Credentials → OAuth client ID → iOS**:
   - **Bundle ID:** `com.healthapp`
4. Confirm the **OAuth consent screen → Scopes** list includes all app scopes. Reads already match the
   web dashboard; the app additionally uses the **write** scope
   `https://www.googleapis.com/auth/googlehealth.nutrition` (non-readonly, for food logging). Add it,
   otherwise food *writes* 403 while reads still work. (Full list: `GOOGLE_HEALTH_SCOPES` in
   `src/health/GoogleHealthApi.ts`.)
5. Ensure a Google account **with health data** is on the consent screen's **Test users** list (or the
   app is published) so consent succeeds.
6. Put the client ID into `app.json`:
   ```json
   "extra": { "googleClientId": "<the-new-native-client-id>.apps.googleusercontent.com" }
   ```
   Keep the value out of git if you prefer — an EAS/app-config env override works too. It is **not** a
   secret (client IDs are public by design), but there is no reason to hardcode it if you'd rather inject it.

## After it's set

Live end-to-end read/write is verifiable: launch the app → Settings → connect → the dashboard renders
real Google Health data instead of the sample snapshot. The only still-unverified path is the food
**write** wire format (the reference dashboard is read-only, so it was never contract-tested); the
payload is isolated in `buildNutritionLogPayload` for a one-function fix if Google rejects it.
