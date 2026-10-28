## 2026-10-28: Live Cloudflare dispatch confirmed; OCI diagnostics pin

Signed Cloudflare workflow_dispatch runs 40635476174, 40635958804 and 40636436658 reached GitHub at ~five-minute spacing. HMAC and OCI setup passed; all three failed at LaunchInstance with the previous combined sanitized IAM/parameter category. After accepted OCI Preview full CI and trusted READY deployment, the dedicated scheduler pin is updated to 492f920721ff8c26406c8b2e07ce977881bfe96d so future launches report the safe specific OCI error identifier. VM arguments, quotas, single-instance check, HMAC, no retry, and five-minute cron remain unchanged. Do not report VM claimed until `instance_created` and OCI Console verification. Existing GitHub cron stays for now; retirement requires separate verified cutover. Cloudflare Worker is already deployed and dispatch enabled by the owner; no secret values are stored in this repository.

---

## Cloudflare cron dispatch candidate (NOT ACTIVE, October 28, 2026)

The five-minute GitHub cron has been highly unreliable (10 recorded schedule runs on October 27 versus 288 nominal). This repo stages an alternative Cloudflare Worker under `cloudflare/`, with `*/5 * * * *` UTC cron and no public HTTP route. **The deployed Worker remains inert until the private `DISPATCH_ENABLED` secret is set to `true`.** The current GitHub native schedule remains unchanged until independently verified cutover.

Cloudflare executes only a GitHub `workflow_dispatch` through a narrowly scoped **fine-grained token with Actions:write on this dedicated repository only**. It does not contain Oracle credentials. The Worker signs an epoch timestamp + 16-byte nonce using a shared random HMAC-SHA256 key; GitHub verifies the signature, requires `MOSAIC_OCI_WATCH_ENABLED=true` and an independent `MOSAIC_OCI_CLOUDFLARE_DISPATCH_ENABLED=true` variable, and rejects expired, future, missing or invalid signatures. Only the exact accepted controller SHA supporting `MOSAIC_OCI_EXTERNAL_CRON_VERIFIED=true` can attempt a claim. Unsigned manual dispatch, including `audit_launch_prereqs`, remains observe-only. Existing `MOSAIC_OCI_AUTOLAUNCH`, Always Free and quota confirmation checks, fixed 2 OCPU/12 GiB/50 GiB, one-instance guard, private IP and no-retry controls stay mandatory. This time-bounded signature is not a durable replay store; protect the limited GitHub token and shared HMAC key and rotate them on compromise.

### Acceptance/cutover (operator actions, not performed by committing files)

1. **Controller accepted:** OCI stable Preview `492f920721ff8c26406c8b2e07ce977881bfe96d` passed focused and canonical Quality Gate #40630333455 and has Vercel Preview `dpl_5EjPgTZDvqYR6Y2xJ4cQgP3enTFM` READY. This task PR updates its immutable `MOSAIC_CONTROLLER_SHA` pin. Verify that exact SHA before and after merging this scheduler PR; the new external trigger remains disabled by default.
2. Create a long random HMAC key and store **only in secret stores** as GitHub Actions repository secret `MOSAIC_OCI_CRON_HMAC_KEY` and Cloudflare Worker secret `MOSAIC_OCI_CRON_HMAC_KEY`. Never commit the value or print it to logs.
3. Create a fine-grained GitHub token scoped to **this repository only**, repository **Actions: write**, with expiration and rotation. Store it as Cloudflare Worker secret `GH_ACTIONS_TOKEN`. Never use a broad personal token or store GitHub tokens as ordinary Worker variables.
4. From `cloudflare/`, run `npx wrangler deploy` using the owner's authorized Cloudflare session. The absence of a `DISPATCH_ENABLED` secret makes deployment dormant; `workers_dev=false` disables an HTTP endpoint. Set `DISPATCH_ENABLED` as a Worker secret (literal `true`) only during the approved cutover; a secret persists across later Wrangler deployments. Run `node --test cloudflare/worker.test.mjs` from repo root first.
5. After source pin, secrets and read-only verification are complete, explicitly enable GitHub repository variables `MOSAIC_OCI_CLOUDFLARE_DISPATCH_ENABLED=true`, `MOSAIC_OCI_WATCH_ENABLED=true` and Cloudflare Worker secret `DISPATCH_ENABLED=true`. Check at least several GitHub `workflow_dispatch` records, authentication step and OCI report results. If the server is claimed, disable both scheduler triggers and verify cloud resources and billing immediately.
6. Only after demonstrated cadence, remove the old GitHub cron using a reviewed deployment (retain manual observe-only dispatch) to avoid duplicate schedules. GitHub 204 dispatch success is not evidence of a completed execution. Detect missed dispatches and failed jobs by independent monitoring; Cloudflare cron and GitHub runners are also best-effort. Do not change Production.
   
---

# Mosaic OCI A1 capacity scheduler

This dedicated GitHub Actions repository is separate from the Mosaic application's protected Production branches. It holds **no Oracle credentials in source control**. Its Git history and Actions logs will become public if its visibility is changed. Workflow: [OCI A1 capacity claim](.github/workflows/oci-a1-autoclaim.yml).

