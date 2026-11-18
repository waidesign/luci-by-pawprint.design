// Serves the Recipe Box demo page on http://localhost:<port> (default 8080). No dependencies.
// Usage, from the repository root: node .luci/store-assets/kit/demo/serve.mjs [port]
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const site = path.join(path.dirname(fileURLToPath(import.meta.url)), 'site');
const port = Number(process.argv[2] ?? 8080);
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error(`Not a port: ${process.argv[2]}`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const route = decodeURIComponent((req.url ?? '/').split('?')[0]);
  // One page: "/" is the demo; every other link on it is a dead end, as on a mock-up
  if (route !== '/' && route !== '/index.html') {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end('Not part of the demo.');
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(fs.readFileSync(path.join(site, 'index.html')));
});

server.on('error', (err) => {
  console.error(err.code === 'EADDRINUSE' ? `Port ${port} is in use. Try: node .luci/store-assets/kit/demo/serve.mjs ${port + 1}` : err.message);
  process.exit(1);
});
// Only this machine can reach it
server.listen(port, 'localhost', () => {
  console.log(`Recipe Box demo: http://localhost:${port}/  (Ctrl+C to stop)`);
});
