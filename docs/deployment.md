# Cloudflare deployment and review operations

The Worker serves the ten allowed static assets and routes API requests to a single SQLite-backed Durable Object. Validate the build and bundle with `npm run cloudflare:check`. Before deploying, update the template Worker name, account configuration, `PUBLIC_ORIGIN`, `OPERATOR_NAME`, and `OPERATOR_CONTACT` for your environment. `PUBLIC_ORIGIN` must match the exact HTTPS origin. Wrangler's version-controlled `v1` migration creates the `Workshop` Durable Object class.

Configure `CG_ADMIN_TOKEN` (64 random lowercase hex characters), `QLOO_API_KEY`, and `CG_BASELINE_HASH` as private Worker secrets. Use interactive Wrangler secret prompts rather than passing secret values in source files, URLs, command-line arguments, or shared logs. Only the operator should hold the admin token.

The API budget ledger binds activation to a reviewed historical ledger import, its digest, the target origin, and the Durable Object ID. It conservatively requires at least 214 historical spent slots and enforces a maximum cumulative ceiling of 1,000 calls. A fresh deployment can run the complete card flow with Qloo off, as there is no general fresh-ledger activation wizard. Do not copy another operator's ledger, credentials, or counters to bypass this binding.

Enabling Qloo requires an authenticated operator status check, matching externally recorded spent counts, a verified import digest, a current boot challenge, an explicit cumulative ceiling, and an activation window of at most two hours. Any Worker restart or deployment immediately disarms Qloo (`startup off`). Daily and per-room caps also apply. Started or uncertain requests remain counted as spent, with no automatic retries or refunds. The operator endpoints (`status`, `import`, `arm`, `stop`, and `invite` under `/api/operator`) require the exact configured origin and operator authentication. There is no public SQL endpoint.

Standard host invitations are single-use and expire after one hour; rooms expire after two hours. Issue host invitation keys close to the review session and deliver them privately alongside a contact channel for replacement if needed. The operator must arrange Qloo activation and confirm remaining budget before a live review. Never include the admin token or Qloo API key in judging instructions. Because quotas are finite and cold starts disarm lookups, unattended live Qloo availability cannot be guaranteed from the test URL alone.

## Bounded review invitations

Authenticated operators can use POST /api/operator/review-invite with expiresAt (Unix milliseconds, at most 21 days from issuance) and maxRooms (1–12, default 8). At most three unexpired review invitations can exist. Only the digest is retained; deliver the returned key privately. The review key creates separate two-hour rooms, consumes its allowance atomically, and does not give access to another room or activate Qloo. Deleted or expired rooms do not refund its allowance.

POST /api/operator/revoke-review-invites with an empty object disables new room creation with all review keys. It does not delete or revoke rooms that have already been created. Those rooms retain their normal password, participant-invitation and two-hour boundaries. After a storage restore, revoke and reissue review invitations; restored counters must not be treated as fresh allowances.

These endpoints do not change the existing cumulative Qloo ledger, the 1,000-call lifetime maximum, the 200/day and 30/room caps, manual two-hour activation, startup off, or no-retry rules. Review keys must never be embedded in URLs, public repository files, screenshots, or public project descriptions.
