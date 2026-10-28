// The only authority for allowing a non-scheduled workflow_dispatch to claim.
// This must run on the trusted default-branch SHA. No key or signed payload logs.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONTEXT = 'mosaic-oci-a1-scheduler/main/oci-a1-autoclaim.yml';

export function verifiedCloudflareDispatch(e, nowMs = Date.now()) {
  if (e.EXTERNAL_CRON_ENABLED !== 'true' || e.WATCH_ENABLED !== 'true' ||
      !e.EXTERNAL_CRON_KEY || !/^[0-9]{10}$/.test(e.CRON_EPOCH || '') ||
      !/^[0-9a-f]{32}$/.test(e.CRON_NONCE || '') ||
      !/^[0-9a-f]{64}$/.test(e.CRON_SIGNATURE || '')) {
    return false;
  }
  const age = nowMs / 1000 - Number(e.CRON_EPOCH);
  if (!Number.isFinite(age) || age < -60 || age > 600) return false;
  const input = CONTEXT + ':' + e.CRON_EPOCH + ':' + e.CRON_NONCE;
  const expected = createHmac('sha256', e.EXTERNAL_CRON_KEY).update(input).digest();
  const provided = Buffer.from(e.CRON_SIGNATURE, 'hex');
  return provided.length === expected.length && timingSafeEqual(expected, provided);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (verifiedCloudflareDispatch(process.env)) {
    appendFileSync(process.env.GITHUB_ENV,
      'MOSAIC_OCI_EXTERNAL_CRON_VERIFIED=true\n');
    console.log('Time-bounded external cron authentication succeeded');
  } else {
    console.log('External cron missing, stale or unauthorized: observe-only');
  }
}
