# Cloudflare deployment and review operations

The Worker serves the ten allowed static assets and routes API requests to a single SQLite-backed Durable Object. Validate the build and bundle with `npm run cloudflare:check`. Before deploying, update the template Worker name, account configuration, `PUBLIC_ORIGIN`, `OPERATOR_NAME`, and `OPERATOR_CONTACT` for your environment. `PUBLIC_ORIGIN` must match the exact HTTPS origin. Wrangler's version-controlled `v1` migration creates the `Workshop` Durable Object class, and `CF_VERSION_METADATA` exposes the running Worker `versionId`.

Configure `CG_ADMIN_TOKEN` (64 random lowercase hex characters), `QLOO_API_KEY`, and `CG_BASELINE_HASH` as private Worker secrets. Use interactive Wrangler secret prompts rather than passing secret values in source files, URLs, command-line arguments, or shared logs. Only the operator should hold the admin token.

## Ledger binding and quotas

The API budget ledger binds Qloo activation to a reviewed historical ledger import, its manifest digest (`CG_BASELINE_HASH`), the target `PUBLIC_ORIGIN`, and the Durable Object ID. Historical baseline import (`POST /api/operator/import`) accepts between 214 and 1,000 historical spent rows; the already-imported 214-row baseline manifest is retained on the hosted ledger without re-importing. Default local `SecurityCore` policy bounds its total policy field at 1,000 and sets a 21-day review-invite ceiling. The Cloudflare Worker runtime allows a cumulative ceiling of up to 2,000 calls (including all historical consumption, not 2,000 additional calls) only in `invited-review` mode, alongside the 200-call daily cap and 30-call per-room cap. Every outbound Qloo request reserves a slot before sending, with no automatic retries and no refunds on failure or timeout.

A fresh deployment can run the complete card flow with Qloo off; there is no fresh-ledger reset or activation wizard. Do not copy another operator's ledger, credentials, or counters to bypass this binding.

## Activation modes and version binding

The operator endpoints (`status`, `import`, `arm`, `stop`, `invite`, `review-invite`, `extend-review-invite`, and `revoke-review-invites` under `/api/operator`) require the exact configured origin and operator authentication. There is no public SQL endpoint.

Arming Qloo (`POST /api/operator/arm`) requires a recent `POST /api/operator/status` check first and must supply a fresh `bootNonce`, the verified baseline manifest digest, and observed cumulative and current-UTC-day counts that exactly match the current ledger. Independently compare the status counts against your preserved external floors first; a restored ledger below either external floor must stay stopped until a separately reviewed recovery is completed. `session` mode requires `bootNonce` (not `versionId`), whereas `invited-review` additionally requires the server's current Worker `versionId` and explicit `confirmation: "ARM_CLOUD_QLOO_CUMULATIVE_2000"` for every invited-review activation, including smaller ceilings. Session mode retains `confirmation: "ARM_CLOUD_QLOO_CUMULATIVE_1000"`.

Two activation modes are supported:

- **`session` (default):** Requires a fresh `bootNonce` (not `versionId`), enables Qloo for at most two hours under an explicit cumulative ceiling of at most 1,000 total calls, and switches off on any Worker restart or new deployment (`startup off`).
- **`invited-review`:** Designed for bounded judging on the operator's Cloudflare hosted review deployment. Once deployed and reviewed, the operator explicitly arms `invited-review` bound to the active server Worker `versionId` with `confirmation: "ARM_CLOUD_QLOO_CUMULATIVE_2000"`, capped by a hard cumulative ceiling of at most 2,000 calls (including all historical calls), a window of at most 30 days, and a hard deadline no later than November 17, 2026, 15:00 JST (06:00 UTC)—covering the rules judging window ending November 17, 2026, 13:45 JST—while the 200/day and 30/room caps remain in force. Normal Durable Object evictions or restarts running the **same** Worker `versionId` preserve an active `invited-review` grant. A new or missing Worker `versionId`, expiry, explicit stop, unresolved execution, or a failed post-arm ledger row disarms lookups, with no automatic resume. Exact pre-send quota checks block the next request once the cumulative, daily, or room cap is exhausted, even though quota exhaustion does not necessarily clear the stored enabled flag.

