import { defineConfig, type ConfigEnv, type UserManifest } from 'wxt';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const rootDir = dirname(fileURLToPath(import.meta.url));
const safeWxtBrowser = resolve(rootDir, 'core/browser/safe-wxt-browser.ts');
const CHROMIUM_BROWSERS = new Set(['chrome', 'edge']);
const extensionVersion = readPackageVersion();
const MANIFEST_NAME = '__MSG_extension_name__';
const MANIFEST_DESCRIPTION = '__MSG_extension_description__';
const MANIFEST_ACTION_TITLE = '__MSG_extension_action_title__';
const SANDBOX_CSP = [
  'sandbox allow-scripts',
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval' blob:",
  'worker-src blob:',
  "child-src 'self' blob: data:",
  "frame-src 'self' blob: data:",
  "connect-src 'self' blob:",
  "object-src 'none'",
].join('; ');
const PYODIDE_ASSET_FILES = [
  'pyodide.mjs',
  'pyodide.asm.mjs',
  'pyodide.asm.wasm',
  'python_stdlib.zip',
  'pyodide-lock.json',
];

function readPackageVersion(): string {
  const packageJson = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf-8'));
  return packageJson.version || '0.0.0';
}

function pyodideAssetsPlugin(): Plugin {
  return {
    name: 'deepseek-pp-pyodide-assets',
    apply: 'build',
    generateBundle() {
      const pyodideDir = resolve(rootDir, 'node_modules/pyodide');
      for (const file of PYODIDE_ASSET_FILES) {
        this.emitFile({
          type: 'asset',
          fileName: `pyodide/${file}`,
          source: readFileSync(resolve(pyodideDir, file)),
        });
      }
    },
  };
}

function escapeNonAsciiJavaScript(source: string): string {
  let escaped = '';
  for (const char of source) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined || codePoint <= 0x7f) {
      escaped += char;
      continue;
    }
    escaped += codePoint <= 0xffff
      ? `\\u${codePoint.toString(16).padStart(4, '0')}`
      : toSurrogatePairEscape(codePoint);
  }
  return escaped;
}

function toSurrogatePairEscape(codePoint: number): string {
  const value = codePoint - 0x10000;
  const high = 0xd800 + (value >> 10);
  const low = 0xdc00 + (value & 0x3ff);
  return `\\u${high.toString(16).padStart(4, '0')}\\u${low.toString(16).padStart(4, '0')}`;
}

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  vite: (env) => ({
    plugins: [
      tailwindcss(),
      pyodideAssetsPlugin(),
      {
        name: 'deepseek-pp-escape-non-ascii',
        apply: 'build',
        generateBundle(_, bundle) {
          for (const [fileName, file] of Object.entries(bundle)) {
            if (file.type === 'chunk' && (fileName.endsWith('.js') || fileName.includes('content-scripts/'))) {
              file.code = escapeNonAsciiJavaScript(file.code);
            }
          }
        },
      },
    ],
    resolve: {
      alias: {
        'wxt/browser': safeWxtBrowser,
      },
    },
    optimizeDeps: {
      exclude: ['pyodide'],
    },
  }),
  manifest: (env) => {
    const isChromium = CHROMIUM_BROWSERS.has(env.browser);
    const userManifest: UserManifest = {
      name: MANIFEST_NAME,
      description: MANIFEST_DESCRIPTION,
      version: extensionVersion,
      default_locale: 'en',
      permissions: [
        'sidePanel',
        'storage',
        'contextMenus',
        'declarativeNetRequest',
        'webRequest',
      ],
      action: {
        default_title: MANIFEST_ACTION_TITLE,
      },
      side_panel: {
        default_path: 'sidepanel.html',
      },
      options_ui: {
        page: 'sidepanel.html',
        open_in_tab: true,
      },
      sandbox: {
        pages: ['sandbox-offscreen.html', 'sandbox-runner.html'],
      },
      web_accessible_resources: [
        {
          resources: [
            'sandbox-offscreen.html',
            'sandbox-runner.html',
            'deepseek/sha3_wasm_bg.wasm',
            'pyodide/*',
          ],
          matches: ['<all_urls>'],
        },
      ],
    };

    if (isChromium) {
      userManifest.host_permissions = ['https://*.deepseek.com/*'];
      if (userManifest.web_accessible_resources?.[0]) {
        userManifest.web_accessible_resources[0].matches = ['https://*.deepseek.com/*'];
      }
    } else {
      userManifest.permissions?.push('https://*.deepseek.com/*');
    }

    return userManifest;
  },
});
