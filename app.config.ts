import { ConfigContext, ExpoConfig } from 'expo/config';

// Dynamic config layered on top of app.json.
//
// `pnpm android` sets APP_VARIANT=dev, which installs the local dev build
// under a separate Android package (cz.dev.healthy) with its own launcher
// name/icon slot, so it lives side-by-side with the production app
// (cz.healthy) that is used daily instead of overwriting it.
//
// Every other entry point (EAS `build-android`/`build-ios`, `pnpm ios`,
// `expo start`) leaves APP_VARIANT unset, so the package stays cz.healthy.
const IS_DEV = process.env.APP_VARIANT === 'dev';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  name: IS_DEV ? 'Healthy Dev' : config.name ?? 'Healthy',
  android: {
    ...config.android,
    package: IS_DEV ? 'cz.dev.healthy' : config.android?.package,
  },
});
