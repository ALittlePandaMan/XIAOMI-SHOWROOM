import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve, sep} from 'node:path';

/** A disposable local fixture server; tests do not depend on a running Vite. */
export async function servePublic() {
  const root = resolve('public');
  const server = createServer(async (request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = resolve(root, `.${pathname}`);
    if (!file.startsWith(root + sep)) {
      response.writeHead(403).end();
      return;
    }
    try {
      const bytes = await readFile(file);
      response.writeHead(200, {'Content-Type': 'application/octet-stream'}).end(bytes);
    } catch {
      // Vite/SPA hosts can return HTML with status 200 for a missing asset.
      response.writeHead(200, {'Content-Type': 'text/html'}).end('<!doctype html><title>Fallback</title>');
    }
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  server.unref();
  return {origin: `http://127.0.0.1:${server.address().port}`, close: () => server.close()};
}
