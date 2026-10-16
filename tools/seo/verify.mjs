/** Disposable fixture verifies findings, bounded crawl, non-submission and CSV math. */
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const out = await mkdtemp(path.join(tmpdir(), 'sioona-seo-test-'));
const requests = [];
let base;
const server = createServer((req, res) => {
  requests.push({ method: req.method, path: req.url });
  if (req.url === '/robots.txt') { res.setHeader('content-type', 'text/plain'); return res.end(`User-agent: *\nAllow: /\nSitemap: ${base}/sitemap.xml`); }
  if (req.url === '/sitemap.xml') { res.setHeader('content-type', 'application/xml'); return res.end(`<urlset><url><loc>${base}/</loc></url><url><loc>${base}/broken</loc></url></urlset>`); }
  if (!['/', '/broken'].includes(req.url)) { res.statusCode = 404; return res.end('missing'); }
  res.setHeader('content-type', 'text/html');
  const broken = req.url === '/broken';
  res.end(`<!doctype html><html lang="en"><title>${broken ? 'Broken' : 'Fixture'}</title><meta name="description" content="${broken ? 'Broken page' : 'Home page'}"><meta property="og:title" content="Fixture"><meta property="og:image" content="${base}/image.png"><link rel="canonical" href="${base}${req.url}">${broken ? '<meta name="robots" content="noindex">' : ''}<main><h1>Fixture</h1><a href="/broken">Broken</a><a href="/api/trap">API</a><a href="/#top">Top</a><a href="/#absent">Missing anchor</a><script type="application/ld+json">${broken ? '{invalid' : '{"@type":"WebSite"}'}</script><script>fetch('/api/trap',{method:'POST'});</script></main></html>`);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
base = `http://127.0.0.1:${server.address().port}`;
async function run(command, args) {
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', d => { output += d; }); child.stderr.on('data', d => { output += d; });
  return new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', code => resolve({ code, output })); });
}
try {
  const result = await run(process.execPath, ['audit.mjs', '--url', base, '--out', path.join(out, 'audit')]);
  assert.equal(result.code, 1, result.output);
  const report = JSON.parse(await readFile(path.join(out, 'audit/audit.json')));
  assert.equal(report.pages.length, 2);
  assert(report.findings.some(f => f.check === 'json-ld'));
  assert(report.findings.some(f => f.check === 'index-directive'));
  assert(report.findings.some(f => f.check === 'anchor'));
  assert(!report.findings.some(f => f.check === 'anchor' && f.detail.endsWith('#top')));
  assert(!requests.some(r => r.method !== 'GET' || r.path.startsWith('/api/')));
  await writeFile(path.join(out, 'queries.csv'), '\ufeffTop queries,Clicks,Impressions,CTR,Position\nfixture,10,"1,000",1%,12\nother,20,200,10%,3\n');
  const gscOut = path.join(out, 'gsc.json');
  const gsc = await run('python3', ['gsc.py', path.join(out, 'queries.csv'), '--out', gscOut]);
  assert.equal(gsc.code, 0, gsc.output);
  const data = JSON.parse(await readFile(gscOut));
  assert.equal(data.rows, 2); assert.equal(data.lowCtrCandidates.length, 1);
  assert.equal(data.nearRankingCandidates.length, 1);
  assert.equal(data.lowCtrCandidates[0].ctr, 0.01);
  await writeFile(path.join(out, 'invalid.csv'), 'Top queries,Clicks,Impressions,CTR,Position\ninvalid,1,100,2%,nan\n');
  assert.notEqual((await run('python3', ['gsc.py', path.join(out, 'invalid.csv'), '--out', gscOut])).code, 0);
  console.log('PASS crawl findings, API/non-GET blocking, screenshots, CSV BOM/quoted numbers/CTR, invalid metric rejection');
  console.log(`Disposable evidence: ${out}`);
} finally { await new Promise(resolve => server.close(resolve)); }
