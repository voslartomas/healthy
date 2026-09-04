import Constants from 'expo-constants';
import PostHog from 'posthog-react-native';

/**
 * Shared PostHog client. The project API key is a public client write key
 * (safe to ship in the bundle), read from app config `extra.posthog` so the
 * value lives alongside the rest of our Expo config rather than in code.
 *
 * If the config is missing (e.g. a stripped build), we fall back to a no-op so
 * analytics never crashes the app — capture/screen calls just do nothing.
 */
type PostHogConfig = { apiKey?: string; host?: string };

const cfg =
  (Constants.expoConfig?.extra?.posthog as PostHogConfig | undefined) ?? {};

export const posthog: PostHog | undefined = cfg.apiKey
  ? new PostHog(cfg.apiKey, {
      host: cfg.host ?? 'https://eu.i.posthog.com',
      // Track app open/background/install/update automatically.
      captureAppLifecycleEvents: true,
      // Flush a little more eagerly than the default so short sessions still
      // report; PostHog batches and also flushes on background.
      flushAt: 20,
      flushInterval: 30_000,
    })
  : undefined;

if (!posthog && __DEV__) {
  console.warn(
    'PostHog: no extra.posthog.apiKey in app config — analytics disabled.',
  );
}
