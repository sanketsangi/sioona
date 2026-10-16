import { test } from 'node:test';
import assert from 'node:assert/strict';
import { discoverPages, indexNowPlan, submitIndexNow, inspectOwnership, canonicalOf } from './integration.mjs';

const origin = 'https://sioona.si';
const key = 'synthetic-indexnow-key-1234';
const xml = '<urlset><url><loc>https://sioona.si/</loc></url><url><loc>https://sioona.si/about</loc></url><url><loc>https://sioona.si/llms.txt</loc></url></urlset>';
const response = (text, status = 200, type = 'text/plain') => new Response(text, { status, headers: { 'content-type': type } });

test('normalizes equivalent apex canonical URLs but requires absolute URLs', () => {
  assert.equal(canonicalOf('<link rel="canonical" href="https://sioona.si">'), 'https://sioona.si/');
  assert.equal(canonicalOf('<link rel="canonical" href="/about">'), undefined);
});

test('preview discovers canonical pages but never POSTs or reveals the key', async () => {
  const requests = [];
  const fetchImpl = async (url, options) => { requests.push({ url, options }); return response(xml); };
  const plan = await indexNowPlan({ origin, key, fetchImpl });
  assert.deepEqual(plan.urls, [origin + '/', origin + '/about']);
  assert.equal(plan.mode, 'preview');
  assert.equal(plan.keyConfigured, true);
  assert(!JSON.stringify(plan).includes(key));
  assert(requests.every(request => request.options.method === 'GET'));
});

test('rejects cross-host, credentials, private routes, queries and malformed sitemap without submitting', async () => {
  for (const url of ['https://evil.example/', 'https://user:pass@sioona.si/', origin + '/api/contact', origin + '/?token=x', origin + '/#fragment']) {
    await assert.rejects(discoverPages({ origin, fetchImpl: async () => response(`<urlset><url><loc>${url}</loc></url></urlset>`) }));
  }
  await assert.rejects(discoverPages({ origin, fetchImpl: async () => response('<!DOCTYPE x><urlset/>') }));
  await assert.rejects(discoverPages({ origin, fetchImpl: async () => response('<html>not a sitemap</html>') }));
});

test('submission requires explicit approval and a matching publicly served key', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return response('wrong-key'); };
  await assert.rejects(submitIndexNow({ origin, key, approved: false, fetchImpl }), /explicit/);
  assert.equal(calls.length, 0);
  await assert.rejects(submitIndexNow({ origin, key, approved: true, fetchImpl: async (url, options) => { calls.push({ url, options }); return response(url.endsWith('sitemap.xml') ? xml : 'wrong-key'); } }), /ownership/);
  assert(calls.every(call => call.options.method === 'GET'));
});

test('approved submission verifies all pages then sends one bounded payload; 202 is pending, not indexed', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'POST') return response('', 202);
    if (url.endsWith('sitemap.xml')) return response(xml);
    if (url.endsWith('indexnow-key.txt')) return response(key);
    return response('<html><head><link rel="canonical" href="' + url + '"></head></html>', 200, 'text/html');
  };
  const result = await submitIndexNow({ origin, key, approved: true, fetchImpl });
  const posts = calls.filter(call => call.options.method === 'POST');
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, 'https://api.indexnow.org/indexnow');
  assert.deepEqual(JSON.parse(posts[0].options.body), { host: 'sioona.si', key, keyLocation: origin + '/indexnow-key.txt', urlList: [origin + '/', origin + '/about'] });
  assert.equal(result.status, 'received-pending-key-validation');
  assert.equal(result.indexingConfirmed, false);
});

test('refuses canonical mismatch before submission and reports provider errors', async () => {
  let posts = 0;
  const fetchImpl = async (url, options) => {
    if (options.method === 'POST') { posts++; return response('error', 429); }
    if (url.endsWith('sitemap.xml')) return response(xml);
    if (url.endsWith('indexnow-key.txt')) return response(key);
    return response('<link rel="canonical" href="https://evil.example/">', 200, 'text/html');
  };
  await assert.rejects(submitIndexNow({ origin, key, approved: true, fetchImpl }), /canonical/);
  assert.equal(posts, 0);
});

test('ownership inspection reports presence, never the code or account verification', () => {
  const html = '<meta content="google_fixture_code" name="google-site-verification"><meta name="msvalidate.01" content="bing_fixture_code"><meta name="ahrefs-site-verification" content="ahrefs_fixture_code">';
  assert.deepEqual(inspectOwnership(html), { google: true, bing: true, ahrefs: true });
  assert.deepEqual(inspectOwnership(''), { google: false, bing: false, ahrefs: false });
});

test('provider rejection is reported without retries or a success claim', async () => {
  let posts = 0;
  const fetchImpl = async (url, options) => {
    if (options.method === 'POST') { posts++; return response('', 429); }
    if (url.endsWith('sitemap.xml')) return response(xml);
    if (url.endsWith('indexnow-key.txt')) return response(key);
    return response(`<link rel="canonical" href="${url}">`, 200, 'text/html');
  };
  await assert.rejects(submitIndexNow({ origin, key, approved: true, fetchImpl }), /HTTP 429/);
  assert.equal(posts, 1);
});
