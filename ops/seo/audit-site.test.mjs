import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePage, searchOpportunities, runAudit } from './audit-site.mjs';
import { mkdtemp, writeFile, mkdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const validHtml = `<html><head><title>Conversation Intelligence for Teams | Sioona</title><meta name="description" content="Analyze customer conversations for churn risk, buying intent and upsell opportunities. Review source evidence with your team before taking action."><link rel="canonical" href="https://example.test/about">${['en-IN', 'en-US', 'x-default'].map(lang => `<link rel="alternate" hreflang="${lang}" href="https://example.test/about">`).join('')}<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@graph': [
  { '@type': 'Organization', '@id': 'https://example.test/#org', name: 'Sioona', url: 'https://example.test' },
  { '@type': 'WebSite', name: 'Sioona', url: 'https://example.test' },
  { '@type': 'Service', name: 'Sioona', serviceType: 'Conversation intelligence', provider: { '@id': 'https://example.test/#org' } },
  { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'About', item: 'https://example.test/about' }] },
] })}</script></head><body><main><h1>About Sioona</h1><h2>Human review</h2><a href="/contact">Request a pilot</a></main></body></html>`;

test('accepts the SEO contract and catches malformed metadata, hierarchy and JSON-LD', () => {
  assert.deepEqual(validatePage(validHtml, '/about', 'https://example.test').issues, []);
  const broken = validHtml.replace('<h2>', '<h3>').replace('</h2>', '</h3>').replace('<h1>About Sioona</h1>', '<h1>About</h1><h1>Duplicate</h1>').replace('<title>Conversation Intelligence for Teams | Sioona</title>', '<title>Short</title>').replace('rel="canonical"', 'rel="missing"').replace('"@graph":', '"@graph" BROKEN:');
  const codes = validatePage(broken, '/about', 'https://example.test').issues.map(issue => issue.code);
  for (const code of ['title-length', 'h1-count', 'heading-hierarchy', 'canonical', 'jsonld-parse', 'schema-missing']) assert.ok(codes.includes(code), code);
  const dangling = validHtml.replace('"provider":{"@id":"https://example.test/#org"}', '"provider":{"@id":"https://example.test/#absent"}');
  assert.ok(validatePage(dangling, '/about', 'https://example.test').issues.some(issue => issue.code === 'schema-reference'));
});

test('filters genuine GSC opportunities without making volume estimates', () => {
  const row = (impressions, position, ctr = 0.01) => ({ keys: ['chat analysis', 'https://example.test/about', 'ind'], impressions, position, ctr, clicks: 1 });
  const result = searchOpportunities([row(100, 8), row(49, 8), row(100, 21), row(300, 12)]);
  assert.deepEqual(result.map(item => item.impressions), [300, 100]);
  assert.equal(result[0].country, 'ind');
  assert.equal(result[0].query, 'chat analysis');
  assert.equal(result[0].volume, undefined);
});

test('build audit reports missing routes and skipped credentials honestly', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sioona-seo-test-'));
  try {
    await mkdir(join(dir, 'build'));
    await writeFile(join(dir, 'build/index.html'), validHtml);
    const report = await runAudit({ SEO_BUILD_DIR: join(dir, 'build'), SEO_CANONICAL_ORIGIN: 'https://example.test', SEO_REPORT_DIR: join(dir, 'reports') });
    assert.equal(report.pages.length, 9);
    assert.ok(report.findings.some(item => item.code === 'fetch'));
    assert.ok(report.findings.some(item => item.code === 'discovery'));
    assert.equal(report.searchConsole.status, 'skipped');
    assert.equal(report.crux.status, 'skipped');
    assert.ok(report.performance.every(row => row.pageSpeed.status === 'skipped'));
    assert.match(await readFile(join(dir, 'reports/seo-audit-report.md'), 'utf8'), /coverage gaps/);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test('GSC rows use read-only query requests and secrets never enter reports', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sioona-seo-gsc-'));
  const originalFetch = globalThis.fetch;
  const token = 'synthetic-test-access-token';
  let queries = 0;
  globalThis.fetch = async (url, options) => {
    assert.match(String(url), /webmasters\/v3\/sites\/sc-domain%3Aexample.test\/searchAnalytics\/query$/);
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.authorization, `Bearer ${token}`);
    const body = JSON.parse(options.body);
    assert.deepEqual(body.dimensions, ['query', 'page', 'country']);
    assert.equal(body.dataState, 'final');
    queries++;
    return new Response(JSON.stringify({ rows: [{ keys: ['retention signals', 'https://example.test/about', 'usa'], impressions: 250, clicks: 2, ctr: 0.008, position: 9 }] }), { headers: { 'content-type': 'application/json' } });
  };
  try {
    await mkdir(join(dir, 'build'));
    await writeFile(join(dir, 'build/index.html'), validHtml);
    await runAudit({ SEO_BUILD_DIR: join(dir, 'build'), SEO_CANONICAL_ORIGIN: 'https://example.test', SEO_REPORT_DIR: dir, GSC_PROPERTY: 'sc-domain:example.test', GSC_ACCESS_TOKEN: token });
    const json = await readFile(join(dir, 'seo-audit-report.json'), 'utf8');
    assert.equal(queries, 1);
    assert.equal(JSON.parse(json).searchConsole.data.opportunities[0].query, 'retention signals');
    assert.ok(!json.includes(token));
    assert.ok(!(await readFile(join(dir, 'seo-audit-report.md'), 'utf8')).includes('retention signals'));
  } finally { globalThis.fetch = originalFetch; await rm(dir, { recursive: true, force: true }); }
});
