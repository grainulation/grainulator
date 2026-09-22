import { readStaticFile } from "../packages/shared/lib/fs-safe.cjs";
import http from 'node:http';
import { handleResearch } from '../lib/research-http.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const sites = [
  ['Grainulator', path.join(root, 'site'), Number(process.env.GRAINULATOR_PORT || 4517)],
  ['Grainulation', path.resolve(process.env.GRAINULATION_SITE_DIR || path.join(root, '../grainulation-dogfood/site')), Number(process.env.GRAINULATION_PORT || 4518)],
];
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain', '.xml': 'application/xml', '.woff2': 'font/woff2' };
const servers = [];
for (const [label, directory, port] of sites) {
  if (!fs.existsSync(directory)) { console.warn(`${label}: site absent at ${directory}`); continue; }
  const realRoot = fs.realpathSync(directory);
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Content-Type-Options', 'nosniff');
    if (label === 'Grainulator' && await handleResearch(req, res, port)) return;
    if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); res.end('Read-only preview'); return; }
    try {
      let pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      let candidate = path.resolve(realRoot, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
      if (fs.statSync(candidate).isDirectory()) {
        if (!pathname.endsWith('/')) { const previous = new URL(req.url, 'http://localhost'); res.writeHead(301, { Location: pathname + '/' + previous.search }); res.end(); return; }
        candidate = path.join(candidate, 'index.html');
      }
      const resolved = fs.realpathSync(candidate);
      if (!resolved.startsWith(realRoot + path.sep) || !fs.statSync(resolved).isFile()) { res.writeHead(403); res.end('Forbidden'); return; }
      res.setHeader('Content-Type', types[path.extname(resolved)] || 'application/octet-stream');
      if (label === 'Grainulation' && resolved === path.join(realRoot, 'index.html')) {
        const html = readStaticFile(realRoot, resolved).toString("utf8");
        const marker = `<meta name="grainulator-product-port" content="${sites[0][2]}">`;
        res.writeHead(200); res.end(req.method === 'HEAD' ? undefined : html.replace('</head>', `${marker}</head>`)); return;
      }
      res.writeHead(200); if (req.method === 'HEAD') res.end(); else res.end(readStaticFile(realRoot, resolved));
    } catch { res.writeHead(404); res.end('Page not found'); }
  });
  server.on('error', error => { console.error(`${label}: ${error.message}`); for (const s of servers) s.close(); process.exitCode = 1; });
  server.listen(port, '127.0.0.1', () => console.log(`${label} → http://127.0.0.1:${port}`));
  servers.push(server);
}
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { for (const server of servers) server.close(); });
