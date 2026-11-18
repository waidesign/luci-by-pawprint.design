import { defineConfig } from 'wxt';

// Chrome, Manifest V3. Permissions stay minimal: the toolbar is injected only into the tab where the
// user clicks Luci's icon (activeTab + scripting), and settings live in extension storage. `debugger`
// is a required permission (Chrome does not allow it in optional_permissions), so Chrome shows its
// debugger warning at install. Luci attaches it only during a capture that needs exact component states
// or responsive widths, and the person can turn its use off in Luci's settings (useDebugger); then Luci
// reads states from stylesheet rules and widths in a hidden frame. No content scripts that run on every page.
//
// LUCI_EXTENSION_TEST=1 builds a test-only copy into .output-test/ with access to all sites and pre-granted
// debugger, because automated headless tests cannot click the extension icon or accept Chrome permission modals.
const testBuild = process.env['LUCI_EXTENSION_TEST'] === '1';
// Tests build into their own folders, never into .output/ (the copy you load in Chrome): rebuilding a
// loaded extension's folder under it breaks it until it is reloaded
const outDir = process.env['LUCI_EXTENSION_OUT_DIR'] ?? (testBuild ? '.output-test' : '.output');

export default defineConfig({
  manifestVersion: 3,
  imports: false,
  outDir,
  manifest: {
    name: 'Luci',
    description: 'Capture the exact design of your running app for your AI coding agent. Everything stays on your machine.',
    permissions: ['activeTab', 'scripting', 'storage', 'debugger'],
    // Connect to luci serve at 127.0.0.1 (any port, e.g. 4545, 4546) to save captures directly into the project.
    // Test build only: all sites, because a test cannot click the icon to grant activeTab, and
    // captureVisibleTab (Pixel mode) needs activeTab or access to all sites
    host_permissions: testBuild
      ? ['<all_urls>']
      : ['http://127.0.0.1/*', 'http://localhost/*'],
    action: { default_title: 'Luci: capture design on this page' }
  }
});
