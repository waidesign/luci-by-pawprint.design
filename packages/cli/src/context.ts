/** Everything a command needs from the outside world, so tests can drive it. */
export interface CliContext {
  cwd: string;
  out: (line?: string) => void;
  err: (line?: string) => void;
  /** Whether stdin is a terminal a person can answer in. */
  isTTY: boolean;
  /** Ask a question and wait for one line. Defaults to reading stdin. */
  ask?: (question: string) => Promise<string>;
  /** Stops a long-running command (serve); without it, Ctrl+C does. */
  signal?: AbortSignal;
  /** PATH string for tests; defaults to process.env.PATH. */
  pathEnv?: string;
  /** Platform for tests; defaults to process.platform. */
  platform?: NodeJS.Platform;
}

export type Command = (args: string[], ctx: CliContext) => Promise<number>;

/** Split args into known flags and the rest; unknown flags are reported. */
export function parseFlags(args: readonly string[], known: readonly string[]): { flags: Set<string>; unknown: string[]; rest: string[] } {
  const flags = new Set<string>();
  const unknown: string[] = [];
  const rest: string[] = [];
  for (const arg of args) {
    if (!arg.startsWith('-')) rest.push(arg);
    else if (known.includes(arg)) flags.add(arg);
    else unknown.push(arg);
  }
  return { flags, unknown, rest };
}

/** True when the arguments ask for help (--help or -h). */
export function isHelp(args: readonly string[]): boolean {
  return args.includes('--help') || args.includes('-h');
}

/**
 * Pick one subcommand's entry from a multi-line help block (like SKILLS_HELP or PACKS_HELP),
 * or return the whole block when no subcommand is named.
 */
export function subcommandHelp(fullHelp: string, cmdName: string, sub?: string): string {
  if (!sub || sub.startsWith('-')) return fullHelp;
  const lines = fullHelp.split('\n');
  const blocks: { names: string[]; lines: string[] }[] = [];
  for (const line of lines) {
    const m = new RegExp(`^  ${cmdName} ([a-z|]+)\\b`).exec(line);
    if (m) {
      blocks.push({ names: m[1]!.split('|'), lines: [line.slice(2)] });
    } else if (blocks.length > 0 && /^\s{4,}/.test(line)) {
      blocks[blocks.length - 1]!.lines.push(line);
    }
  }
  const found = blocks.find(b => b.names.includes(sub));
  return found ? found.lines.join('\n') : fullHelp;
}
