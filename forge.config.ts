import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import fs from 'fs';
import path from 'path';

/**
 * Issue #14: Remove dev/test files from the bundled python/ directory
 * after Electron Packager copies it to resources/. This reduces installer
 * size and avoids shipping test data, scripts, and documentation.
 *
 * IMPORTANT: This uses afterComplete (not afterCopy) because afterCopy runs on
 * the ASAR app content directory, but python/ is copied to resources/ via
 * extraResource — which happens AFTER afterCopy. afterComplete runs after the
 * entire packaging is done, so resources/python/ exists at that point.
 */
function cleanPythonResourcesAfterComplete(
  buildPath: string,
  _electronVersion: string,
  _platform: string,
  _arch: string,
  callback: (err?: Error) => void
): void {
  // buildPath = final output dir (e.g., out/TourlyAI-win32-x64)
  // extraResource copies python/ to resources/python/
  const pythonDir = path.join(buildPath, 'resources', 'python');
  
  // Directories to remove from the bundled python/ folder
  const dirsToRemove = [
    'tests',        // Unit tests
    'scripts',      // Dev scripts
    'docs',         // Dev documentation
    'data/test_datasets', // Test datasets
    '__pycache__',  // Compiled bytecode
    '.pytest_cache', // pytest cache
    'models',       // Models will be downloaded to userData at runtime
    'venv',         // Should never be here, but just in case
  ];

  // File patterns to remove
  const filePatternsToRemove = [
    'requirements-dev.txt',
    'test_bridge.py',
    '.coverage',
    '.mypy_cache',
    'README.md',
  ];

  try {
    for (const dir of dirsToRemove) {
      const dirPath = path.join(pythonDir, dir);
      if (fs.existsSync(dirPath)) {
        fs.rmSync(dirPath, { recursive: true, force: true });
        console.log(`[forge] Removed dev directory: python/${dir}`);
      }
    }

    for (const file of filePatternsToRemove) {
      const filePath = path.join(pythonDir, file);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`[forge] Removed dev file: python/${file}`);
      }
    }

    // Recursively remove __pycache__ directories
    const removePycache = (dir: string) => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === '__pycache__' || entry.name === '.pytest_cache') {
            fs.rmSync(fullPath, { recursive: true, force: true });
          } else {
            removePycache(fullPath);
          }
        }
      }
    };
    removePycache(pythonDir);

    console.log('[forge] Python resources cleaned for production');
    callback();
  } catch (error) {
    console.warn('[forge] Warning: Failed to clean some python resources:', error);
    callback(); // Don't fail the build for cleanup issues
  }
}

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    // Include Python directory in the package
    extraResource: ['./python'],
    // Issue #14: Remove dev/test files from python/ after packaging completes.
    // Uses afterComplete instead of afterCopy because extraResource copies
    // python/ to resources/ AFTER afterCopy runs — afterCopy would never find it.
    afterComplete: [cleanPythonResourcesAfterComplete],
    // Only bundle the compiled Vite output (.vite/) — mirrors what the Vite plugin
    // sets automatically. Everything else (src/, python/, scripts/, node_modules/,
    // etc.) is excluded from the ASAR to keep the installer lean.
    // Python is included separately via extraResource above.
    ignore: (filepath: string) => {
      if (!filepath) return false;          // include root
      if (filepath.startsWith('/.vite')) return false; // include compiled output
      return true;                          // exclude everything else
    },
    // Cross-platform icon (Electron Forge appends .ico/.icns/.png per platform)
    icon: './resources/icons/icon',
    // App metadata
    appCopyright: 'Copyright © 2025-2026 TourlyAI',
    // macOS: support dark mode title bar
    darwinDarkModeSupport: true,
    // macOS code signing — set these environment variables in CI:
    //   APPLE_ID: your Apple ID email
    //   APPLE_ID_PASSWORD: app-specific password
    //   APPLE_TEAM_ID: your Apple Developer Team ID
    // Uncomment when ready to sign:
    // osxSign: {},
    // osxNotarize: {
    //   appleId: process.env.APPLE_ID!,
    //   appleIdPassword: process.env.APPLE_ID_PASSWORD!,
    //   teamId: process.env.APPLE_TEAM_ID!,
    // },
    win32metadata: {
      CompanyName: 'TourlyAI',
      ProductName: 'TourlyAI',
      FileDescription: 'AI-powered review analysis tool',
    },
    // ──────────────────────────────────────────────────────────────
    // Issue #1: Code Signing (CRITICAL for avoiding SmartScreen)
    // ──────────────────────────────────────────────────────────────
    // Without code signing, ~80% of users will see a SmartScreen warning
    // ("Windows protected your PC") that blocks installation.
    //
    // Windows: Set these environment variables before building:
    //   WINDOWS_CERTIFICATE_FILE=path/to/certificate.pfx
    //   WINDOWS_CERTIFICATE_PASSWORD=your-password
    //
    // To obtain a code signing certificate:
    //   Option 1: Purchase from a CA (DigiCert, Sectigo, etc.) — instant trust
    //   Option 2: Use Azure Trusted Signing (free tier available)
    //   Option 3: Self-signed (for testing only, won't reduce SmartScreen warnings)
    //
    // Test self-signed cert (PowerShell, for dev testing only):
    //   $cert = New-SelfSignedCertificate -Subject "CN=TourlyAI" -Type CodeSigningCert -CertStoreLocation Cert:\CurrentUser\My
    //   Export-PfxCertificate -Cert $cert -FilePath tourlyai-dev.pfx -Password (ConvertTo-SecureString -String "test" -Force -AsPlainText)
    //   $env:WINDOWS_CERTIFICATE_FILE = "tourlyai-dev.pfx"
    //   $env:WINDOWS_CERTIFICATE_PASSWORD = "test"
    // ──────────────────────────────────────────────────────────────
  },
  rebuildConfig: {},
  makers: [
    // Each maker only activates on its native OS — building native installers
    // (.deb, .rpm, .dmg) requires the corresponding OS toolchain.
    // On any other OS, only MakerZIP runs so the build still succeeds.
    ...(process.platform === 'win32' ? [new MakerSquirrel({
      // Windows installer configuration
      name: 'TourlyAI',
      authors: 'victorwkey',
      description: 'AI-powered review analysis tool',
      setupIcon: './resources/icons/icon.ico',
      // Icon shown in Windows "Add/Remove Programs" list.
      // Squirrel.Windows writes this URL to the registry (DisplayIcon).
      // Using the repo's raw icon URL so it works without a local file path at install time.
      iconUrl: 'https://raw.githubusercontent.com/victorwkey/TourlyAI/main/resources/icons/icon.ico',
      // Code signing — set these environment variables in CI or locally:
      //   WINDOWS_CERTIFICATE_FILE: path to .pfx file
      //   WINDOWS_CERTIFICATE_PASSWORD: certificate password
      ...(process.env.WINDOWS_CERTIFICATE_FILE ? {
        certificateFile: process.env.WINDOWS_CERTIFICATE_FILE,
        certificatePassword: process.env.WINDOWS_CERTIFICATE_PASSWORD,
      } : {}),
    })] : []),
    new MakerZIP({}, ['darwin', 'win32', 'linux']),
    ...(process.platform === 'darwin' ? [new MakerDMG({
      // macOS DMG installer
      icon: './resources/icons/icon.icns',
      format: 'ULFO', // ULFO = lzfse compression (fastest, macOS 10.15+)
    })] : []),
    ...(process.platform === 'linux' ? [
      new MakerRpm({
        options: {
          homepage: 'https://github.com/victorwkey/TourlyAI',
          description: 'AI-powered desktop application for analyzing reviews using NLP, sentiment analysis, and LLMs',
          productDescription: 'TourlyAI uses NLP, sentiment analysis, and local/cloud LLMs to analyze tourism reviews and generate strategic insights.',
          categories: ['Science', 'Utility', 'Development'],
          icon: './resources/icons/icon.png',
        },
      }),
      new MakerDeb({
        options: {
          maintainer: 'victorwkey',
          homepage: 'https://github.com/victorwkey/TourlyAI',
          description: 'AI-powered desktop application for analyzing reviews using NLP, sentiment analysis, and LLMs',
          categories: ['Science', 'Utility', 'Development'],
          icon: './resources/icons/icon.png',
          section: 'utils',
        },
      }),
    ] : []),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
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
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'victorwkey',
        name: 'TourlyAI',
      },
      prerelease: false,
      draft: true, // Creates a draft release so you can review before publishing
    }),
  ],
};

export default config;
