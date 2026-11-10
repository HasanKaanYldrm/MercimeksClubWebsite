import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import handler from '../api/campaign.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { headers: [{ headers }] } = require('../vercel.json');
const types = {
  html: 'text/html; charset=utf-8',
  css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  jpg: 'image/jpeg'
};

export function createDevServer(api = handler) {
  return createServer(async (req, res) => {
    for (const header of headers) {
      if (header.key !== 'Strict-Transport-Security') res.setHeader(header.key, header.value);
    }
    const path = new URL(req.url, 'http://localhost').pathname;
    if (path === '/api/campaign') return api(req, res);
    const file = path === '/' ? 'index.html' : path === '/admin' ? 'admin.html' : path.slice(1);
    if ((req.method === 'GET' || req.method === 'HEAD') && /^[a-z-]+\.(html|css|js|jpg)$/.test(file)) {
      try {
        const data = await readFile(new URL('../public/' + file, import.meta.url));
        res.setHeader('Content-Type', types[file.split('.').pop()]);
        res.end(req.method === 'HEAD' ? undefined : data);
        return;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          res.writeHead(500).end();
          return;
        }
      }
    }
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Sayfa bulunamadı.');
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const port = Number(process.env.PORT ?? 3000);
  process.env.APP_ORIGIN ??= 'http://localhost:' + port;
  createDevServer().listen(port, 'localhost', () => {
    console.log('Mercimeks Club: ' + process.env.APP_ORIGIN);
  });
}
