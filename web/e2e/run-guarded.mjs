import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cb02-outbound-'));
const audit = path.join(work, 'attempts');
fs.writeFileSync(audit, '');
const guards = path.join(import.meta.dirname, 'guards');
const args = process.argv.slice(2);
const command = args[0] === '--'
  ? args.slice(1)
  : [process.execPath, path.resolve('node_modules/@playwright/test/cli.js'), 'test', ...args];
let status = 1;
try {
  const child = spawn(command[0], command.slice(1), {
    stdio: 'inherit',
    env: {
      ...process.env,
      CB02_OUTBOUND_AUDIT: audit,
      NODE_OPTIONS: `--require ${JSON.stringify(path.join(guards, 'node.cjs'))}`,
      PYTHONPATH: guards,
      PYTHONDONTWRITEBYTECODE: '1',
    },
  });
  const interrupt = () => child.kill('SIGINT');
  const terminate = () => child.kill('SIGTERM');
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', terminate);
  status = await new Promise(resolve => {
    child.once('error', () => resolve(1));
    child.once('exit', code => resolve(code ?? 1));
  });
  process.removeListener('SIGINT', interrupt);
  process.removeListener('SIGTERM', terminate);
  const attempts = fs.readFileSync(audit, 'utf8').split('\n').filter(Boolean);
  if (attempts.length) {
    console.error(`Outbound attempts blocked: ${attempts.length}`);
    const destinations = [...new Set(attempts
      .map(attempt => attempt.match(/^denied node ([a-z0-9.:[\]-]+:\d+)$/i)?.[1])
      .filter(Boolean))];
    if (destinations.length) console.error(`Blocked destinations: ${destinations.join(', ')}`);
    status = 1;
  }
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
process.exitCode = status;
