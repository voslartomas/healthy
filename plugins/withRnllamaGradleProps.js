const { withGradleProperties } = require('@expo/config-plugins');

/**
 * Durable Android gradle.properties for the on-device llama.rn coach, applied on
 * every `expo prebuild` so a clean checkout produces a working native build
 * without hand-editing the (gitignored) android/ folder.
 *
 *  - rnllamaBuildFromSource=true — REQUIRED. Expo's New-Architecture autolinking
 *    merges llama.rn's prebuilt core .so but never compiles its from-source JNI
 *    bridge (librnllama_jni*.so), which loadNative() must dlopen. Without this
 *    the coach fails at runtime with "JSI bindings not installed".
 *  - reactNativeArchitectures=arm64-v8a,x86_64 — keep the (now from-source)
 *    llama.cpp compile tractable by skipping the legacy 32-bit ABIs
 *    (armeabi-v7a, x86). Covers real devices (arm64) and the emulator (x86_64).
 */
const PROPS = {
  rnllamaBuildFromSource: 'true',
  reactNativeArchitectures: 'arm64-v8a,x86_64',
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

module.exports = function withRnllamaGradleProps(config) {
  return withGradleProperties(config, cfg => {
    for (const [key, value] of Object.entries(PROPS)) {
      setGradleProperty(cfg.modResults, key, value);
    }
    return cfg;
  });
};
