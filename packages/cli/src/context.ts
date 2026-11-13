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
