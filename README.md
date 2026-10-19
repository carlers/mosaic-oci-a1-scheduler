# Mosaic OCI A1 private capacity scheduler

This private GitHub Actions repository is separate from the Mosaic application's protected Production branches. It holds **no Oracle credentials in source control**. Workflow: [OCI A1 capacity claim](.github/workflows/oci-a1-autoclaim.yml).

## Current setup status

**Manual capacity check verified successful; scheduled polling is owner-enabled, VM launching is OFF.** This workflow uses the accepted Mosaic controller commit `6fe15940fae40adc7d4728a6ea26ea6c289314c9`. The safety gate `MOSAIC_OCI_WATCH_ENABLED` is unset by default, so scheduled jobs are skipped until the operator completes secret setup and verifies the first manual report. Manual dispatch is always **observe-only**, even if the launch flag is set.

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
2. Install all eight **secrets** in this private repository. Keep `MOSAIC_OCI_AUTOLAUNCH`, `MOSAIC_OCI_FREE_TIER_CONFIRMED`, `MOSAIC_OCI_QUOTA_CONFIRMED`, `MOSAIC_OCI_FAST_POLL` and `MOSAIC_OCI_WATCH_ENABLED` **unset** initially.
3. Open **Actions → OCI A1 Always Free capacity claim (private scheduler) → Run workflow** on `main`. Check the advisory result; it cannot create a VM because the controller requires a scheduled event. For a deeper *read-only* IAM, image, subnet, inventory and SSH preflight, enable **audit_launch_prereqs** in the Run workflow form. The audit tests reads only; it cannot prove permission to create a VM or actual billing/quota enforcement.
4. After a successful observe-only run, set repository **variable** `MOSAIC_OCI_WATCH_ENABLED=true` to allow **30-minute** scheduled monitoring (UTC :17 and :47). This alone **cannot launch a VM**.
5. Fast monitoring is optional: setting repository variable `MOSAIC_OCI_FAST_POLL=true` increases the requested cadence to every **5 minutes**. GitHub Free private runners have a shared 2,000-minute monthly allowance; five-minute polling is at least 8,640 minute-rounded runs in 30 days and may cost money. Review GitHub Actions budget and stop-on-budget settings before enabling fast mode.
6. VM auto-launch remains separately disabled. Do not enable `MOSAIC_OCI_AUTOLAUNCH=true`, `MOSAIC_OCI_FREE_TIER_CONFIRMED=CONFIRMED`, and `MOSAIC_OCI_QUOTA_CONFIRMED=CONFIRMED` until the owner separately approves the residual billing/launch risk after a verified quota/IAM rehearsal. The controller then attempts at most one 2-OCPU/12-GiB A1 instance with 50-GiB boot, private IP only, no automatic Appwrite setup or retry.

The GitHub cron service is best-effort and may delay/skip jobs; available capacity reports are advisory, not a guaranteed instance allocation.

Detailed [Mosaic source runbook](https://github.com/carlers/mosaic-life-tracker/blob/6fe15940fae40adc7d4728a6ea26ea6c289314c9/life-tracker/docs/OCI_GITHUB_A1_AUTOMATION.md). Resume coordination in [issue #975](https://github.com/carlers/mosaic-life-tracker/issues/975).
