/**
 * A small static server for the Studio: `libka studio` serves the built app on localhost, because a service worker
 * (offline use, installing the app) needs http and does not run from a file. Only files inside the folder are served,
 * never directory listings; nothing is written.
 */
import { asset } from './assets.ts';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain; charset=utf-8', '.md': 'text/markdown; charset=utf-8',
};

/** Where the Studio is: built in this repository (apps/studio/dist), or shipped in the npm package. */
export const STUDIO_DIST = asset('studio');

export interface Served { url: string; server: Server; close(): Promise<void> }

/** Serves a folder on 127.0.0.1 (port 0: any free port). */
export function serveStatic(dir: string, port = 0): Promise<Served> {
  const base = resolve(dir);
  // a folder with a csp.txt (the Studio's build writes one) gets its policy as a header on its pages, with what a
  // page's own meta tag cannot say: no other site may show it in a frame
  const policyFile = join(base, 'csp.txt');
  const policy = existsSync(policyFile) ? `${readFileSync(policyFile, 'utf8').trim()}; frame-ancestors 'none'` : null;
  const server = createServer((req, res) => {
    let path: string;
    try { path = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    let file = resolve(join(base, path));
    if (file !== base && !file.startsWith(base + sep)) { res.writeHead(403).end(); return; }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file) || req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(404, { 'content-type': 'text/plain' }).end('not found'); return; }
    res.writeHead(200, {
      'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
      // the service worker decides what is cached; the browser asks again every time
      'cache-control': 'no-cache',
      'x-content-type-options': 'nosniff',
      ...(policy && extname(file).toLowerCase() === '.html' ? { 'content-security-policy': policy, 'referrer-policy': 'no-referrer' } : {}),
    });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).pipe(res);
  });
  return new Promise((resolveServed, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address() as AddressInfo;
      resolveServed({ url: `http://127.0.0.1:${actual}/`, server, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}
