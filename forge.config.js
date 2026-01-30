const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Crisper',
    appBundleId: 'com.crisper.app',
    appCategoryType: 'public.app-category.productivity',
    icon: './icon',
    // Ad-hoc signing (no Apple Developer account needed)
    osxSign: {
      identity: '-', // Ad-hoc signing
      optionsForFile: () => ({
        entitlements: './entitlements.mac.plist',
        hardenedRuntime: true,
      }),
    },
    // macOS permission descriptions
    extendInfo: {
      NSMicrophoneUsageDescription: 'Crisper needs microphone access to record audio for transcription.',
      NSAppleEventsUsageDescription: 'Crisper needs automation access to paste transcribed text.',
      NSScreenCaptureUsageDescription: 'Crisper needs screen recording permission for the floating button overlay.',
    },
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
