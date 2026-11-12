/**
 * Installing Graphify for the code map, only with consent. Graphify is installed with uv
 * (Astral's installer for Python tools, which also sets up Python 3.10+). Nothing here asks
 * questions itself: callers pass `ask`, and without it (no one to answer) nothing is installed.
 * These are the only network calls in this package, and they run only from an explicit
 * command (`luci map --install`).
 */
import { execSync } from 'node:child_process';
import { PRODUCT } from '@luci/format';
import { CodeMap, GRAPHIFY_PACKAGE } from './codeMap.js';
import { findTool, type FoundTool } from './toolLocator.js';

const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

/** Astral's official uv install command for a platform. */
export function uvInstallCommand(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32'
    ? 'powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"'
    : 'curl -LsSf https://astral.sh/uv/install.sh | sh';
}

const runVisible = (command: string) => {
  execSync(command, { stdio: 'inherit', timeout: INSTALL_TIMEOUT_MS });
};

export class GraphifyInstaller {
  readonly platform: NodeJS.Platform;
  private readonly run: (command: string) => void;
  private readonly locate: (name: string) => FoundTool | null;

  constructor(options: { platform?: NodeJS.Platform; run?: (command: string) => void; locate?: (name: string) => FoundTool | null } = {}) {
    this.platform = options.platform ?? process.platform;
    this.run = options.run ?? runVisible;
    this.locate = options.locate ?? findTool;
  }

  /** The uv command, or null when uv is not installed. */
  findUv(): string | null {
    return this.locate('uv')?.command ?? null;
  }

  uvInstallCommand(): string {
    return uvInstallCommand(this.platform);
  }

  /** Install uv with Astral's script. Returns the uv command, or null if it can't be found afterwards. */
  installUv(): string | null {
    this.run(this.uvInstallCommand());
    return this.findUv();
  }

  graphifyInstallCommand(uvCommand = 'uv'): string {
    return `"${uvCommand}" tool install ${GRAPHIFY_PACKAGE}`;
  }

  installGraphify(uvCommand: string): void {
    this.run(this.graphifyInstallCommand(uvCommand));
  }
}

export const CODE_MAP_PITCH = `
Code map (optional, recommended)

Graphify builds a map of how your files and functions connect. AI agents can
look things up in the map instead of reading whole files, which usually saves
tokens on questions about your code.

  - Runs locally: no AI calls, no API keys, free
  - Needs Python 3.10+, set up by uv
  - Skip it now and add it later with: ${PRODUCT.command} map --install
`;

function manualSteps(installer: GraphifyInstaller): string {
  return [
    'To install Graphify yourself:',
    `  1. Install uv:       ${installer.uvInstallCommand()}`,
    `  2. Install Graphify: uv tool install ${GRAPHIFY_PACKAGE}   (or with Python 3.10+: pip install ${GRAPHIFY_PACKAGE})`,
    `  3. Build the map:    ${PRODUCT.command} map --update`,
    ''
  ].join('\n');
}

export interface EnsureResult {
  available: boolean;
  version?: string;
  installed?: boolean;
  declined?: boolean;
  error?: string;
}

export interface EnsureOptions {
  codeMap?: Pick<CodeMap, 'getCliVersion'>;
  installer?: GraphifyInstaller;
  /** Asks a yes/no question; null when no one can answer, which counts as "no". */
  ask?: ((question: string) => Promise<boolean>) | null;
  /** Explain Graphify and ask before installing it. */
  confirmGraphify?: boolean;
  /** Ask before running Astral's uv install script (only when uv is missing). */
  confirmUv?: boolean;
  log?: (line: string) => void;
}

/** Make Graphify available, asking before installing anything. Never throws for a failed install. */
export async function ensureGraphify(options: EnsureOptions = {}): Promise<EnsureResult> {
  const codeMap = options.codeMap ?? new CodeMap();
  const installer = options.installer ?? new GraphifyInstaller();
  const log = options.log ?? (() => {});
  const confirm = async (question: string) => (options.ask ? options.ask(question) : false);

  const existing = codeMap.getCliVersion();
  if (existing) return { available: true, version: existing, installed: false };

  if (options.confirmGraphify ?? true) {
    log(CODE_MAP_PITCH);
    if (!(await confirm('Install Graphify now? (y/N) '))) {
      log(`Skipped Graphify. Add it later with: ${PRODUCT.command} map --install\n`);
      return { available: false, declined: true };
    }
  }

  let uv = installer.findUv();
  if (!uv) {
    log(`\nGraphify is installed with uv, Astral's installer for Python tools (it also sets up Python 3.10+).`);
    log(`uv is not installed yet. ${PRODUCT.name} can install it with Astral's official script:\n  ${installer.uvInstallCommand()}\n`);
    if ((options.confirmUv ?? true) && !(await confirm('Install uv now? (y/N) '))) {
      log(`\nSkipped Graphify.\n${manualSteps(installer)}`);
      return { available: false, declined: true };
    }
    try {
      uv = installer.installUv();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log(`\nCould not install uv: ${message}\n${manualSteps(installer)}`);
      return { available: false, error: message };
    }
    if (!uv) {
      log(`\nuv was installed, but ${PRODUCT.name} cannot find it yet. Open a new terminal and run: ${PRODUCT.command} map --install\n`);
      return { available: false, error: 'uv not found after install' };
    }
  }

  log(`\nInstalling Graphify: ${installer.graphifyInstallCommand(uv)}`);
  try {
    installer.installGraphify(uv);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`\nCould not install Graphify: ${message}\n${manualSteps(installer)}`);
    return { available: false, error: message };
  }

  const version = codeMap.getCliVersion({ refresh: true });
  if (!version) {
    log(`\nGraphify was installed, but ${PRODUCT.name} cannot find it yet. Open a new terminal and run: ${PRODUCT.command} map --update\n`);
    return { available: false, installed: true, error: 'graphify not found after install' };
  }
  log(`Graphify installed (${version})\n`);
  return { available: true, version, installed: true };
}
