const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('production auth uses same-origin API proxy and direct socket endpoint', () => {
    const frontend = path.join(__dirname, '..', '..', 'frontend');
    const urls = fs.readFileSync(path.join(frontend, 'src', 'config', 'urls.js'), 'utf8');
    const api = fs.readFileSync(path.join(frontend, 'src', 'utils', 'api.js'), 'utf8');
    const socket = fs.readFileSync(path.join(frontend, 'src', 'composables', 'useSocket.js'), 'utf8');
    const vercel = JSON.parse(fs.readFileSync(path.join(frontend, 'vercel.json'), 'utf8'));

    assert.match(urls, /import\.meta\.env\.PROD\s*\?\s*""/);
    assert.match(urls, /VITE_SOCKET_URL/);
    assert.match(socket, /io\(socketUrl/);
    assert.match(api, /if \(refreshPromise\) return refreshPromise/);
    assert.equal(vercel.rewrites[0].source, '/api/:path*');
    assert.match(vercel.rewrites[0].destination, /^https:\/\/[^/]+\/api\/:path\*$/);
    assert.equal(vercel.headers[0].headers[0].value, 'private, no-store');
});
