const { withAndroidManifest, withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Config plugin that makes the Android Health Connect read path reproducible
 * through Continuous Native Generation (CNG). Everything the `health-connect`
 * native module needs is expressed here so `expo prebuild --clean` regenerates
 * an identical `android/` — nothing is hand-edited in the generated tree.
 *
 * It:
 *   1. declares the Health Connect READ permissions we use,
 *   2. adds the `<queries>` entry so the app can see the Health Connect provider
 *      package (required to call getSdkStatus on Android 11+),
 *   3. bumps the app `minSdkVersion` to 26 (androidx.health.connect requirement).
 *
 * Only READ permissions are declared — the privacy boundary forbids writing the
 * user's health data.
 */

const READ_PERMISSIONS = [
  'android.permission.health.READ_STEPS',
  'android.permission.health.READ_HEART_RATE',
  'android.permission.health.READ_RESTING_HEART_RATE',
  'android.permission.health.READ_HEART_RATE_VARIABILITY',
  'android.permission.health.READ_SLEEP',
  'android.permission.health.READ_EXERCISE',
  'android.permission.health.READ_ACTIVE_CALORIES_BURNED',
  'android.permission.health.READ_HEALTH_DATA_HISTORY',
];

const HEALTH_CONNECT_PACKAGE = 'com.google.android.apps.healthdata';

function withHealthPermissionsAndQueries(config) {
  return withAndroidManifest(config, cfg => {
    const manifest = cfg.modResults.manifest;

    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const name of READ_PERMISSIONS) {
      const exists = manifest['uses-permission'].some(
        p => p.$ && p.$['android:name'] === name,
      );
      if (!exists) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }

    manifest.queries = manifest.queries || [];
    const hasHcPackage = manifest.queries.some(
      q =>
        Array.isArray(q.package) &&
        q.package.some(p => p.$ && p.$['android:name'] === HEALTH_CONNECT_PACKAGE),
    );
    if (!hasHcPackage) {
      manifest.queries.push({
        package: [{ $: { 'android:name': HEALTH_CONNECT_PACKAGE } }],
      });
    }

    return cfg;
  });
}

function withMinSdk26(config) {
  return withAppBuildGradle(config, cfg => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    let contents = cfg.modResults.contents;
    if (contents.includes('Math.max(26')) return cfg; // already applied

    const replaced = contents.replace(
      /minSdkVersion\s+rootProject\.ext\.minSdkVersion/,
      'minSdkVersion Math.max(26, (rootProject.ext.minSdkVersion as int))',
    );
    if (replaced !== contents) {
      cfg.modResults.contents = replaced;
    } else {
      // Fallback: inject into defaultConfig if the default line was not found.
      cfg.modResults.contents = contents.replace(
        /defaultConfig\s*\{/,
        'defaultConfig {\n        minSdkVersion Math.max(26, (rootProject.ext.minSdkVersion as int))',
      );
    }
    return cfg;
  });
}

module.exports = function withHealthConnect(config) {
  return withMinSdk26(withHealthPermissionsAndQueries(config));
};
