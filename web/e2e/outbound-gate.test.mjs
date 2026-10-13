import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { test } from 'node:test';

const runner = path.join(import.meta.dirname, 'run-guarded.mjs');
// Documentation-only address. Hooks must deny before any network activity.
for (const [runtime, command, source] of [
  ['Node', process.execPath, `const net = require('node:net'); try { net.connect(443, '192.0.2.1'); } catch {} console.log(JSON.stringify({sent:false}));`],
  ['Python', 'python3', `import socket, json\ntry:\n socket.create_connection(('192.0.2.1', 443), timeout=0.1)\nexcept OSError:\n pass\nprint(json.dumps({'sent': False}))`],
]) {
  test(`${runtime}: caught outbound denial still fails the gate`, () => {
    const result = spawnSync(process.execPath, [runner, '--', command, runtime === 'Node' ? '-e' : '-c', source], { encoding: 'utf8' });
    assert.match(result.stdout, /"sent":\s*false/);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Outbound attempts blocked: 1/);
    if (runtime === 'Node') assert.match(result.stderr, /192\.0\.2\.1:443/);
  });
}

const nodeHandler = `
const http = require('node:http');
const server = http.createServer(async (_req, res) => {
  try { await fetch('http://192.0.2.1/'); } catch {}
  res.end(JSON.stringify({sent:false}));
});
server.listen(0, '127.0.0.1', async () => {
  console.log(await (await fetch('http://127.0.0.1:' + server.address().port)).text());
  server.closeAllConnections();
  server.close();
});`;
const pythonHandler = `
import sitecustomize
sitecustomize.require_guard()
import http.server, threading, urllib.request
class Handler(http.server.BaseHTTPRequestHandler):
 def do_GET(self):
  try:
   urllib.request.build_opener(urllib.request.ProxyHandler({})).open('http://192.0.2.1/', timeout=0.1)
  except OSError:
   pass
  self.send_response(200)
  self.end_headers()
  self.wfile.write(b'{"sent":false}')
 def log_message(self, *args):
  pass
server = http.server.HTTPServer(('127.0.0.1', 0), Handler)
thread = threading.Thread(target=server.handle_request)
thread.start()
print(urllib.request.urlopen('http://127.0.0.1:' + str(server.server_port)).read().decode())
thread.join()
server.server_close()
`;
for (const [runtime, command, flag, source] of [
  ['Node fetch', process.execPath, '-e', nodeHandler],
  ['Python urllib', 'python3', '-c', pythonHandler],
]) {
  test(`${runtime}: HTTP handler returns sent:false but the gate fails`, () => {
    const result = spawnSync(process.execPath, [runner, '--', command, flag, source], {
      encoding: 'utf8', timeout: 15_000,
    });
    assert.match(result.stdout, /"sent":\s*false/, result.stderr);
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.stderr, /Outbound attempts blocked: 1/);
  });
}

test('a clean child succeeds without outbound attempts', () => {
  const result = spawnSync(process.execPath, [runner, '--', process.execPath, '-e', 'console.log("clean")'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

// Exercise the OS boundary without runtime hooks on the Linux CI runner.
// These controls deliberately catch the socket error and return HTTP 200.
if (process.env.CB02_TEST_OS_GUARD === '1') {
  for (const [runtime, command, flag, source] of [
    ['Node', process.execPath, '-e', nodeHandler],
    ['Python', 'python3', '-c', pythonHandler.replace('import sitecustomize\nsitecustomize.require_guard()\n', '')],
  ]) {
    test(`${runtime}: OS guard catches attempts without runtime hooks`, () => {
      const env = { ...process.env };
      delete env.NODE_OPTIONS;
      delete env.PYTHONPATH;
      const result = spawnSync('bash', [path.join(import.meta.dirname, 'guard-linux.sh'), command, flag, source], {
        env, encoding: 'utf8', timeout: 30_000,
      });
      assert.match(result.stdout, /"sent":\s*false/, result.stderr);
      assert.equal(result.status, 1, result.stderr);
      assert.match(result.stderr, /CB-02 OS outbound attempts blocked/);
    });
  }
}


if (process.env.CB02_TEST_OS_GUARD === '1') {
  test('Linux guard preserves canonical rehearsal settings in the actual child', () => {
    const values = { SIOONA_STATE_MODE: 'postgres', SIOONA_TAXONOMY_NEON: '1',
      CB10_E2E_DATA_PATH_FILE: '/tmp/cb10-synthetic-data.json',
      CB10_E2E_PREVIOUS_SERVER: '/tmp/cb10-synthetic-previous.json' };
    const keys = Object.keys(values);
    const source = `console.log(JSON.stringify(Object.fromEntries(${JSON.stringify(keys)}.map(k => [k, process.env[k]]))))`;
    const result = spawnSync('bash', [path.join(import.meta.dirname, 'guard-linux.sh'), process.execPath, '-e', source], {
      env: { ...process.env, ...values }, encoding: 'utf8', timeout: 30_000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), values);
  });
}
