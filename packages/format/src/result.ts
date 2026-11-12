/** What every parser in this package returns: the value, or a readable reason it failed. */
export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export const ok = <T>(value: T): ParseResult<T> => ({ ok: true, value });
export const fail = <T = never>(error: string): ParseResult<T> => ({ ok: false, error });

/** Remove a UTF-8 byte-order mark. Windows editors and PowerShell often add one. */
export function stripBom(text: string): string {
  return text.replace(/^﻿/, '');
}

/** Text with Windows line endings and a byte-order mark normalised away. */
export function normalizeText(text: string): string {
  return stripBom(text).replace(/\r\n/g, '\n');
}

/** JSON.parse that tolerates a byte-order mark and explains a failure. */
export function parseJsonText(text: string): ParseResult<unknown> {
  try {
    return ok(JSON.parse(stripBom(text)) as unknown);
  } catch (err) {
    return fail(`not valid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
}
