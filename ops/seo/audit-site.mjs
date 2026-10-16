#!/usr/bin/env node
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createSign } from 'node:crypto';

const here = dirname(fileURLToPath(import.meta.url));
const siteDir = process.env.SEO_SITE_DIR || resolve(here, '../../site');
const require = createRequire(import.meta.url);
let JSDOM;
try { ({ JSDOM } = require('jsdom')); }
catch { ({ JSDOM } = createRequire(resolve(siteDir, 'package.json'))('jsdom')); }

export const schemaRequirements = {
  Organization: ['name', 'url'], WebSite: ['name', 'url'],
  SoftwareApplication: ['name', 'applicationCategory', 'operatingSystem', 'url'],
  Service: ['name', 'serviceType', 'provider'], Product: ['name', 'description', 'brand'],
  HowTo: ['name', 'step'], BreadcrumbList: ['itemListElement'], FAQPage: ['mainEntity'],
};

/** Offline, bounded contract validation. This does not certify Google rich-result eligibility. */
export function validatePage(html, path, canonicalOrigin) {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const issues = [];
  const issue = (code, fix) => issues.push({ code, fix });
  const title = doc.title.trim();
  const description = doc.querySelector('meta[name="description"]')?.content || '';
  if (title.length < 35 || title.length > 60) issue('title-length', 'Write a unique 35–60 character title aligned with this page’s intent.');
  if (description.length < 120 || description.length > 158) issue('description-length', 'Write a distinct 120–158 character description with a clear next step.');
  const expected = new URL(path, canonicalOrigin).href;
  const canonicals = [...doc.querySelectorAll('link[rel="canonical"]')];
  if (canonicals.length !== 1 || canonicals[0].href !== expected) issue('canonical', `Publish one canonical URL: ${expected}`);
  for (const lang of ['en-IN', 'en-US', 'x-default']) {
    if (doc.querySelector(`link[rel="alternate"][hreflang="${lang}"]`)?.href !== expected) issue('hreflang', `Link ${lang} to this shared English canonical.`);
  }
  const main = doc.querySelector('main') || doc.body;
  if (main.querySelectorAll('h1').length !== 1) issue('h1-count', 'Use exactly one descriptive h1 in the main content.');
  let previous = 0;
  for (const heading of main.querySelectorAll('h1,h2,h3,h4,h5,h6')) {
    if (heading.closest('[aria-hidden="true"], [hidden]')) continue;
    const level = Number(heading.tagName[1]);
    if (!heading.textContent.trim() || level > previous + 1) issue('heading-hierarchy', `Repair heading hierarchy near “${heading.textContent.trim().slice(0, 80)}”.`);
    previous = level;
  }
  if (/noindex/i.test(doc.querySelector('meta[name="robots"]')?.content || '')) issue('noindex', 'Remove noindex from this intended public page.');
  const entities = [];
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const json = JSON.parse(script.textContent);
      if (json['@context'] !== 'https://schema.org') issue('schema-context', 'Use the Schema.org JSON-LD context.');
      const nodes = json['@graph'] || (Array.isArray(json) ? json : [json]);
      entities.push(...nodes);
      for (const node of nodes) {
        const required = schemaRequirements[node['@type']];
        if (!required) issue('schema-type', 'Review the unrecognized structured-data type.');
        for (const field of required || []) if (!node[field] || (Array.isArray(node[field]) && !node[field].length)) issue('schema-field', `${node['@type']} needs ${field}.`);
        if (node['@type'] === 'BreadcrumbList') node.itemListElement?.forEach((item, i) => {
          if (item['@type'] !== 'ListItem' || item.position !== i + 1 || !item.name || !URL.canParse(item.item)) issue('breadcrumb', 'Use ordered named ListItems with absolute URLs.');
        });
        if (node['@type'] === 'HowTo') node.step?.forEach((step, i) => {
          if (step['@type'] !== 'HowToStep' || step.position !== i + 1 || !step.name || !step.text || !URL.canParse(step.url)) issue('howto', 'Use ordered named steps with visible instructions and URLs.');
        });
      }
    } catch { issue('jsonld-parse', 'Fix malformed JSON-LD or graph structure.'); }
  }
  const ids = new Set(entities.map(node => node['@id']).filter(Boolean));
  function checkRefs(value) {
    if (!value || typeof value !== 'object') return;
    if (Object.keys(value).length === 1 && value['@id'] && !ids.has(value['@id'])) issue('schema-reference', 'Resolve the graph entity reference.');
    for (const child of Object.values(value)) checkRefs(child);
  }
  entities.forEach(checkRefs);
  const types = entities.map(node => node['@type']);
  for (const type of ['Organization', 'WebSite', 'Service', 'BreadcrumbList', ...(path === '/' ? ['Product', 'SoftwareApplication', 'HowTo'] : [])]) {
    if (!types.includes(type)) issue('schema-missing', `Add truthful ${type} structured data matching visible content.`);
  }
  const links = [...main.querySelectorAll('a[href]')].map(a => ({ href: a.getAttribute('href'), label: a.textContent.trim() || a.getAttribute('aria-label') || '' }));
  for (const link of links) if (!link.label) issue('link-name', 'Give each internal link descriptive anchor text.');
  const headings = [...main.querySelectorAll('h1,h2,h3')].map(h => ({ level: Number(h.tagName[1]), text: h.textContent.trim() }));
  dom.window.close();
  return { path, title, description, canonical: canonicals[0]?.href, headings, schemaTypes: types, links, issues };
}

