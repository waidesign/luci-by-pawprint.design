# Framework detection: a framework in dependencies or peerDependencies counts; one only in devDependencies counts only when the project shows it (React: .jsx/.tsx sources in src/app/lib, a Vite config or index.html; Vue: .vue files or nuxt.config; Svelte: .svelte files or svelte.config; Next: next.config, pages/ or app/; Angular: angular.json). Luci itself is detected as node again. luci update removes the prototype section an earlier import left in an agent file next to Luci's section (cleanPrototypeSections in importPrototype.ts, the only module allowed to name the prototype); luci doctor warns about it.

- Date: 2026-11-14
- Status: accepted
- Area: brain

## What
Framework detection: a framework in dependencies or peerDependencies counts; one only in devDependencies counts only when the project shows it (React: .jsx/.tsx sources in src/app/lib, a Vite config or index.html; Vue: .vue files or nuxt.config; Svelte: .svelte files or svelte.config; Next: next.config, pages/ or app/; Angular: angular.json). Luci itself is detected as node again. luci update removes the prototype section an earlier import left in an agent file next to Luci's section (cleanPrototypeSections in importPrototype.ts, the only module allowed to name the prototype); luci doctor warns about it.

## Why
User asked what Luci is if not a React app (2026-11-14): a TypeScript monorepo of Node packages (CLI, MCP server, libraries), a Chrome extension and Preact toolbars; react and react-dom are root devDependencies only for the feedback tests. SvelteKit keeps svelte in devDependencies, so the rule needs evidence, not just the dependency field. AGENT_INSTRUCTIONS.md in this repo kept the prototype ai-brain block because the first import did not list that file.

## Alternatives considered
_Not recorded._
