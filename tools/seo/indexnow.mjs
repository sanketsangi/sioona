import { parseArgs } from 'node:util';
import { indexNowPlan, submitIndexNow } from './integration.mjs';
try {
  const { values } = parseArgs({ options: { origin: { type: 'string', default: 'https://sioona.si' }, submit: { type: 'boolean', default: false }, help: { type: 'boolean' } }, allowPositionals: false });
  if (values.help) console.log('node indexnow.mjs [--origin https://sioona.si] [--submit]\nDefault: read-only sitemap preview. --submit verifies ownership/pages and sends one IndexNow notification. Configure INDEXNOW_KEY outside the repo. No indexing guarantee.');
  else {
    const args = { origin: values.origin, key: process.env.INDEXNOW_KEY?.trim() };
    const result = values.submit ? await submitIndexNow({ ...args, approved: true }) : await indexNowPlan(args);
    console.log(JSON.stringify(result, null, 2));
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
