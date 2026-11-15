/**
 * Luci's version and where its code lives, for the "v0.3.0" button in every menu.
 *
 * LUCI_VERSION is the one version of Luci: the root package.json and the shipped packages (the luci
 * CLI, the extension, luci-mcp) say the same, and a test checks it. Bump them together.
 */
export const LUCI_VERSION = '0.5.2';

/** The public repository. Null until it is published: the button then shows the version, without a link. */
export const LUCI_REPO_URL: string | null = 'https://github.com/waidesign/luci-by-pawprint.design';
