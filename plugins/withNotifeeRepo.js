const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Config plugin for `@notifee/react-native`. Notifee doesn't publish its Android
 * artifacts (`app.notifee:core`) to a remote Maven repo — it bundles the `.aar`
 * files inside the npm package. So on every `expo prebuild` we point Gradle's
 * `allprojects` repositories at that local directory, otherwise the build fails
 * with "Could not find any matches for app.notifee:core:+".
 */

const MARKER = '@notifee/react-native/android/libs';
const REPO_LINE =
  '    maven { url "$rootDir/../node_modules/@notifee/react-native/android/libs" }';

const withNotifeeRepo = config =>
  withProjectBuildGradle(config, cfg => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        'withNotifeeRepo: expected a groovy build.gradle, got ' +
          cfg.modResults.language,
      );
    }
    const src = cfg.modResults.contents;
    if (src.includes(MARKER)) return cfg;

    const patched = src.replace(
      /allprojects\s*\{\s*repositories\s*\{/,
      match => `${match}\n${REPO_LINE}`,
    );
    if (patched === src) {
      throw new Error(
        'withNotifeeRepo: could not find the allprojects repositories block',
      );
    }
    cfg.modResults.contents = patched;
    return cfg;
  });

module.exports = withNotifeeRepo;
