const { FusesPlugin } = require('@electron-forge/plugin-fuses');
const { FuseV1Options, FuseVersion } = require('@electron/fuses');
const { execSync } = require('child_process');

module.exports = {
  packagerConfig: {
    asar: true,
    name: 'Crisper',
    appBundleId: 'com.crisper.app',
    appCategoryType: 'public.app-category.productivity',
    icon: './icon',
    // Ad-hoc signing (no Apple Developer account needed)
    osxSign: {
      identity: '-',             // ad-hoc
      hardenedRuntime: false,    // IMPORTANT for ad-hoc
      entitlements: './entitlements.mac.plist',
      entitlementsInherit: './entitlements.mac.plist',
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
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO'
      }
    }
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    // NOTE: Fuses that modify binary integrity checks are disabled for ad-hoc signing
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      // These two fuses break ad-hoc signing - only enable with proper Apple Developer signing
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: false,
      [FuseV1Options.OnlyLoadAppFromAsar]: false,
    }),
  ],
  hooks: {
    postPackage: async (_config, packageResult) => {
      for (const appPath of packageResult.outputPaths) {
        // outputPaths are directories; the .app is inside
        // Forge typically produces something like: <dir>/Crisper.app
        const app = `${appPath}/Crisper.app`;

        execSync(`codesign --force --sign - --deep --timestamp=none "${app}"`, {
          stdio: 'inherit',
        });

        execSync(`codesign --verify --deep --strict --verbose=4 "${app}"`, {
          stdio: 'inherit',
        });
      }
    },
  },
};
