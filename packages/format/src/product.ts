/**
 * The product's names in one place, so generated files never hard-code them.
 * Templates use {{PRODUCT_NAME}} and {{COMMAND}}.
 */
export const PRODUCT = {
  name: 'Luci',
  command: 'luci',
  packageName: 'luci',
  /** The project memory folder, inside each project. */
  projectDir: '.luci',
  /** The global folder, inside the home directory. */
  homeDir: '.luci',
  /** Environment variable that relocates the global folder. */
  homeEnv: 'LUCI_HOME',
  mcpServer: 'luci-mcp'
} as const;
