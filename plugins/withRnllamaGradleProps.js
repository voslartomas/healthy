const {
  withGradleProperties,
  withProjectBuildGradle,
} = require('@expo/config-plugins');

/**
 * Durable Android native-build config for the on-device llama.rn coach, applied
 * on every `expo prebuild` so a clean checkout produces a working — and fast —
 * native build without hand-editing the (gitignored) android/ folder.
 *
 * Why the from-source compile is slow, and the knobs that help:
 *
 *  - rnllamaBuildFromSource=true — REQUIRED. Expo's New-Architecture autolinking
 *    merges llama.rn's prebuilt core .so but never compiles its from-source JNI
 *    bridge (librnllama_jni*.so), which loadNative() must dlopen. Without this
 *    the coach fails at runtime with "JSI bindings not installed". The cost is
 *    that llama.cpp is compiled from source on every clean build.
 *
 *  - reactNativeArchitectures — llama.cpp is compiled ONCE PER ABI, so every ABI
 *    roughly adds one full C++ compile. We default to arm64-v8a only (real
 *    devices). Set RNLLAMA_EMULATOR=1 to also build x86_64 for the emulator, or
 *    RNLLAMA_ABIS to pin an explicit list. This ~halves the stuck
 *    `:llama.rn:buildCMakeDebug` step vs. building both.
 *
 *  - ccache — opt-in via RNLLAMA_CCACHE=1 (after `apt install ccache`). Injects a
 *    compiler launcher into every library module's CMake build so unchanged
 *    llama.cpp objects are served from cache, making even clean rebuilds fast.
 *    Gated by the env var so a machine without ccache is never affected.
 *
 *  - org.gradle.* — parallel workers, the build cache, and a larger daemon heap.
 */

/** ABIs to compile. arm64-v8a only by default (real device); emulator/x86_64
 * and arbitrary lists are opt-in so the common case builds the fewest ABIs. */
function resolveAbis() {
  if (process.env.RNLLAMA_ABIS) return process.env.RNLLAMA_ABIS;
  return process.env.RNLLAMA_EMULATOR === '1'
    ? 'arm64-v8a,x86_64'
    : 'arm64-v8a';
}

const PROPS = {
  rnllamaBuildFromSource: 'true',
  reactNativeArchitectures: resolveAbis(),
  // Build-speed defaults (override in android/gradle.properties if needed).
  'org.gradle.jvmargs': '-Xmx4g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8',
  'org.gradle.parallel': 'true',
  'org.gradle.caching': 'true',
  'org.gradle.configureondemand': 'true',
};

function setGradleProperty(items, key, value) {
  const existing = items.find(
    item => item.type === 'property' && item.key === key,
  );
  if (existing) {
    existing.value = value;
  } else {
    items.push({ type: 'property', key, value });
  }
}

/** Marker so the ccache block is injected exactly once (prebuild re-runs plugins
 * against the existing file when not `--clean`). */
const CCACHE_MARKER = '// rnllama-ccache-launcher';

/** Enable ccache for every library module's CMake build when RNLLAMA_CCACHE=1.
 * Read at BUILD time (not prebuild), so toggling the env var takes effect
 * without a re-prebuild; harmless when ccache isn't installed and the var unset. */
const CCACHE_BLOCK = `
${CCACHE_MARKER}
allprojects {
    afterEvaluate { project ->
        if (System.getenv('RNLLAMA_CCACHE') == '1' && project.plugins.hasPlugin('com.android.library')) {
            project.android {
                defaultConfig {
                    externalNativeBuild {
                        cmake {
                            arguments "-DCMAKE_C_COMPILER_LAUNCHER=ccache", "-DCMAKE_CXX_COMPILER_LAUNCHER=ccache"
                        }
                    }
                }
            }
        }
    }
}
`;

function withCcache(config) {
  return withProjectBuildGradle(config, cfg => {
    if (
      cfg.modResults.language === 'groovy' &&
      !cfg.modResults.contents.includes(CCACHE_MARKER)
    ) {
      cfg.modResults.contents += `\n${CCACHE_BLOCK}\n`;
    }
    return cfg;
  });
}

module.exports = function withRnllamaGradleProps(config) {
  const withProps = withGradleProperties(config, cfg => {
    for (const [key, value] of Object.entries(PROPS)) {
      setGradleProperty(cfg.modResults, key, value);
    }
    return cfg;
  });
  return withCcache(withProps);
};
