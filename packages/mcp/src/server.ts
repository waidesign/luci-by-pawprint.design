import fs from 'node:fs';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PRODUCT } from '@luci-dev/format';
import { SkillRegistry } from '@luci-dev/skills';
import { TOOLS, handleTool, type ToolDeps } from './tools.js';

/** This package's version, from its package.json. */
export function serverVersion(): string {
  try {
    const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

/** The defaults the `luci-mcp` binary uses: the library plus the user's personal skills, and the current folder. */
export const defaultDeps = (cwd: string = process.cwd()): ToolDeps => ({ registry: new SkillRegistry({ user: true }), cwd });

/** An MCP server with every Luci tool registered. Connect it to a transport to serve. */
export function createServer(deps: ToolDeps = defaultDeps()): McpServer {
  const server = new McpServer(
    { name: PRODUCT.mcpServer, version: serverVersion() },
    {
      capabilities: { tools: {} },
      instructions: `${PRODUCT.name} keeps this project's memory and skills on the user's machine. Start with get_project_context (and get_active_task when resuming). Load skills with load_project_skills only when the task needs them. Tools that write say so; call them only after the user agrees.`
    }
  );
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.input, annotations: tool.annotations },
      async (args: unknown) => handleTool(tool.name, args, deps)
    );
  }
  return server;
}
