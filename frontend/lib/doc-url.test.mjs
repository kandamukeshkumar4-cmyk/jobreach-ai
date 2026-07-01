// Standalone proof for resolveDocUrl.
//   run:  node frontend/lib/doc-url.test.mjs   (Node >= 22 runs the imported .ts)
// There is no test runner in this project, so this is a dependency-free
// assertion script: it prints PASS/FAIL per case and exits non-zero on failure.
import assert from 'node:assert/strict';
import { resolveDocUrl } from './doc-url.ts';

const API = 'https://api-host/api/v1';
const cases = [];
const t = (name, fn) => cases.push([name, fn]);

t('/api/v1/ path joins to the API ORIGIN (no doubled prefix)', () => {
  const r = resolveDocUrl('/api/v1/resumes/x/download', API);
  assert.equal(r.url, 'https://api-host/api/v1/resumes/x/download');
  assert.equal(r.isData, false);
  assert.equal(r.attachAuth, true);
});

t('/resumes/ path joins to API_BASE', () => {
  const r = resolveDocUrl('/resumes/x/download', API);
  assert.equal(r.url, 'https://api-host/api/v1/resumes/x/download');
  assert.equal(r.attachAuth, true);
});

t('data: URL is saved directly, never fetched', () => {
  const r = resolveDocUrl('data:application/octet-stream;base64,SGk=', API);
  assert.equal(r.isData, true);
  assert.equal(r.attachAuth, false);
  assert.ok(r.url.startsWith('data:'));
});

t('external https URL never receives the bearer token', () => {
  const r = resolveDocUrl('https://evil.example.com/steal.docx', API);
  assert.equal(r.isData, false);
  assert.equal(r.attachAuth, false);
  assert.equal(r.url, 'https://evil.example.com/steal.docx');
});

t('absolute URL on our OWN API origin does receive the token', () => {
  const r = resolveDocUrl('https://api-host/api/v1/resumes/x/download', API);
  assert.equal(r.attachAuth, true);
});

t('unknown API origin (relative API_BASE) never leaks token to absolute URLs', () => {
  const r = resolveDocUrl('https://api-host/api/v1/resumes/x/download', '/api/v1');
  assert.equal(r.attachAuth, false);
});

t('empty URL throws (no document)', () => {
  assert.throws(() => resolveDocUrl('', API), /No document available/);
});

let passed = 0;
for (const [name, fn] of cases) {
  try {
    fn();
    passed++;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    console.error(`  [FAIL] ${name}\n         ${err.message}`);
    process.exitCode = 1;
  }
}
console.log(`\n=== ${passed}/${cases.length} resolveDocUrl checks passed ===`);
if (passed !== cases.length) process.exit(1);
