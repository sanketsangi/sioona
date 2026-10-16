import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('offline GSC fallback handles BOM, quoted numbers and CTR; rejects nonfinite metrics', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'sioona-gsc-csv-'));
  const script = fileURLToPath(new URL('./gsc.py', import.meta.url));
  const csv = join(dir, 'queries.csv'), out = join(dir, 'report.json');
  try {
    await writeFile(csv, '\ufeffTop queries,Clicks,Impressions,CTR,Position\nfixture,10,"1,000",1%,12\nother,20,200,10%,3\n');
    execFileSync('python3', [script, csv, '--out', out]);
    const data = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(data.rows, 2);
    assert.equal(data.lowCtrCandidates.length, 1);
    assert.equal(data.nearRankingCandidates.length, 1);
    assert.equal(data.lowCtrCandidates[0].ctr, 0.01);
    await writeFile(csv, 'Top queries,Clicks,Impressions,CTR,Position\ninvalid,1,100,2%,nan\n');
    assert.throws(() => execFileSync('python3', [script, csv, '--out', out], { stdio: 'pipe' }));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
