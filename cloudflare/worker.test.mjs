import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import worker, { signDispatch } from './src/worker.mjs';

const controller = { cron: '*/5 * * * *' };
const env = { DISPATCH_ENABLED: 'true', GH_ACTIONS_TOKEN: 'test-token',
  MOSAIC_OCI_CRON_HMAC_KEY: 'synthetic-secret-never-production' };

test('default disabled path makes no dispatch', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('disabled worker must not call GitHub'); };
  try {
    await worker.scheduled(controller, { ...env, DISPATCH_ENABLED: 'false' });
  } finally { globalThis.fetch = oldFetch; }
});

test('signed five-minute cron dispatch uses exact repo, main and HMAC', async () => {
  const oldFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return { status: 204 };
  };
  try {
    await worker.scheduled(controller, env);
    assert.equal(calls.length, 1);
    const [url, options] = calls[0];
    assert.equal(url,
      'https://api.github.com/repos/carlers/mosaic-oci-a1-scheduler/actions/workflows/oci-a1-autoclaim.yml/dispatches');
    assert.equal(options.method, 'POST');
    assert.equal(options.headers.Authorization, 'Bearer test-token');
    const body = JSON.parse(options.body);
    assert.equal(body.ref, 'main');
    assert.deepEqual(Object.keys(body.inputs).sort(),
      ['dispatch_epoch', 'dispatch_nonce', 'dispatch_signature']);
    assert.match(body.inputs.dispatch_epoch, /^[0-9]{10}$/);
    assert.match(body.inputs.dispatch_nonce, /^[0-9a-f]{32}$/);
    const expected = createHmac('sha256', env.MOSAIC_OCI_CRON_HMAC_KEY).update(
      'mosaic-oci-a1-scheduler/main/oci-a1-autoclaim.yml:' +
      body.inputs.dispatch_epoch + ':' + body.inputs.dispatch_nonce).digest('hex');
    assert.equal(body.inputs.dispatch_signature, expected);
    assert.equal(await signDispatch(body.inputs.dispatch_epoch, body.inputs.dispatch_nonce,
      'wrong-key') === expected, false);
  } finally { globalThis.fetch = oldFetch; }
});

test('missing secrets or unexpected cron cannot invoke GitHub', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('must not dispatch'); };
  try {
    await assert.rejects(worker.scheduled(controller, {
      ...env, GH_ACTIONS_TOKEN: undefined }), /Missing private/);
    await assert.rejects(worker.scheduled({ cron: '0 * * * *' }, env),
      /Unexpected cron/);
  } finally { globalThis.fetch = oldFetch; }
});

test('API rejection is surfaced without leaking secrets or retrying', async () => {
  const oldFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; return { status: 403 }; };
  try {
    await assert.rejects(worker.scheduled(controller, env),
      /GitHub workflow dispatch rejected: HTTP 403/);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = oldFetch; }
});
