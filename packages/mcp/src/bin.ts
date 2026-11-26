#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { PRODUCT } from '@luci-dev/format';
import { createServer } from './server.js';

// stdout carries the protocol, so anything for people goes to stderr
try {
  await createServer().connect(new StdioServerTransport());
  process.stderr.write(`${PRODUCT.mcpServer} is running on stdio for ${process.cwd()}\n`);
} catch (err) {
  process.stderr.write(`${PRODUCT.mcpServer} failed to start: ${err instanceof Error ? err.message : String(err)}\n`);
  process.exit(1);
}
