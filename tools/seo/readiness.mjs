import { parseArgs } from 'node:util';
import { canonicalOrigin, discoverPages, readPublic, canonicalOf, inspectOwnership, attributes, decode, validateKey } from './integration.mjs';
try {
  const { values } = parseArgs({ options: { origin: { type: 'string', default: 'https://sioona.si' }, url: { type: 'string' }, strict: { type: 'boolean', default: false }, help: { type: 'boolean' } }, allowPositionals: false });
  if (values.help) console.log('node readiness.mjs [--origin https://sioona.si] [--url http://127.0.0.1:3227] [--strict]\nGET-only audit. --url checks a local/HTTPS deployment against the canonical origin. --strict fails on pending ownership hooks too. Presence is not provider account verification.');
  else {
    const origin = canonicalOrigin(values.origin), target = values.url ?? origin;
    const urls = await discoverPages({ origin, target });
    const checks = [], titles = new Set(), descriptions = new Set();
    let ownership;
    for (const url of urls) {
      const result = await readPublic(new URL(new URL(url).pathname, target).href, { accept: 'text/html' });
      const html = result.text, title = decode(html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? '');
      const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
      const description = metas.find(meta => meta.name === 'description')?.content ?? '';
      const issues = [];
      if (result.response.status !== 200) issues.push(`HTTP ${result.response.status}`);
      if (canonicalOf(html) !== url) issues.push('canonical mismatch');
      if (title.length < 35 || title.length > 60 || titles.has(title)) issues.push('title length/uniqueness');
      if (description.length < 120 || description.length > 158 || descriptions.has(description)) issues.push('description length/uniqueness');
      if ((html.match(/<h1\b/gi) ?? []).length !== 1) issues.push('expected one H1');
      titles.add(title); descriptions.add(description);
      checks.push({ url, status: issues.length ? 'fail' : 'pass', issues });
      if (new URL(url).pathname === '/') ownership = inspectOwnership(html);
    }
    for (const [provider, present] of Object.entries(ownership ?? { google: false, bing: false, ahrefs: false })) checks.push({ check: `${provider} verification tag`, status: present ? 'pass' : 'pending', meaning: 'HTML code presence only; confirm ownership in provider account' });
    const key = process.env.INDEXNOW_KEY?.trim();
    if (key) validateKey(key);
    const proof = await readPublic(new URL('/indexnow-key.txt', target).href);
    const configured = proof.response.status === 200 && proof.response.headers.get('content-type')?.startsWith('text/plain') && /^[A-Za-z0-9-]{8,128}$/.test(proof.text.trim());
    checks.push({ check: 'IndexNow ownership endpoint', status: key ? (configured && proof.text.trim() === key ? 'pass' : 'fail') : configured ? 'pass' : proof.response.status === 404 ? 'pending' : 'fail', meaning: key ? 'Compared with local INDEXNOW_KEY; no submission sent' : 'Endpoint shape only; no local key comparison or submission' });
    console.log(JSON.stringify({ origin, target, checks, indexed: 'unknown', externalSubmissions: 0 }, null, 2));
    if (checks.some(check => check.status === 'fail' || (values.strict && check.status === 'pending'))) process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
