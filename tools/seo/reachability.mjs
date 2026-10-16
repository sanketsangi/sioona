import { chromium, firefox, webkit, devices } from 'playwright';
import { lookup } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { canonicalOrigin } from './integration.mjs';
const exec = promisify(execFile);

export function reachabilityVerdict({ systemDns, publicDns, browsers }) {
  return {
    passed: systemDns.length >= 2 && publicDns.length >= 8 && systemDns.every(row => row.addresses?.length) && publicDns.every(row => row.ok) && browsers.every(row => row.status === 'pass') && browsers.length >= 8,
    physicalDevicesTested: false,
    independentNetworksTested: false,
    meaning: 'Emulated browser profiles and DNS resolvers on one host; not physical-device or cellular-network acceptance',
  };
}

async function main() {
  const { values } = parseArgs({ options: { origin: { type: 'string', default: 'https://sioona.si' }, out: { type: 'string', default: 'reports/reachability-' + new Date().toISOString().replaceAll(':', '-') + '.json' } }, allowPositionals: false });
  const origin = canonicalOrigin(values.origin), apex = new URL(origin).hostname;
  if (apex.startsWith('www.')) throw new Error('Use the chosen apex canonical origin');
  const hosts = [apex, `www.${apex}`];
  const systemDns = await Promise.all(hosts.map(async host => {
    try { return { host, addresses: await lookup(host, { all: true }) }; }
    catch (error) { return { host, error: error.code }; }
  }));
  const publicDns = await Promise.all(['1.1.1.1', '8.8.8.8', '9.9.9.9', '208.67.222.222'].flatMap(resolver => hosts.map(async host => {
    try {
      const { stdout } = await exec('dig', [`@${resolver}`, host, 'A', '+time=3', '+tries=1', '+noall', '+comments', '+answer'], { timeout: 5000 });
      return { resolver, host, ok: stdout.includes('status: NOERROR') && /\sIN\s+A\s+\d/.test(stdout), response: stdout };
    } catch (error) { return { resolver, host, ok: false, error: error.code ?? error.message }; }
  })));
  const profiles = [
    { name: 'Desktop Chrome', engine: chromium, device: devices['Desktop Chrome'] },
    { name: 'Android Pixel 7 (emulated)', engine: chromium, device: devices['Pixel 7'] },
    { name: 'iPhone 13 Safari/WebKit (emulated)', engine: webkit, device: devices['iPhone 13'] },
    { name: 'Desktop Firefox', engine: firefox, device: devices['Desktop Firefox'] },
  ];
  const browsers = (await Promise.all(profiles.map(async profile => {
    let browser;
    const rows = [];
    try {
      browser = await profile.engine.launch({ headless: true });
      const context = await browser.newContext({ ...profile.device, reducedMotion: 'reduce' });
      // No DNS override, certificate bypass, credentials, form submission or third-party requests.
      await context.route('**/*', route => hosts.includes(new URL(route.request().url()).hostname) && ['GET', 'HEAD'].includes(route.request().method()) ? route.continue() : route.abort());
      for (const host of hosts) {
        const page = await context.newPage();
        try {
          const response = await page.goto(`https://${host}/`, { waitUntil: 'domcontentloaded', timeout: 12000 });
          const h1 = await page.locator('h1').count();
          const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
          const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
          rows.push({ profile: profile.name, host, status: response?.status() === 200 && page.url() === `${origin}/` && h1 === 1 && !overflow && new URL(canonical).href === `${origin}/` ? 'pass' : 'fail', httpStatus: response?.status(), finalUrl: page.url(), h1, overflow, canonical });
        } catch (error) { rows.push({ profile: profile.name, host, status: 'fail', error: error.message }); }
        await page.close();
      }
    } catch (error) {
      for (const host of hosts) rows.push({ profile: profile.name, host, status: 'unavailable', error: error.message });
    } finally { await browser?.close(); }
    return rows;
  }))).flat();
  const report = { at: new Date().toISOString(), origin, systemDns, publicDns, browsers, ...reachabilityVerdict({ systemDns, publicDns, browsers }) };
  const output = path.resolve(values.out);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ report: output, passed: report.passed, systemDns, publicResolversPassed: publicDns.filter(row => row.ok).length, browserResults: browsers.map(({ profile, host, status, error }) => ({ profile, host, status, error })), physicalDevicesTested: false, independentNetworksTested: false }, null, 2));
  if (!report.passed) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch(error => { console.error(error.message); process.exitCode = 1; });