async function request(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(90000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response;
}
async function jsonRequest(url, options) { return (await request(url, options)).json(); }
const jsonPost = body => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const skipped = reason => ({ status: 'skipped', reason });
async function attempt(fn) {
  try { return { status: 'complete', data: await fn() }; }
  catch (error) {
    // Never persist request URLs (API keys), JWTs, private keys or provider response bodies.
    return { status: 'unavailable', reason: /^HTTP \d+$/.test(error.message) ? error.message : 'Request or local tool failed; check credentials, connectivity and tool installation.' };
  }
}

export function searchOpportunities(rows) {
  return rows.filter(row => row.impressions >= 50 && row.position >= 5 && row.position <= 20)
    .map(row => ({ query: row.keys[0], page: row.keys[1], country: row.keys[2], clicks: row.clicks, impressions: row.impressions, ctr: row.ctr, position: row.position,
      action: row.ctr < 0.02 ? 'Review title and description against query intent; inspect the landing page before rewriting.' : 'Improve the answer and relevant internal links; compare against current search results.' }))
    .sort((a, b) => b.impressions - a.impressions);
}
async function searchConsole(env) {
  let token = env.GSC_ACCESS_TOKEN;
  if (!token) {
    const key = JSON.parse(await readFile(env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8'));
    const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
    const now = Math.floor(Date.now() / 1000);
    const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/webmasters.readonly', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 })}`;
    const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
    const auth = await jsonRequest('https://oauth2.googleapis.com/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${signature}` }) });
    token = auth.access_token;
    if (!token) throw new Error('Missing access token');
  }
  const day = days => new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const startDate = day(31), endDate = day(3), rows = [];
  const rowLimit = 1000, maxRows = 10000;
  let truncated = false;
  for (let startRow = 0; startRow < maxRows; startRow += rowLimit) {
    const result = await jsonRequest(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(env.GSC_PROPERTY)}/searchAnalytics/query`, {
      ...jsonPost({ startDate, endDate, dimensions: ['query', 'page', 'country'], rowLimit, startRow, dataState: 'final', type: 'web' }),
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    });
    rows.push(...(result.rows || []));
    if (!result.rows || result.rows.length < rowLimit) break;
    if (startRow + rowLimit === maxRows) truncated = true;
  }
  return { startDate, endDate, rowsReturned: rows.length, truncated, note: 'Search Console returns top rows and omits anonymized queries; this is not a complete demand estimate.', opportunities: searchOpportunities(rows) };
}

async function lighthouseRun(url) {
  const { default: lighthouse } = await import('lighthouse');
  const chromeLauncher = await import('chrome-launcher');
  const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless', '--disable-dev-shm-usage', '--no-sandbox'], chromePath: process.env.CHROME_PATH || undefined });
  try {
    const result = await lighthouse(url, { port: chrome.port, output: 'json', onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'] });
    if (result.lhr.runtimeError) throw new Error('Lighthouse runtime error');
    return summarizeLighthouse(result.lhr);
  } finally { await chrome.kill(); }
}
function summarizeLighthouse(lhr) {
  return { finalUrl: lhr.finalDisplayedUrl || lhr.finalUrl, scores: Object.fromEntries(Object.entries(lhr.categories).map(([key, value]) => [key, value.score])),
    failedAudits: Object.entries(lhr.audits).filter(([, audit]) => audit.score !== null && audit.score < 0.9).map(([id, audit]) => ({ id, title: audit.title, score: audit.score, displayValue: audit.displayValue })) };
}

const performanceAction = {
  'largest-contentful-paint': 'Profile the largest visible element; prioritize its font/resource loading and avoid waiting for entrance animations.',
  'total-blocking-time': 'Profile hydration and long tasks; defer nonessential interactive previews until needed.',
  'unused-javascript': 'Inspect the bundle and defer unused interactive code without hiding indexable content.',
  'render-blocking-insight': 'Inspect critical CSS and font requests; remove unused blocking resources before changing preload behavior.',
};

export function markdownReport(report) {
  const { generatedAt, mode, canonicalOrigin, scope, pages, findings, discovery, performance, crux, searchConsole: gsc } = report;
  return `# Sioona SEO audit\n\nGenerated: ${generatedAt}\n\nMode: ${mode}. Canonical origin: ${canonicalOrigin}\n\n${scope}\n\n## Actions\n\n${findings.length ? findings.map(f => `- ${f.path}: ${f.code} — ${f.fix}`).join('\n') : '- No defects found in the implemented metadata, heading, link and structured-data contracts.'}\n\n## Route checks\n\n| Route | Title chars | Description chars | Issues |\n| --- | ---: | ---: | ---: |\n${pages.map(p => `| ${p.path} | ${p.title?.length ?? 'unknown'} | ${p.description?.length ?? 'unknown'} | ${p.issues.length} |`).join('\n')}\n\n## External coverage\n\n- Discovery files: ${discovery.status}\n- PageSpeed Insights: ${performance.filter(p => p.pageSpeed.status === 'complete').length}/${pages.length} completed\n- Local Lighthouse: ${performance.filter(p => p.lighthouse.status === 'complete').length}/${pages.length} completed\n- CrUX: ${crux.status}${crux.reason ? ` — ${crux.reason}` : ''}\n- Search Console: ${gsc.status}${gsc.reason ? ` — ${gsc.reason}` : ''}\n${gsc.status === 'complete' ? `- Search Console opportunities: ${gsc.data.opportunities.length}. Query details remain in the private JSON report.\n` : ''}\n## Local lab and PageSpeed results\n\n| Route | Source | Performance | Accessibility | SEO |\n| --- | --- | ---: | ---: | ---: |\n${performance.flatMap(p => ['lighthouse', 'pageSpeed'].filter(source => p[source].status === 'complete').map(source => { const scores = p[source].data.scores; const score = value => value === null || value === undefined ? 'unknown' : Math.round(value * 100); return `| ${p.path} | ${source} | ${score(scores.performance)} | ${score(scores.accessibility)} | ${score(scores.seo)} |`; })).join('\n')}\n\nLocal lab scores are measurements of this machine and build, not live field performance.\n\n## Performance actions\n\n${performance.flatMap(p => ['lighthouse', 'pageSpeed'].filter(source => p[source].status === 'complete').flatMap(source => p[source].data.failedAudits.filter(a => ['largest-contentful-paint', 'total-blocking-time', 'unused-javascript', 'render-blocking-insight'].includes(a.id)).map(a => `- ${p.path} (${source}): ${a.title}${a.displayValue ? ` — ${a.displayValue}` : ''}. ${performanceAction[a.id]}`))).join('\n') || '- No performance measurements available; configure Lighthouse or PageSpeed before making performance claims.'}\n\n## Next steps\n\n- Fix reported route issues, rebuild and rerun this audit.\n- Review docs/SEO_KEYWORD_STRATEGY.md and compare proposed targets with real Search Console queries.\n- Run against the approved live domain with credentials to collect PageSpeed, CrUX and query opportunities.\n- Verify structured data in Schema.org Validator and Google Rich Results Test before publication.\n\n## Limits\n\n${report.limitations.map(l => `- ${l}`).join('\n')}\n\nUnavailable and skipped checks are coverage gaps, never passing scores. See the private JSON report for provider status per route.\n`;
}

export async function runAudit(env = process.env) {
  const source = await readFile(resolve(siteDir, 'src/lib/site.ts'), 'utf8');
  const declaration = source.match(/export const routes = \[([^\]]+)\]/);
  if (!declaration) throw new Error('Public routes declaration is missing');
  const routes = [...declaration[1].matchAll(/"([^"]+)"/g)].map(match => match[1]);
  const base = env.SEO_BASE_URL?.replace(/\/$/, '');
  if (base && !['http:', 'https:'].includes(new URL(base).protocol)) throw new Error('SEO_BASE_URL must use HTTP(S)');
  const buildDir = env.SEO_BUILD_DIR || resolve(siteDir, '.next/server/app');
  const load = async path => base ? (await request(new URL(path, base), { headers: { accept: 'text/html' } })).text() : readFile(resolve(buildDir, path === '/' ? 'index.html' : `${path.slice(1)}.html`), 'utf8');
  const home = await load('/');
  const homeDom = new JSDOM(home);
  const canonicalOrigin = env.SEO_CANONICAL_ORIGIN || new URL(homeDom.window.document.querySelector('link[rel="canonical"]')?.href).origin;
  homeDom.window.close();
  const pages = [];
  for (const path of routes) {
    try { pages.push(validatePage(path === '/' ? home : await load(path), path, canonicalOrigin)); }
    catch { pages.push({ path, issues: [{ code: 'fetch', fix: 'Ensure this canonical page returns HTML with status 200.' }] }); }
  }
  const knownPaths = new Set([...routes, '/llms.txt', '/sitemap.xml', '/robots.txt', '/mcp', '/.well-known/mcp']);
  for (const page of pages) for (const link of page.links || []) {
    try {
      const target = new URL(link.href, new URL(page.path, canonicalOrigin));
      if (target.origin === canonicalOrigin && !knownPaths.has(target.pathname) && !target.pathname.startsWith('/api/')) page.issues.push({ code: 'internal-link', fix: `Repair or verify internal destination ${target.pathname}.` });
    } catch { page.issues.push({ code: 'internal-link', fix: 'Replace invalid link URL.' }); }
  }
  const loadText = async (path, filename) => base ? (await request(new URL(path, base))).text() : readFile(resolve(buildDir, filename), 'utf8');
  const discovery = await attempt(async () => {
    const [sitemap, llms, robots] = await Promise.all([loadText('/sitemap.xml', 'sitemap.xml.body'), loadText('/llms.txt', 'llms.txt.body'), loadText('/robots.txt', 'robots.txt.body')]);
    const xml = new JSDOM(sitemap, { contentType: 'text/xml' });
    const urls = [...xml.window.document.querySelectorAll('url > loc')].map(loc => loc.textContent);
    xml.window.close();
    return { missingFromSitemap: routes.filter(path => !urls.includes(new URL(path, canonicalOrigin).href)),
      missingFromLlms: routes.filter(path => !llms.includes(`](${new URL(path, canonicalOrigin).href})`)),
      sitemapInRobots: robots.includes(`Sitemap: ${new URL('/sitemap.xml', canonicalOrigin).href}`),
      robots, note: 'Crawler access is checked locally; discovery files do not guarantee indexing or AI citations. IndexNow requires a separately verified domain key and explicit URL submission.' };
  });
  const publicBase = base && new URL(base).protocol === 'https:' && !/^(localhost|127\.|\[::1\]|host\.docker\.internal)/.test(new URL(base).hostname);
  const performance = [];
  for (const path of routes) {
    const url = base ? new URL(path, base).href : null;
    let psi = skipped('Set GCP_API_KEY and a publicly reachable HTTPS SEO_BASE_URL for PageSpeed Insights.');
    if (env.GCP_API_KEY && publicBase) psi = await attempt(async () => {
      const endpoint = new URL('https://www.googleapis.com/pagespeedonline/v5/runPagespeed');
      endpoint.search = new URLSearchParams({ url, strategy: 'mobile', key: env.GCP_API_KEY });
      for (const category of ['performance', 'accessibility', 'best-practices', 'seo']) endpoint.searchParams.append('category', category);
      const result = await jsonRequest(endpoint);
      if (!result.lighthouseResult || result.lighthouseResult.runtimeError) throw new Error('No valid Lighthouse result');
      return summarizeLighthouse(result.lighthouseResult);
    });
    const lab = env.SEO_LIGHTHOUSE === 'true' && url ? await attempt(() => lighthouseRun(url)) : skipped('Set SEO_LIGHTHOUSE=true with SEO_BASE_URL and installed Chromium/Lighthouse.');
    performance.push({ path, pageSpeed: psi, lighthouse: lab });
  }
  const crux = env.GCP_API_KEY && publicBase ? await attempt(() => jsonRequest(`https://chromeuxreport.googleapis.com/v1/records:queryRecord?key=${encodeURIComponent(env.GCP_API_KEY)}`, jsonPost({ origin: new URL(base).origin, formFactor: 'PHONE' }))) : skipped('Set GCP_API_KEY and a public HTTPS SEO_BASE_URL. Low-traffic origins may have no CrUX data.');
  const gsc = env.GSC_PROPERTY && (env.GSC_ACCESS_TOKEN || env.GOOGLE_APPLICATION_CREDENTIALS) ? await attempt(() => searchConsole(env)) : skipped('Provide GSC_PROPERTY and a read-only service account credential file or GSC_ACCESS_TOKEN.');
  const findings = pages.flatMap(page => page.issues.map(issue => ({ path: page.path, ...issue })));
  if (discovery.status !== 'complete' || discovery.data.missingFromSitemap.length || discovery.data.missingFromLlms.length || !discovery.data.sitemapInRobots) findings.push({ path: '/sitemap.xml', code: 'discovery', fix: 'Repair unavailable or incomplete sitemap, llms.txt or robots.txt.' });
  const report = { generatedAt: new Date().toISOString(), mode: base ? 'http-crawl' : 'production-build', target: base || buildDir, canonicalOrigin,
    scope: 'Nine public routes; metadata, headings, links, structured-data contracts and discovery. Sequential optional Google/mobile lab calls. No paid providers or model calls.',
    limitations: ['Schema checks validate our supported contracts, not the full Schema.org vocabulary or rich-result eligibility.', 'Build mode cannot prove HTTP headers, redirects, robots enforcement, performance or live indexing.', 'Keyword targets are hypotheses until supported by first-party data; no search-volume or ranking claims.'],
    pages, discovery, performance, crux, searchConsole: gsc, findings };
  const outputDir = env.SEO_REPORT_DIR || resolve(here, 'reports');
  await mkdir(outputDir, { recursive: true, mode: 0o700 });
  await writeFile(resolve(outputDir, 'seo-audit-report.json'), JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  const md = markdownReport(report);
  await writeFile(resolve(outputDir, 'seo-audit-report.md'), md, { mode: 0o600 });
  console.log(`Audited ${pages.length} pages: ${findings.length} findings. Reports: ${outputDir}`);
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAudit().then(report => { if (report.findings.length) process.exitCode = 1; }).catch(() => { console.error('SEO audit failed: verify the build or SEO_BASE_URL and install dependencies. Secrets and provider response bodies are not logged.'); process.exitCode = 1; });
}
