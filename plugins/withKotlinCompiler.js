const { withProjectBuildGradle } = require('@expo/config-plugins');

/**
 * Pins the Kotlin COMPILER (the Kotlin Gradle plugin on the root buildscript
 * classpath) to the same version `expo-build-properties` sets as
 * `android.kotlinVersion` in app.json. See ADR-008.
 *
 * Why this exists: the coach's `modules/system-llm` uses ML Kit's GenAI Prompt
 * API (Gemini Nano), and every release of it — with its `genai-common` and
 * `kotlin-stdlib` 2.3 dependencies — is compiled with Kotlin 2.3. React Native
 * 0.86's template asks for `org.jetbrains.kotlin:kotlin-gradle-plugin` with NO
 * version, which resolves to RN's pinned 2.1.20, and a 2.1 compiler refuses to
 * read 2.3 metadata. Because AGP aligns every module's compile classpath with
 * the app's runtime classpath, the 2.3 stdlib reaches ALL modules (Expo's own
 * included), so the compiler has to move for the whole build — a per-module
 * `-Xskip-metadata-version-check` does not contain it.
 *
 * Setting `android.kotlinVersion` alone is not enough: it moves the Kotlin
 * library versions Expo modules use, but not the unversioned compiler classpath
 * entry, leaving a 2.1 compiler reading a 2.3 stdlib — worse than before.
 *
 * Remove once React Native's template ships Kotlin ≥ 2.3.
 */

const LINE = "classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')";

const withKotlinCompiler = (config, { version }) =>
  withProjectBuildGradle(config, cfg => {
    if (cfg.modResults.language !== 'groovy') {
      throw new Error(
        'withKotlinCompiler: expected a groovy build.gradle, got ' +
          cfg.modResults.language,
      );
    }
    const pinned = `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin:${version}')`;
    const src = cfg.modResults.contents;
    if (src.includes(pinned)) return cfg;
    if (!src.includes(LINE)) {
      throw new Error(
        'withKotlinCompiler: could not find the kotlin-gradle-plugin classpath line',
      );
    }
    cfg.modResults.contents = src.replace(LINE, pinned);
    return cfg;
  });

module.exports = withKotlinCompiler;