Because quotas are finite and upstream failures, infrastructure issues, or version changes can disarm or block lookups, no deployment guarantees full application or Qloo uptime; when only Qloo is unavailable, participants can still complete cards using their own words.

## Database restore, rollback, and PITR precautions

Durable Object storage rollback or point-in-time recovery (PITR) within the same Worker `versionId` has no independent runtime rollback detector. In addition, running a pre-2,000 Worker source version against storage whose ledger policy was raised above 1,000 fails closed with HTTP `503`; recover by deploying a compatible fix-forward Worker version rather than resetting the ledger. Before any database restore or rollback:

1. Call `POST /api/operator/stop` (or deploy a disarmed version) to stop Qloo lookups.
2. Record the highest known external cumulative and daily spent counts so the restored ledger cannot reuse spent budget slots.
3. Before restoring storage, deploy a **new** compatible Worker version, instantiate the Durable Object on that new version, and confirm its authenticated status is stopped. Keep that version active through the restore so a restored older `versionId`-bound grant cannot resume. Do not roll back before this new version has instantiated the Durable Object.
4. After the restore, confirm the new server version is still stopped, then inspect authenticated status and independently verify it against the preserved external cumulative and current-UTC-day floors. If either ledger count is below the external floor, the deployment must stay stopped. Never lower the external floor to make activation pass. There is no automatic restore reconciliation or reset route: a separately reviewed recovery procedure is required before any reactivation.
5. Revoke restored review invitations and reissue any needed keys before resuming room creation; restored counters must never be treated as fresh allowances.
6. Only after independent floor verification and any required recovery review are complete, explicitly arm with a fresh `bootNonce`, observed counts that exactly match the actual ledger, and—when arming `invited-review`—the new server `versionId` (plus `confirmation: "ARM_CLOUD_QLOO_CUMULATIVE_2000"` for every invited-review grant).

## Host and bounded review invitations

Standard host invitations (`POST /api/operator/invite`) are single-use and expire after one hour; each created room expires after two hours.

For hosted judging, authenticated operators can call `POST /api/operator/review-invite` with `expiresAt` (Unix milliseconds; in Cloudflare review mode, at most 30 days from issuance and no later than November 17, 2026, 15:00 JST / 06:00 UTC, while default local `SecurityCore` policy remains at most 21 days) and `maxRooms` (1–12, default 8). At most three unexpired review invitations can exist at once. Only the key digest is stored; deliver the returned key privately. The hosted judging key is limited to 8 separate two-hour rooms in total through the deadline, consumes its room allowance atomically on room creation, and cannot open an existing room or arm Qloo. Deleted or expired rooms do not refund the allowance.

To extend an existing active, unspent review key in place without replacing the key or replenishing its room count, call `POST /api/operator/extend-review-invite` with exact JSON body `{"invitation": "<raw-review-key>", "expiresAt": <unix-ms>}`. The new `expiresAt` must be strictly later than the current expiry, within 30 days of the key's original `issuedAt`, and no later than November 17, 2026, 15:00 JST (06:00 UTC). The endpoint updates only the expiration timestamp on an active, unrevoked, unspent key and returns metadata only (`extended`, `expiresAt`, `maxRooms`, `usedRooms`), keeping existing usage counts unchanged.

`POST /api/operator/revoke-review-invites` with `{}` disables new room creation across all review keys without deleting or revoking rooms that are already open; existing rooms keep their normal host password, participant-link, and two-hour expiry boundaries. Never embed admin tokens, Qloo API keys, or review invitation keys in URLs, public repository files, screenshots, or public project descriptions.