## Current setup status

**Manual capacity plus read-only launch-prerequisites audits verified SUCCESS; the first two `schedule` events were recorded at 15:01 UTC on October 19, 2026. One completed successfully, reporting `OUT_OF_HOST_CAPACITY`, and one was skipped. VM launching is OFF.** This workflow uses the accepted Mosaic controller commit `6fe15940fae40adc7d4728a6ea26ea6c289314c9`. The safety gate `MOSAIC_OCI_WATCH_ENABLED` is unset by default, so scheduled jobs are skipped until the operator completes secret setup and verifies the first manual report. Manual dispatch is always **observe-only**, even if the launch flag is set.

## Required Actions secrets (Settings → Secrets and variables → Actions)

Add eight **encrypted repository secrets**, not ordinary variables:

| Name | Value from Oracle |
|---|---|
| `MOSAIC_OCI_TENANCY_OCID` | `tenancy=` from dedicated bot API config |
| `MOSAIC_OCI_USER_OCID` | `user=` from dedicated bot API config |
| `MOSAIC_OCI_FINGERPRINT` | `fingerprint=` from dedicated bot API config |
| `MOSAIC_OCI_API_KEY_PEM` | Full, multiline content of dedicated bot's API **private key** PEM; never a public key |
| `MOSAIC_OCI_COMPARTMENT_OCID` | `MosaicA1` compartment's OCID |
| `MOSAIC_OCI_SUBNET_OCID` | Existing selected subnet in root compartment, `mosaic-vcn`, Singapore |
| `MOSAIC_OCI_IMAGE_OCID` | Current supported **Ubuntu 24.04 A1-compatible** image OCID in Singapore |
| `MOSAIC_OCI_SSH_PUBLIC_KEY` | A new Ed25519/RSA **public** SSH key line. Never paste the SSH private key. |

Do not put real secret values in a commit, GitHub issue, chat message, screenshot, or workflow log. Protect the Oracle API private PEM; consider disabling its key after removing the VM claim task.

## Safe test then enable observe-only schedule

1. Verify the existing `MosaicA1` compartment quota policy is active and enforced (2 A1 OCPU, 12 GiB A1 memory, 50 GiB combined boot/block storage). Inspect Always Free usage and set Oracle budget/alerts.
2. Install all eight **secrets** in this dedicated repository. Keep `MOSAIC_OCI_AUTOLAUNCH`, `MOSAIC_OCI_FREE_TIER_CONFIRMED`, `MOSAIC_OCI_QUOTA_CONFIRMED`, `MOSAIC_OCI_FAST_POLL` and `MOSAIC_OCI_WATCH_ENABLED` **unset** initially.
3. Open **Actions → OCI A1 Always Free capacity claim (private scheduler) → Run workflow** on `main`. Check the advisory result; it cannot create a VM because the controller requires a scheduled event. For a deeper *read-only* IAM, image, subnet, inventory and SSH preflight, enable **audit_launch_prereqs** in the Run workflow form. The audit tests reads only; it cannot prove permission to create a VM or actual billing/quota enforcement.
4. Keep the repository **variable** `MOSAIC_OCI_WATCH_ENABLED=true` for observe-only scheduled monitoring. It checks at UTC :18 and :48 (**every 30 minutes while private**). This variable alone **cannot launch a VM**.
5. Following a source/history/log audit, change the repository's visibility to **public** in GitHub Settings → General → Danger Zone → Change repository visibility. The workflow then admits the ten additional cron windows, requesting **every 5 minutes** without private runner-minute charges, if the watch variable remains enabled. The `MOSAIC_OCI_FAST_POLL` variable no longer controls this schedule. Restrict `main` to trusted writers; never execute untrusted PR code with secrets. After conversion, confirm real `schedule` runs. GitHub can delay/drop scheduled events.
6. VM auto-launch remains separately disabled. Do not enable `MOSAIC_OCI_AUTOLAUNCH=true`, `MOSAIC_OCI_FREE_TIER_CONFIRMED=CONFIRMED`, and `MOSAIC_OCI_QUOTA_CONFIRMED=CONFIRMED` until the owner separately approves the residual billing/launch risk after a verified quota/IAM rehearsal. The controller then attempts at most one 2-OCPU/12-GiB A1 instance with 50-GiB boot, private IP only, no automatic Appwrite setup or retry.

The GitHub cron service is best-effort and may delay/skip jobs; available capacity reports are advisory, not a guaranteed instance allocation. Conversion makes historical GitHub Actions logs public. On October 19, 2026, a pattern scan found no obvious credentials in 11 commit patches or 6 available job logs; 8 runs had no artifacts. This is not a guarantee that every sensitive value was absent. Public standard GitHub-hosted runners are free; private standard runners consume quota.

Detailed [Mosaic source runbook](https://github.com/carlers/mosaic-life-tracker/blob/6fe15940fae40adc7d4728a6ea26ea6c289314c9/life-tracker/docs/OCI_GITHUB_A1_AUTOMATION.md). Resume coordination in [issue #975](https://github.com/carlers/mosaic-life-tracker/issues/975).
