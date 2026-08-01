import { requireNativeModule } from 'expo-modules-core';

/**
 * Local Expo native module `HealthConnect` (Android-only). The typed binding
 * the app actually uses lives in `src/health/HealthConnect.ts`; this default
 * export exists so the module is importable directly if ever needed.
 */
export default requireNativeModule('HealthConnect');
