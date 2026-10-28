import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { test } from 'node:test';
import worker, { signDispatch } from './src/worker.mjs';
import { verifiedCloudflareDispatch } from './verify-dispatch.mjs';

const controller = { cron: '*/5 * * * *' };
const env = { DISPATCH_ENABLED: 'true', GH_ACTIONS_TOKEN: 'test-token',
  MOSAIC_OCI_CRON_HMAC_KEY: 'synthetic-secret-never-production' };

test('default disabled path makes no dispatch', async () => {
  const oldFetch = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('disabled worker must not call GitHub'); };
  try {
    await worker.scheduled(controller, { ...env, DISPATCH_ENABLED: 'false' });
    await worker.scheduled(controller, { ...env, DISPATCH_ENABLED: undefined });
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


test('GitHub validator authenticates exactly the Worker signing format', async () => {
  const nonce = 'c'.repeat(32), epoch = String(Math.floor(Date.now() / 1000));
  const secret = env.MOSAIC_OCI_CRON_HMAC_KEY;
  const signature = await signDispatch(epoch, nonce, secret);
  const verified = { EXTERNAL_CRON_ENABLED: 'true', WATCH_ENABLED: 'true',
    EXTERNAL_CRON_KEY: secret, CRON_EPOCH: epoch, CRON_NONCE: nonce,
    CRON_SIGNATURE: signature };
  assert.equal(verifiedCloudflareDispatch(verified), true);
  for (const delta of [
    { EXTERNAL_CRON_ENABLED: 'false' }, { WATCH_ENABLED: 'false' },
    { CRON_NONCE: 'b'.repeat(32) }, { CRON_EPOCH: 'not-a-time' },
    { CRON_SIGNATURE: '0'.repeat(64) }, { EXTERNAL_CRON_KEY: '' },
    { CRON_SIGNATURE: 'nothex' },
  ]) assert.equal(verifiedCloudflareDispatch({ ...verified, ...delta }), false);
  assert.equal(verifiedCloudflareDispatch(verified,
    (Number(epoch) + 601) * 1000), false);
  assert.equal(verifiedCloudflareDispatch(verified,
    (Number(epoch) - 61) * 1000), false);
  assert.equal(verifiedCloudflareDispatch(verified,
    Number(epoch) * 1000), true);
});

test('scheduler retains approved controller pin and opt-in HMAC launch gate', () => {
  const workflow = readFileSync(
    new URL('../.github/workflows/oci-a1-autoclaim.yml', import.meta.url), 'utf8');
  const wrangler = JSON.parse(readFileSync(
    new URL('./wrangler.jsonc', import.meta.url), 'utf8'));
  assert.match(workflow, /MOSAIC_CONTROLLER_SHA: 03e5c8dc6a0109d72604ca65582f692ea9978927/);
  assert.match(workflow, /MOSAIC_OCI_CLOUDFLARE_DISPATCH_ENABLED/);
  assert.match(workflow, /MOSAIC_OCI_CRON_HMAC_KEY/);
  assert.match(workflow, /github\.event_name == 'workflow_dispatch'/);
  assert.match(workflow, /node scheduler-source\/cloudflare\/verify-dispatch\.mjs/);
  assert.match(workflow, /cron: '18,48 \* \* \* \*'/);
  assert.match(workflow, /cron: '3,8,13,23,28,33,38,43,53,58 \* \* \* \*'/);
  assert.equal(Object.hasOwn(wrangler, 'vars'), false);
  assert.equal(wrangler.workers_dev, false);
  assert.deepEqual(wrangler.triggers.crons, ['*/5 * * * *']);
});
