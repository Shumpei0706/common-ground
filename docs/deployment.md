# Cloudflare deployment and review operations

The Worker serves the ten allowed static assets and routes API requests to a single SQLite-backed Durable Object. Validate the build and bundle with `npm run cloudflare:check`. Before deploying, update the template Worker name, account configuration, `PUBLIC_ORIGIN`, `OPERATOR_NAME`, and `OPERATOR_CONTACT` for your environment. `PUBLIC_ORIGIN` must match the exact HTTPS origin. Wrangler's version-controlled `v1` migration creates the `Workshop` Durable Object class, and `CF_VERSION_METADATA` exposes the running Worker `versionId`.

Configure `CG_ADMIN_TOKEN` (64 random lowercase hex characters), `QLOO_API_KEY`, and `CG_BASELINE_HASH` as private Worker secrets. Use interactive Wrangler secret prompts rather than passing secret values in source files, URLs, command-line arguments, or shared logs. Only the operator should hold the admin token.

## Ledger binding and quotas

The API budget ledger binds Qloo activation to a reviewed historical ledger import, its manifest digest (`CG_BASELINE_HASH`), the target `PUBLIC_ORIGIN`, and the Durable Object ID. It requires at least 214 historical spent slots in the imported baseline; the hosted ledger currently contains 237 spent slots and enforces a global owner-authorized lifetime maximum of 1,000 calls alongside a 200-call daily cap and a 30-call per-room cap. Every outbound Qloo request reserves a slot before sending, with no automatic retries and no refunds on failure or timeout.

A fresh deployment can run the complete card flow with Qloo off; there is no general fresh-ledger activation wizard. Do not copy another operator's ledger, credentials, or counters to bypass this binding.

## Activation modes and version binding

The operator endpoints (`status`, `import`, `arm`, `stop`, `invite`, `review-invite`, and `revoke-review-invites` under `/api/operator`) require the exact configured origin and operator authentication. There is no public SQL endpoint.

Arming Qloo (`POST /api/operator/arm`) requires a recent `POST /api/operator/status` check first and must supply a fresh `bootNonce`, the verified baseline manifest digest, and observed cumulative and current-UTC-day counts that exactly match the current ledger. Independently compare the status counts against your preserved external floors first; a restored ledger below either external floor must stay stopped until a separately reviewed recovery is completed. `session` mode requires `bootNonce` (not `versionId`), whereas `invited-review` additionally requires the server's current Worker `versionId`.

Two activation modes are supported:

- **`session` (default):** Requires a fresh `bootNonce` (not `versionId`), enables Qloo for at most two hours under an explicit cumulative ceiling (up to the 1,000-call lifetime maximum), and switches off on any Worker restart or new deployment (`startup off`).
- **`invited-review`:** Designed for bounded judging on the operator's hosted review deployment. The operator explicitly arms `invited-review` bound to the active server Worker `versionId`, capped by a hard cumulative ceiling of at most 477 calls (including the 237 historical calls, providing up to 240 new calls), a window of at most 21 days, and a hard deadline no later than November 6, 2026, 15:00 JST (06:00 UTC), while the 1,000-call global lifetime maximum, 200/day cap, and 30/room cap remain in force. Normal Durable Object evictions or restarts running the **same** Worker `versionId` preserve an active `invited-review` grant. A new Worker `versionId`, expiry, explicit stop, or unresolved execution stops lookups. Exact pre-send quota checks block the next request once the cumulative, daily, or room cap is exhausted, even though quota exhaustion does not necessarily clear the stored enabled flag.

Because quotas are finite and upstream failures, infrastructure issues, or version changes can disarm or block lookups, no deployment guarantees full application or Qloo uptime; when only Qloo is unavailable, participants can still complete cards using their own words.

## Database restore, rollback, and PITR precautions

Durable Object storage rollback or point-in-time recovery (PITR) within the same Worker `versionId` has no independent runtime rollback detector. Before any database restore or rollback:

1. Call `POST /api/operator/stop` (or deploy a disarmed version) to stop Qloo lookups.
2. Record the highest known external cumulative and daily spent counts so the restored ledger cannot reuse spent budget slots.
3. Before restoring storage, deploy a **new** Worker version and confirm its authenticated status is stopped. Keep that version active through the restore so a restored older `versionId`-bound grant cannot resume. Do not roll back before this new version has instantiated the Durable Object.
4. After the restore, confirm the new server version is still stopped, then inspect authenticated status and independently verify it against the preserved external cumulative and current-UTC-day floors. If either ledger count is below the external floor, the deployment must stay stopped. There is no automatic restore reconciliation or reset route: a separately reviewed recovery procedure is required before any reactivation.
5. Revoke restored review invitations and reissue any needed keys before resuming room creation; restored counters must never be treated as fresh allowances.
6. Only after independent floor verification and any required recovery review are complete, explicitly arm with a fresh `bootNonce`, observed counts that exactly match the actual ledger, and—when arming `invited-review`—the new server `versionId`. Never lower the external floor to make activation pass.

## Host and bounded review invitations

Standard host invitations (`POST /api/operator/invite`) are single-use and expire after one hour; each created room expires after two hours.

For hosted judging, authenticated operators can call `POST /api/operator/review-invite` with `expiresAt` (Unix milliseconds, at most 21 days from issuance; set to November 6, 2026, 15:00 JST / 06:00 UTC for the hosted review window) and `maxRooms` (1–12, default 8). At most three unexpired review invitations can exist at once. Only the key digest is stored; deliver the returned key privately. The hosted judging key is limited to 8 separate two-hour rooms through the deadline, consumes its room allowance atomically on room creation, and cannot open an existing room or arm Qloo. Deleted or expired rooms do not refund the allowance.

`POST /api/operator/revoke-review-invites` with `{}` disables new room creation across all review keys without deleting or revoking rooms that are already open; existing rooms keep their normal host password, participant-link, and two-hour expiry boundaries. Never embed admin tokens, Qloo API keys, or review invitation keys in URLs, public repository files, screenshots, or public project descriptions.
