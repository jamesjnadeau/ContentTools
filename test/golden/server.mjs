/* Zero-dependency static file server rooted at the repo, so the fixture can
   reference /build/... and /test/golden/... with stable absolute paths. */
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {extname, join, normalize, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../', import.meta.url)));
const PORT = Number(process.env.PORT || 8931);

const TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.woff': 'font/woff',
    // The CMS playground's runtime config; `loadConfig` reads the body as
    // text and does not consult this, but a browser asked to download an
    // octet-stream is a confusing thing to hand a developer.
    '.yml': 'text/yaml; charset=utf-8'
};

createServer(async (req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    // The repo root holds no index.html, so point the bare host somewhere
    // useful instead of 404ing. `/app/` rather than `/playground/`: the app
    // is the deliverable now, and the playground pages are each reachable
    // by name from the line this server prints.
    if (urlPath === '/') {
        res.writeHead(302, {Location: '/app/'}).end();
        return;
    }
    // A directory request resolves to its index.html, as static servers do.
    if (urlPath.endsWith('/')) {
        urlPath += 'index.html';
    }
    // Phase 1 moved build/images/* to src/assets/. The frozen legacy stylesheet
    // still asks for /build/images/<name>, so alias it rather than keeping a
    // duplicate copy of the binaries around.
    urlPath = urlPath.replace(/^\/build\/images\//, '/src/assets/');
    // Contain the served tree; normalize() collapses any ../ before the check.
    const filePath = join(ROOT, normalize(urlPath));
    if (!filePath.startsWith(ROOT)) {
        res.writeHead(403).end('forbidden');
        return;
    }
    try {
        const body = await readFile(filePath);
        res.writeHead(200, {
            'Content-Type': TYPES[extname(filePath)] || 'application/octet-stream',
            'Cache-Control': 'no-store'
        }).end(body);
    } catch {
        res.writeHead(404).end('not found');
    }
}).listen(PORT, () => console.log(
    `serving the repo on http://127.0.0.1:${PORT}/`
    + ' (the CMS at /app/, the playground at /playground/)'));
