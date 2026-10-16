import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reachabilityVerdict } from './reachability.mjs';
const baseline = { systemDns: [{ addresses: ['216.24.57.1'] }, { addresses: ['216.24.57.16'] }], publicDns: Array.from({ length: 8 }, () => ({ ok: true })), browsers: Array.from({ length: 8 }, () => ({ status: 'pass' })) };
test('public resolver success cannot hide normal resolver or browser failure', () => {
 assert.equal(reachabilityVerdict({ ...baseline, systemDns: [{ error: 'ENOTFOUND' }] }).passed, false);
 assert.equal(reachabilityVerdict({ ...baseline, browsers: [{ status: 'fail' }] }).passed, false);
});
test('missing test browser is incomplete rather than a passing device check', () => {
 assert.equal(reachabilityVerdict({ ...baseline, browsers: [...baseline.browsers.slice(1), { status: 'unavailable' }] }).passed, false);
});
test('missing DNS evidence cannot pass', () => {
 assert.equal(reachabilityVerdict({ ...baseline, systemDns: [] }).passed, false);
 assert.equal(reachabilityVerdict({ ...baseline, publicDns: [] }).passed, false);
});
test('emulated success never claims physical devices or independent networks', () => {
 const verdict = reachabilityVerdict(baseline);
 assert.equal(verdict.passed, true);assert.equal(verdict.physicalDevicesTested, false);assert.equal(verdict.independentNetworksTested, false);
});
