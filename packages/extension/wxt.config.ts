import { defineConfig } from 'wxt';

// Chrome, Manifest V3. Permissions stay minimal: the toolbar is injected only into the tab where the
// user clicks Luci's icon (activeTab + scripting), and settings live in extension storage. No host
// permissions and no content scripts that run on every page. `debugger` arrives with component
// states in M5.
//
// LUCI_EXTENSION_TEST=1 builds a test-only copy into .output-test/ that may also script 127.0.0.1
// (the local test sites), because a test can't click the toolbar icon to grant activeTab.
const testBuild = process.env['LUCI_EXTENSION_TEST'] === '1';

export default defineConfig({
  manifestVersion: 3,
  imports: false,
  outDir: testBuild ? '.output-test' : '.output',
  manifest: {
    name: 'Luci',
    description: 'Capture exact design context from any page for your AI coding agent. Everything stays on your machine.',
    permissions: ['activeTab', 'scripting', 'storage'],
    ...(testBuild ? { host_permissions: ['http://127.0.0.1/*'] } : {}),
    action: { default_title: 'Luci: capture design on this page' }
  }
});
