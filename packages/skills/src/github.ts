/**
 * Minimal GitHub access for `luci skills add <github-link>` and `luci skills licenses`,
 * the only commands that use the network, and only when the user runs them.
 * Uses the public API (60 requests/hour without a token); set GITHUB_TOKEN for more.
 */
import { PRODUCT } from '@luci-dev/format';

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

type FetchLike = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
  text(): Promise<string>;
  arrayBuffer(): Promise<ArrayBuffer>;
}>;

export interface RepoTree {
  branch: string;
  blobs: { path: string; size: number }[];
}

export class GitHubClient {
  private readonly fetchImpl: FetchLike;
  private readonly token: string | null;
  private readonly trees = new Map<string, RepoTree | null>();
  private readonly repoLicenses = new Map<string, { spdx: string | null; name: string | null; url: string; text: string } | null>();

  constructor(options: { fetch?: FetchLike; token?: string | null } = {}) {
    this.fetchImpl = options.fetch ?? (globalThis.fetch as unknown as FetchLike);
    this.token = options.token ?? process.env['GITHUB_TOKEN'] ?? null;
  }

  private headers(): Record<string, string> {
    // A generic client name: no user or project details leave the machine
    const h: Record<string, string> = { 'User-Agent': `${PRODUCT.command}-skills`, Accept: 'application/vnd.github+json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /** Every file in a repo, or null. Cached per repo and branch. */
  async tree(repo: string, branch?: string | null): Promise<RepoTree | null> {
    const key = `${repo}@${branch ?? 'default'}`;
    if (this.trees.has(key)) return this.trees.get(key) ?? null;
    let result: RepoTree | null = null;
    const branches = branch ? [branch, 'main', 'master'] : ['main', 'master'];
    for (const b of branches) {
      try {
        const res = await this.fetchImpl(`${API}/repos/${repo}/git/trees/${b}?recursive=1`, { headers: this.headers() });
        if (res.status === 403 || res.status === 429) throw new Error('GitHub API rate limit reached. Set GITHUB_TOKEN and try again.');
        if (!res.ok) continue;
        const data = (await res.json()) as { tree?: { type: string; path: string; size?: number }[] };
        result = { branch: b, blobs: (data.tree ?? []).filter(i => i.type === 'blob').map(i => ({ path: i.path, size: i.size ?? 0 })) };
        break;
      } catch (err) {
        if (err instanceof Error && err.message.includes('rate limit')) throw err;
      }
    }
    this.trees.set(key, result);
    return result;
  }

  /** File text, or bytes with { binary: true }, or null. */
  async raw(repo: string, branch: string, filePath: string): Promise<string | null>;
  async raw(repo: string, branch: string, filePath: string, options: { binary: true }): Promise<Buffer | null>;
  async raw(repo: string, branch: string, filePath: string, options: { binary?: boolean } = {}): Promise<string | Buffer | null> {
    try {
      const res = await this.fetchImpl(`${RAW}/${repo}/${branch}/${filePath.split('/').map(encodeURIComponent).join('/')}`);
      if (!res.ok) return null;
      return options.binary ? Buffer.from(await res.arrayBuffer()) : await res.text();
    } catch {
      return null;
    }
  }

  /** The repository licence as GitHub detects it, or null. Cached per repo. */
  async repoLicense(repo: string): Promise<{ spdx: string | null; name: string | null; url: string; text: string } | null> {
    if (this.repoLicenses.has(repo)) return this.repoLicenses.get(repo) ?? null;
    let result: { spdx: string | null; name: string | null; url: string; text: string } | null = null;
    try {
      const res = await this.fetchImpl(`${API}/repos/${repo}/license`, { headers: this.headers() });
      if (res.status === 403 || res.status === 429) throw new Error('GitHub API rate limit reached. Set GITHUB_TOKEN and try again.');
      if (res.ok) {
        const data = (await res.json()) as { content?: string; license?: { spdx_id?: string; name?: string }; html_url: string };
        const text = data.content ? Buffer.from(data.content, 'base64').toString('utf8') : '';
        result = { spdx: data.license?.spdx_id ?? null, name: data.license?.name ?? null, url: data.html_url, text };
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('rate limit')) throw err;
    }
    this.repoLicenses.set(repo, result);
    return result;
  }
}

/** Parse a GitHub link to a skill: repo root, a folder (tree/...), or a SKILL.md (blob/...). */
export function parseGitHubUrl(url: string): { repo: string; branch: string | null; path: string } | null {
  const m = /^https?:\/\/github\.com\/([^/]+)\/([^/#?]+)(?:\/(tree|blob)\/([^/]+)(?:\/(.*))?)?\/?$/.exec(String(url).trim());
  if (!m?.[1] || !m[2]) return null;
  let p = (m[5] ?? '').replace(/\/$/, '');
  if (p.endsWith('SKILL.md')) p = p.slice(0, -'SKILL.md'.length).replace(/\/$/, '');
  return { repo: `${m[1]}/${m[2].replace(/\.git$/, '')}`, branch: m[4] ?? null, path: p };
}
