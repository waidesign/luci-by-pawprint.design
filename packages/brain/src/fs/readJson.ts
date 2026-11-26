import fs from 'node:fs';
import { parseJsonText } from '@luci-dev/format';

/**
 * Read a JSON file written by people or other tools. A UTF-8 byte-order mark is
 * stripped first (Windows editors and PowerShell often add one). Throws when the
 * file is missing or not valid JSON.
 */
export function readJsonFile(file: string): unknown {
  const result = parseJsonText(fs.readFileSync(file, 'utf8'));
  if (!result.ok) throw new Error(`${file} is ${result.error}`);
  return result.value;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
