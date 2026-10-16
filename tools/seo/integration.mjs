/** First-party SEO plumbing. Every external mutation requires an explicit caller action. */
export const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
const MAX_BYTES = 1024 * 1024;
export function canonicalOrigin(input) {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || url.port || /(^|\.)(localhost|onrender\.com|vercel\.app)$/.test(url.hostname) || /^(127\.|0\.)/.test(url.hostname) || url.hostname.includes(':')) throw new Error('Use an HTTPS custom canonical origin without credentials, port or path');
  return url.origin;
}
function targetOrigin(input) {
  const url = new URL(input);
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Audit target must be an HTTPS origin or explicit loopback HTTP origin');
  return url.origin;
}
export function validateKey(key) {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key ?? '')) throw new Error('Configure INDEXNOW_KEY with 8–128 letters, digits or dashes');
  return key;
}
export async function readPublic(url, { fetchImpl = fetch, accept = '*/*' } = {}) {
  const response = await fetchImpl(url, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Accept: accept } });
  if (Number(response.headers.get('content-length')) > MAX_BYTES) throw new Error('Public response exceeds 1 MiB limit');
  let text = '';
  if (response.body) {
    const reader = response.body.getReader(), decoder = new TextDecoder();
    let bytes = 0;
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_BYTES) throw new Error('Public response exceeds 1 MiB limit');
        text += decoder.decode(value, { stream: true });
      }
      text += decoder.decode();
    } finally { await reader.cancel(); }
  }
  return { response, text };
}
export function decode(text) {
  return text.replace(/&(?:amp|quot|apos|lt|gt);|&#(?:x[0-9a-f]+|\d+);/gi, entity => {
    const named = { '&amp;': '&', '&quot;': '"', '&apos;': "'", '&lt;': '<', '&gt;': '>' };
    if (named[entity.toLowerCase()]) return named[entity.toLowerCase()];
    const value = entity.slice(2, -1), number = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value);
    return number > 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}
export function attributes(tag) {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(match => [match[1].toLowerCase(), decode(match[2] ?? match[3])]));
}
export function canonicalOf(html) {
  const href = [...html.matchAll(/<link\b[^>]*>/gi)].map(match => attributes(match[0])).find(attrs => attrs.rel === 'canonical')?.href;
  try { return new URL(href).href; } catch { return undefined; }
}
export function inspectOwnership(html) {
  const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map(match => attributes(match[0]));
  return Object.fromEntries(Object.entries({ google: 'google-site-verification', bing: 'msvalidate.01', ahrefs: 'ahrefs-site-verification' }).map(([name, tag]) => [name, metas.some(attrs => attrs.name === tag && /^[A-Za-z0-9_-]{8,256}$/.test(attrs.content ?? ''))]));
}
export async function discoverPages({ origin, target = origin, fetchImpl = fetch }) {
  origin = canonicalOrigin(origin); target = targetOrigin(target);
  const { response, text } = await readPublic(`${target}/sitemap.xml`, { fetchImpl });
  if (response.status !== 200 || !/<urlset\b/.test(text) || /<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error('A 200 URL-set sitemap without external entities is required');
  const locations = [...text.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(match => decode(match[1]));
  if (!locations.length || locations.length > 100) throw new Error('Expected 1–100 canonical sitemap entries');
  const urls = [];
  for (const value of locations) {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password || url.search || url.hash || /^(?:\/api|\/_next|\/admin|\/login)(?:\/|$)/.test(url.pathname)) throw new Error('Sitemap contains a noncanonical or private URL');
    if (!/\.(?:txt|xml|svg|png|jpg|ico)$/i.test(url.pathname)) urls.push(url.href);
  }
  if (!urls.length) throw new Error('Sitemap contains no public HTML pages');
  return [...new Set(urls)];
}
export async function indexNowPlan({ origin, key, fetchImpl = fetch }) {
  origin = canonicalOrigin(origin);
  if (key) validateKey(key);
  return { mode: 'preview', origin, endpoint: INDEXNOW_ENDPOINT, keyConfigured: Boolean(key), keyLocation: `${origin}/indexnow-key.txt`, urls: await discoverPages({ origin, fetchImpl }), indexingConfirmed: false };
}
export async function submitIndexNow({ origin, key, approved = false, fetchImpl = fetch }) {
  if (!approved) throw new Error('Submission requires explicit --submit approval');
  validateKey(key);
  const plan = await indexNowPlan({ origin, key, fetchImpl });
  const proof = await readPublic(plan.keyLocation, { fetchImpl });
  if (proof.response.status !== 200 || !proof.response.headers.get('content-type')?.startsWith('text/plain') || proof.text.trim() !== key) throw new Error('IndexNow ownership key is not published or does not match');
  for (const url of plan.urls) {
    const page = await readPublic(url, { fetchImpl, accept: 'text/html' });
    if (page.response.status !== 200 || !page.response.headers.get('content-type')?.includes('text/html') || canonicalOf(page.text) !== url) throw new Error('Every submitted page must return 200 HTML with its exact canonical URL');
  }
  const response = await fetchImpl(INDEXNOW_ENDPOINT, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify({ host: new URL(plan.origin).hostname, key, keyLocation: plan.keyLocation, urlList: plan.urls }) });
  if (![200, 202].includes(response.status)) throw new Error(`IndexNow rejected submission: HTTP ${response.status}; no automatic retry performed`);
  return { ...plan, mode: 'submitted', httpStatus: response.status, status: response.status === 202 ? 'received-pending-key-validation' : 'received', indexingConfirmed: false };
}
