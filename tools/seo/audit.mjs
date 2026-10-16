/** Free, bounded, read-only audit. No provider keys or model calls. */
import { chromium } from 'playwright';
import lighthouse from 'lighthouse';
import desktopConfig from 'lighthouse/core/config/desktop-config.js';
import { launch } from 'chrome-launcher';
import { mkdir, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import path from 'node:path';

const { values } = parseArgs({ options: {
  url: { type: 'string' }, canonical: { type: 'string' }, out: { type: 'string' },
  limit: { type: 'string', default: '40' }, lighthouse: { type: 'boolean', default: false },
} });
if (!values.url) throw new Error('Usage: npm run audit -- --url https://site.example --lighthouse');
function origin(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw new Error('Use an HTTP(S) origin without credentials, path, query or fragment');
  return u.origin;
}
const base = origin(values.url);
const canonical = origin(values.canonical ?? base);
const limit = Number(values.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('--limit must be 1–100');
const out = path.resolve(values.out ?? `reports/${new Date().toISOString().replaceAll(':', '-')}`);
await mkdir(out, { recursive: true });
const report = { measuredAt: new Date().toISOString(), target: base, canonical, limit, pages: [], resources: [], findings: [], lighthouse: [], limitations: [
  'Technical sample only: no ranking, keyword volume, backlink or Google indexing claims.',
  'Lighthouse is one synthetic lab run per device, not field Core Web Vitals or a traffic forecast.',
  'Browser checks block third-party requests and all non-GET/HEAD requests. No forms or actions are submitted.',
] };
const finding = (severity, url, check, detail) => report.findings.push({ severity, url, check, detail });
const safe = u => u.origin === base && !/^\/(api|mcp)(\/|$)/.test(u.pathname) && !u.search;
const queue = ['/'];
const seen = new Set();
const browser = await chromium.launch({ headless: true });
async function context(javaScriptEnabled) {
  const c = await browser.newContext({ javaScriptEnabled, serviceWorkers: 'block' });
  await c.route('**/*', route => {
    const req = route.request(); const u = new URL(req.url());
    return ['GET', 'HEAD'].includes(req.method()) && u.origin === base && !/^\/(api|mcp)(\/|$)/.test(u.pathname) ? route.continue() : route.abort();
  });
  return c;
}
async function snapshot(page) {
  return page.evaluate(() => {
    const meta = key => document.querySelector(`meta[name="${key}"],meta[property="${key}"]`)?.content ?? '';
    const schemas = [...document.querySelectorAll('script[type="application/ld+json"]')].map(s => {
      try { return { valid: true, data: JSON.parse(s.textContent) }; } catch { return { valid: false }; }
    });
    return { title: document.title, description: meta('description'), canonical: document.querySelector('link[rel="canonical"]')?.href ?? '', robots: meta('robots'), h1: [...document.querySelectorAll('h1')].map(e => e.textContent.trim()), lang: document.documentElement.lang, ogTitle: meta('og:title'), ogImage: meta('og:image'), schemas, links: [...document.querySelectorAll('a[href]')].map(a => a.href), ids: [...document.querySelectorAll('[id],a[name]')].map(e => e.id || e.getAttribute('name')), imagesWithoutAlt: document.querySelectorAll('img:not([alt])').length, mainTextLength: document.querySelector('main')?.textContent.trim().length ?? 0, overflow: document.documentElement.scrollWidth > innerWidth + 1 };
  });
}
try {
  const raw = await context(false);
  for (const resource of ['/robots.txt', '/sitemap.xml']) {
    try {
      const r = await raw.request.get(`${base}${resource}`, { timeout: 30000 });
      const body = await r.text();
      report.resources.push({ path: resource, status: r.status(), contentType: r.headers()['content-type'], body });
      if (r.status() !== 200) finding('error', resource, 'crawl-file', `HTTP ${r.status()}`);
      if (resource === '/sitemap.xml' && r.ok()) {
        for (const m of body.matchAll(/<loc>\s*(.*?)\s*<\/loc>/gs)) {
          const u = new URL(m[1].replaceAll('&amp;', '&'));
          if (u.origin !== canonical) finding('error', resource, 'sitemap-origin', u.href);
          if (u.origin === canonical) {
            const target = new URL(u.pathname, base);
            if (safe(target) && !queue.includes(target.pathname)) queue.push(target.pathname);
          }
        }
      }
      if (resource === '/robots.txt' && !body.includes(`${canonical}/sitemap.xml`)) finding('warning', resource, 'robots-sitemap', 'Expected canonical sitemap declaration absent');
    } catch (e) { finding('error', resource, 'fetch', e.message); }
  }
  const rendered = await context(true);
  while (queue.length && report.pages.length < limit) {
    const pathname = queue.shift();
    if (seen.has(pathname)) continue;
    seen.add(pathname);
    const page = await raw.newPage();
    try {
      const response = await page.goto(`${base}${pathname}`, { waitUntil: 'domcontentloaded', timeout: 45000 });
      const status = response?.status() ?? 0;
      if (status !== 200) finding('error', pathname, 'http-status', `HTTP ${status}`);
      if (!response?.headers()['content-type']?.includes('text/html')) {
        report.resources.push({ path: pathname, status, contentType: response?.headers()['content-type'] });
        continue;
      }
      const ssr = await snapshot(page);
      const row = { path: pathname, status, finalUrl: page.url(), ...ssr, xRobotsTag: response.headers()['x-robots-tag'] ?? '' };
      report.pages.push(row);
      if (!ssr.title) finding('error', pathname, 'title', 'Missing title');
      if (!ssr.description) finding('error', pathname, 'description', 'Missing meta description');
      if (ssr.h1.length !== 1) finding('error', pathname, 'h1', `Expected one H1, found ${ssr.h1.length}`);
      if (ssr.canonical !== new URL(pathname, canonical).href) finding('error', pathname, 'canonical', `Expected ${new URL(pathname, canonical).href}; found ${ssr.canonical || 'none'}`);
      if (/noindex|none/i.test(`${ssr.robots} ${row.xRobotsTag}`)) finding('error', pathname, 'index-directive', `${ssr.robots} ${row.xRobotsTag}`);
      if (!ssr.lang) finding('warning', pathname, 'language', 'Missing HTML language');
      if (!ssr.mainTextLength) finding('error', pathname, 'server-rendering', 'No main text without JavaScript');
      if (ssr.imagesWithoutAlt) finding('warning', pathname, 'image-alt', `${ssr.imagesWithoutAlt} images without alt`);
      if (ssr.schemas.some(s => !s.valid)) finding('error', pathname, 'json-ld', 'Invalid JSON in structured data');
      if (!ssr.ogTitle || !ssr.ogImage) finding('warning', pathname, 'social-metadata', 'Missing Open Graph title/image');
      for (const href of ssr.links) {
        const u = new URL(href);
        if (safe(u) && !seen.has(u.pathname) && !queue.includes(u.pathname)) queue.push(u.pathname);
      }
      const hydrated = await rendered.newPage();
      try {
        await hydrated.goto(`${base}${pathname}`, { waitUntil: 'networkidle', timeout: 45000 });
        row.rendered = await snapshot(hydrated);
        if (row.rendered.title !== ssr.title || row.rendered.canonical !== ssr.canonical || JSON.stringify(row.rendered.h1) !== JSON.stringify(ssr.h1)) finding('warning', pathname, 'render-drift', 'Title, canonical or H1 differs after JavaScript');
        if (pathname === '/') {
          row.viewports = [];
          for (const [width, height] of [[390, 844], [1440, 900], [2560, 1440]]) {
            await hydrated.setViewportSize({ width, height });
            const state = await snapshot(hydrated);
            row.viewports.push({ width, height, overflow: state.overflow });
            if (state.overflow) finding('warning', pathname, 'overflow', `Horizontal overflow at ${width}px`);
            await hydrated.screenshot({ path: path.join(out, `home-${width}.png`), fullPage: true });
          }
        }
      } catch (e) { finding('error', pathname, 'render', e.message); }
      finally { await hydrated.close(); }
      console.log(`Checked ${pathname}: HTTP ${status}, ${ssr.schemas.length} JSON-LD blocks`);
    } catch (e) { finding('error', pathname, 'fetch', e.message); }
    finally { await page.close(); }
  }
  for (const field of ['title', 'description']) {
    const groups = new Map();
    for (const p of report.pages) if (p[field]) groups.set(p[field], [...(groups.get(p[field]) ?? []), p.path]);
    for (const paths of groups.values()) if (paths.length > 1) finding('warning', paths.join(', '), `duplicate-${field}`, `Shared ${field}`);
  }
  const byPath = new Map(report.pages.map(p => [p.path, p]));
  for (const p of report.pages) for (const href of p.links) {
    const u = new URL(href);
    if (u.origin === base && u.hash && u.hash.toLowerCase() !== '#top' && byPath.has(u.pathname) && !byPath.get(u.pathname).ids.includes(decodeURIComponent(u.hash.slice(1)))) finding('warning', p.path, 'anchor', `Missing target ${u.pathname}${u.hash}`);
  }
  report.remainingPaths = queue.filter(p => !seen.has(p));
  if (report.remainingPaths.length) report.limitations.push('Page limit reached; remaining paths were not audited.');
  const missing = await raw.request.get(`${base}/seo-audit-nonexistent-page`, { timeout: 30000 });
  report.resources.push({ path: '/seo-audit-nonexistent-page', status: missing.status() });
  if (missing.status() !== 404) finding('error', '/seo-audit-nonexistent-page', 'soft-404', `Expected 404, found ${missing.status()}`);
} catch (e) { finding('error', base, 'audit-runtime', e.message); }
finally { await browser.close(); }
if (values.lighthouse && report.pages.length) {
  for (const device of ['mobile', 'desktop']) {
    let chrome;
    try {
      chrome = await launch({ chromePath: chromium.executablePath(), chromeFlags: ['--headless', '--disable-extensions', '--no-first-run'] });
      const config = device === 'desktop' ? desktopConfig : undefined;
      const result = await lighthouse(base, { port: chrome.port, output: ['json', 'html'], logLevel: 'error', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] }, config);
      if (!result || result.lhr.runtimeError) throw new Error(result?.lhr.runtimeError?.message ?? 'No Lighthouse report');
      await writeFile(path.join(out, `lighthouse-${device}.json`), result.report[0]);
      await writeFile(path.join(out, `lighthouse-${device}.html`), result.report[1]);
      const scores = Object.fromEntries(Object.entries(result.lhr.categories).map(([k, v]) => [k, v.score === null ? null : Math.round(v.score * 100)]));
      const failed = Object.values(result.lhr.audits).filter(a => a.score !== null && a.score < 1 && a.scoreDisplayMode !== 'informative').map(a => ({ id: a.id, title: a.title, score: a.score, displayValue: a.displayValue }));
      report.lighthouse.push({ device, scores, failed, settings: result.lhr.configSettings, finalUrl: result.lhr.finalDisplayedUrl, fetchTime: result.lhr.fetchTime });
      console.log(`Lighthouse ${device}: ${JSON.stringify(scores)}`);
    } catch (e) { finding('error', base, `lighthouse-${device}`, e.message); }
    finally { await chrome?.kill(); }
  }
}
await writeFile(path.join(out, 'audit.json'), JSON.stringify(report, null, 2));
const escape = s => String(s ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const list = items => `<ul>${items.map(x => `<li>${escape(x)}</li>`).join('')}</ul>`;
const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sioona technical SEO check</title><style>body{font:16px/1.6 system-ui;max-width:1000px;margin:32px auto;padding:0 20px;color:#182329;background:#fafafa}h1,h2{line-height:1.2}a{color:#005b82}a:focus-visible{outline:3px solid #005b82}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:12px;border-bottom:1px solid #ccd1d4;overflow-wrap:anywhere;vertical-align:top}section{overflow:auto}small{color:#45545b}li{margin:8px 0}summary{cursor:pointer;min-height:24px}</style><main><h1>Sioona technical SEO check</h1><p>${escape(base)} · ${escape(report.measuredAt)}</p><p>${report.pages.length} HTML pages checked; ${report.findings.filter(f => f.severity === 'error').length} errors and ${report.findings.filter(f => f.severity === 'warning').length} warnings. Canonical origin: ${escape(canonical)}.</p><h2>Scope and limits</h2>${list(report.limitations)}<h2>Findings</h2>${report.findings.length ? list(report.findings.map(f => `${f.severity.toUpperCase()} · ${f.url} · ${f.check}: ${f.detail}`)) : '<p>No issues found in the implemented checks.</p>'}<h2>Pages checked</h2><section><table><thead><tr><th>Path</th><th>Status</th><th>Title</th><th>Structured data</th></tr></thead><tbody>${report.pages.map(p => `<tr><td>${escape(p.path)}</td><td>${p.status}</td><td>${escape(p.title)}</td><td>${p.schemas.length} JSON-LD blocks</td></tr>`).join('')}</tbody></table></section><h2>Lighthouse lab results</h2>${report.lighthouse.map(l => `<h3>${l.device}</h3><p>${escape(JSON.stringify(l.scores))}</p><p><a href="lighthouse-${l.device}.html">Open full ${l.device} report</a></p>${list(l.failed.map(f => `${f.title}${f.displayValue ? `: ${f.displayValue}` : ''}`))}`).join('') || '<p>Not run. Add --lighthouse to collect lab results.</p>'}<h2>Evidence</h2><p><a href="audit.json">Machine-readable observations</a>. Screenshots: home-390.png, home-1440.png, home-2560.png when homepage rendering succeeds.</p><p>Public site GET requests and isolated local browser sessions. JSON-LD parsing verifies syntax, not Google rich-result eligibility. Robots content is recorded for review; this bounded owner audit does not establish Google crawl or indexing status.</p></main></html>`;
await writeFile(path.join(out, 'index.html'), html);
console.log(`Saved ${out}/index.html`);
if (!report.pages.length || report.findings.some(f => f.severity === 'error')) process.exitCode = 1;
