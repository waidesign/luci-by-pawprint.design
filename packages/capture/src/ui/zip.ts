/**
 * A minimal .zip writer for a section's files (a section file and its component files): files are
 * stored, not compressed (Markdown is small), so no compression library is needed. UTF-8 names,
 * CRC-32, one central directory. Pure and browser-safe.
 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  /** A relative path with forward slashes. */
  name: string;
  data: Uint8Array | string;
}

/** The archive's bytes. Throws on an unsafe or repeated name. */
export function zip(entries: readonly ZipEntry[], date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1);
  const day = ((Math.max(1980, date.getFullYear()) - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const seen = new Set<string>();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || /^\/|\\|(^|\/)\.\.(\/|$)/.test(entry.name)) throw new Error(`not a safe file name in a zip: ${entry.name}`);
    if (seen.has(entry.name)) throw new Error(`two files named ${entry.name}`);
    seen.add(entry.name);
    const name = enc.encode(entry.name);
    const data = typeof entry.data === 'string' ? enc.encode(entry.data) : entry.data;
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const l = new DataView(local.buffer);
    l.setUint32(0, 0x04034b50, true); // local file header
    l.setUint16(4, 20, true); // version needed: 2.0
    l.setUint16(6, 0x0800, true); // flags: UTF-8 names
    l.setUint16(8, 0, true); // method: stored
    l.setUint16(10, time, true);
    l.setUint16(12, day, true);
    l.setUint32(14, crc, true);
    l.setUint32(18, data.length, true);
    l.setUint32(22, data.length, true);
    l.setUint16(26, name.length, true);
    local.set(name, 30);

    const dir = new Uint8Array(46 + name.length);
    const d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true); // central directory header
    d.setUint16(4, 20, true); // made by
    d.setUint16(6, 20, true); // version needed
    d.setUint16(8, 0x0800, true);
    d.setUint16(10, 0, true);
    d.setUint16(12, time, true);
    d.setUint16(14, day, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, data.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true); // where the local header starts
    dir.set(name, 46);

    parts.push(local, data);
    central.push(dir);
    offset += local.length + data.length;
  }
  const dirSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true); // end of central directory
  e.setUint16(8, central.length, true);
  e.setUint16(10, central.length, true);
  e.setUint32(12, dirSize, true);
  e.setUint32(16, offset, true);

  const out = new Uint8Array(offset + dirSize + end.length);
  let at = 0;
  for (const p of [...parts, ...central, end]) { out.set(p, at); at += p.length; }
  return out;
}

/** The files of a stored-only archive (for tests and checks): name -> text. */
export function unzipStored(bytes: Uint8Array): Record<string, string> {
  const dec = new TextDecoder();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out: Record<string, string> = {};
  let at = 0;
  while (at + 30 <= bytes.length && view.getUint32(at, true) === 0x04034b50) {
    const size = view.getUint32(at + 18, true);
    const nameLength = view.getUint16(at + 26, true);
    const name = dec.decode(bytes.subarray(at + 30, at + 30 + nameLength));
    const start = at + 30 + nameLength;
    out[name] = dec.decode(bytes.subarray(start, start + size));
    at = start + size;
  }
  return out;
}
