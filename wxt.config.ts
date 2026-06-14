import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  srcDir: '.',
  entrypointsDir: 'entrypoints',
  manifest: {
    name: 'DeepSeek++',
    permissions: [
      'sidePanel',
      'storage',
      'contextMenus',
      'declarativeNetRequest',
      'webRequest',
    ],
    side_panel: {
      default_path: 'entrypoints/sidepanel/index.html',
    },
    options_ui: {
      page: 'entrypoints/sidepanel/index.html',
      open_in_tab: true,
    },
    host_permissions: ['https://*.deepseek.com/*'],
    web_accessible_resources: [
      {
        resources: ['deepseek/sha3_wasm_bg.wasm'],
        matches: ['https://*.deepseek.com/*'],
      },
    ],
  },
});
