const {
  withAndroidManifest,
  withMainActivity,
  AndroidConfig,
} = require('@expo/config-plugins');

/**
 * Config plugin for Android Health Connect (`react-native-health-connect`),
 * applied on every `expo prebuild` so a clean checkout produces a working
 * native build without hand-editing the (gitignored) android/ folder.
 *
 * It injects, into AndroidManifest.xml:
 *  - the health READ permissions for every metric we read + the one WRITE
 *    permission (nutrition), so the app can request them at runtime;
 *  - a `<queries>` entry so the app can see the Health Connect provider package
 *    and the permissions-rationale intent (required on Android 13-);
 *  - the permission-rationale intent-filter on MainActivity, plus the Android
 *    14+ `VIEW_PERMISSION_USAGE` activity-alias, so Health Connect can deep-link
 *    into the app's rationale screen (a store-review requirement).
 *
 * It also raises `minSdkVersion` to 26 (the floor for the Health Connect client).
 */

const READ_PERMISSIONS = [
  'STEPS',
  'HEART_RATE',
  'HEART_RATE_VARIABILITY',
  'RESTING_HEART_RATE',
  'SLEEP',
  'EXERCISE',
  'ACTIVE_CALORIES_BURNED',
  'TOTAL_CALORIES_BURNED',
  'NUTRITION',
  'WEIGHT',
  'BODY_FAT',
].map(t => `android.permission.health.READ_${t}`);

const WRITE_PERMISSIONS = ['android.permission.health.WRITE_NUTRITION'];

const ALL_PERMISSIONS = [...READ_PERMISSIONS, ...WRITE_PERMISSIONS];

const HC_PROVIDER_PACKAGE = 'com.google.android.apps.healthdata';
const RATIONALE_ACTION =
  'androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE';
const VIEW_PERMISSION_USAGE = 'android.intent.action.VIEW_PERMISSION_USAGE';
const HEALTH_PERMISSIONS_CATEGORY =
  'android.intent.category.HEALTH_PERMISSIONS';

/** Add every health permission as a top-level <uses-permission>. */
function addPermissions(manifest) {
  manifest['uses-permission'] = manifest['uses-permission'] ?? [];
  const have = new Set(
    manifest['uses-permission'].map(p => p.$?.['android:name']),
  );
  for (const name of ALL_PERMISSIONS) {
    if (!have.has(name)) {
      manifest['uses-permission'].push({ $: { 'android:name': name } });
    }
  }
}

/** Add a <queries> block so the app can resolve the Health Connect provider and
 * the rationale intent (package visibility, Android 11+). */
function addQueries(manifest) {
  manifest.queries = manifest.queries ?? [];
  manifest.queries.push({
    package: [{ $: { 'android:name': HC_PROVIDER_PACKAGE } }],
    intent: [
      {
        action: [{ $: { 'android:name': RATIONALE_ACTION } }],
      },
    ],
  });
}

/** Attach the rationale intent-filter to MainActivity and add the Android 14+
 * VIEW_PERMISSION_USAGE activity-alias that targets it. */
function addRationaleHandlers(application) {
  const mainActivity = (application.activity ?? []).find(
    a => a.$?.['android:name'] === '.MainActivity',
  );
  if (mainActivity) {
    mainActivity['intent-filter'] = mainActivity['intent-filter'] ?? [];
    const already = mainActivity['intent-filter'].some(f =>
      (f.action ?? []).some(
        a => a.$?.['android:name'] === RATIONALE_ACTION,
      ),
    );
    if (!already) {
      mainActivity['intent-filter'].push({
        action: [{ $: { 'android:name': RATIONALE_ACTION } }],
      });
    }
  }

  application['activity-alias'] = application['activity-alias'] ?? [];
  const hasAlias = application['activity-alias'].some(
    a => a.$?.['android:name'] === 'ViewPermissionUsageActivity',
  );
  if (!hasAlias) {
    application['activity-alias'].push({
      $: {
        'android:name': 'ViewPermissionUsageActivity',
        'android:exported': 'true',
        'android:targetActivity': '.MainActivity',
        'android:permission': 'android.permission.START_VIEW_PERMISSION_USAGE',
      },
      'intent-filter': [
        {
          action: [{ $: { 'android:name': VIEW_PERMISSION_USAGE } }],
          category: [{ $: { 'android:name': HEALTH_PERMISSIONS_CATEGORY } }],
        },
      ],
    });
  }
}

function withHealthConnectManifest(config) {
  return withAndroidManifest(config, cfg => {
    const manifest = cfg.modResults.manifest;
    addPermissions(manifest);
    addQueries(manifest);
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(
      cfg.modResults,
    );
    addRationaleHandlers(application);
    return cfg;
  });
}

// minSdkVersion (Health Connect needs ≥ 26) is raised via the first-party
// `expo-build-properties` plugin in app.json — SDK 57 has no minSdkVersion
// literal in the generated Gradle to patch, so that is the supported path.

const HC_IMPORT =
  'import dev.matinzd.healthconnect.permissions.HealthConnectPermissionDelegate';
const HC_DELEGATE_CALL =
  'HealthConnectPermissionDelegate.setPermissionDelegate(this)';

/**
 * Register the library's permission delegate in MainActivity.onCreate.
 *
 * `react-native-health-connect` creates its permission-request
 * `ActivityResultLauncher` lazily from this call; without it, invoking
 * `requestPermission()` throws a native `UninitializedPropertyAccessException`
 * ("lateinit property requestPermission has not been initialized") and crashes
 * the app. Expo regenerates MainActivity on every prebuild, so we inject the
 * import + the `setPermissionDelegate(this)` call here (idempotently) instead of
 * hand-editing the generated file. It must run in onCreate (before the activity
 * is STARTED) so the ActivityResult registration is valid.
 */
function withHealthConnectMainActivity(config) {
  return withMainActivity(config, cfg => {
    if (cfg.modResults.language !== 'kt') {
      console.warn(
        '[withHealthConnect] MainActivity is not Kotlin; skipping permission-delegate injection',
      );
      return cfg;
    }
    let contents = cfg.modResults.contents;
    if (!contents.includes(HC_IMPORT)) {
      contents = contents.replace(/(^package .*$\n)/m, `$1\n${HC_IMPORT}\n`);
    }
    if (!contents.includes(HC_DELEGATE_CALL)) {
      contents = contents.replace(
        /(super\.onCreate\([^)]*\)\n)/,
        `$1    ${HC_DELEGATE_CALL}\n`,
      );
    }
    cfg.modResults.contents = contents;
    return cfg;
  });
}

module.exports = function withHealthConnect(config) {
  return withHealthConnectMainActivity(withHealthConnectManifest(config));
};
