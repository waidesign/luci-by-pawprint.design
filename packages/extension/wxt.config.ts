import { defineConfig } from 'wxt';

// Chrome, Manifest V3. Permissions stay minimal: the toolbar is injected only into the tab where the
// user clicks Luci's icon (activeTab + scripting), settings live in extension storage, and `debugger`
// reads exact component states (attached only during a component capture, detached right after).
// No host permissions and no content scripts that run on every page.
//
// LUCI_EXTENSION_TEST=1 builds a test-only copy into .output-test/ that may also script 127.0.0.1 and
// localhost (the local test sites, two origins), because a test can't click the icon to grant activeTab.
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
    description: 'Capture exact design context from any page for your AI coding agent. Everything stays on your machine.',
    permissions: ['activeTab', 'scripting', 'storage', 'debugger'],
    ...(testBuild ? { host_permissions: ['http://127.0.0.1/*', 'http://localhost/*'] } : {}),
    action: { default_title: 'Luci: capture design on this page' }
  }
});
