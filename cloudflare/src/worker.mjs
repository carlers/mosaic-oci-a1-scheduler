// #975. No HTTP endpoint or OCI credentials: Cloudflare only dispatches the
// reviewed GitHub workflow. Requires operator-installed secrets and explicit opt-in.
const ENDPOINT = 'https://api.github.com/repos/carlers/mosaic-oci-a1-scheduler/actions/workflows/oci-a1-autoclaim.yml/dispatches';
const CONTEXT = 'mosaic-oci-a1-scheduler/main/oci-a1-autoclaim.yml';

function hex(bytes) {
  return [...bytes].map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function signDispatch(epoch, nonce, secret) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key,
    new TextEncoder().encode(CONTEXT + ':' + epoch + ':' + nonce));
  return hex(new Uint8Array(signature));
}

export default {
  async scheduled(controller, env) {
    if (env.DISPATCH_ENABLED !== 'true') {
      console.log('MOSAIC_OCI_CLOUDFLARE_DISABLED');
      return;
    }
    if (controller.cron !== '*/5 * * * *') throw new Error('Unexpected cron source');
    if (!env.GH_ACTIONS_TOKEN || !env.MOSAIC_OCI_CRON_HMAC_KEY) {
      throw new Error('Missing private GitHub dispatch token or signing key');
    }
    const epoch = String(Math.floor(Date.now() / 1000));
    const nonce = hex(crypto.getRandomValues(new Uint8Array(16)));
    const signature = await signDispatch(epoch, nonce, env.MOSAIC_OCI_CRON_HMAC_KEY);
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.GH_ACTIONS_TOKEN,
        'Accept': 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'mosaic-oci-a1-cron',
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: { dispatch_epoch: epoch, dispatch_nonce: nonce,
          dispatch_signature: signature },
      }),
    });
    // 204 means GitHub accepted a dispatch, NOT that a job or VM claim completed.
    if (response.status !== 204) {
      throw new Error('GitHub workflow dispatch rejected: HTTP ' + response.status);
    }
    console.log('MOSAIC_OCI_GITHUB_DISPATCH_ACCEPTED');
  },
};
