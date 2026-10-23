# Common Ground

An online workshop icebreaker that turns a favorite work and the words behind it into a shared card. Participants write their own words first, explore optional Qloo feature tags and cross-domain works, refine their card, and publish it to the group. Run it beside a video call or Miro board.

English is the default, with a Japanese toggle. Hosts configure a room for 3–6 people and select how participants know each other. Draft works and words remain private until the participant publishes.

## Run locally

Use Node.js 24.22.1 (the version verified for this release) and npm.

```sh
npm ci
npm run preview:offline
```

Open http://127.0.0.1:4173 . The terminal prints a local-only, single-use host invitation key. Paste it into the **Create a new room** form and set a host password. Copy the participant invitation link into another browser profile or a private window.

This local preview uses an in-memory database and binds only to loopback (`127.0.0.1:4173`). All data clears when the process exits. Qloo stays off in offline preview, so no API credentials are required and the operator's production ledger is never touched. Press Ctrl+C to stop.

## Tests and build

```sh
npm test
npm run cloudflare:check
```

`npm test` runs the public test suite covering card editing, browser state, access controls, draft privacy, budget enforcement, and Cloudflare Worker routing. Tests use synthetic data and mocked network calls. Private development history and recorded API responses are excluded from this release.

## How Qloo contributes

The server searches for a work title, the participant selects the exact entity, and Qloo returns feature tags for that work plus related works from two other domains. Every item retains its source work and tag. Tags on a related work describe that work rather than explaining why it matched. Participants choose which prompts to include, and a card made only from a participant's own words is complete. Nicknames and personal words are never sent to Qloo.

The hosted runtime runs on Cloudflare Workers with a single SQLite-backed Durable Object. API keys remain Worker secrets. Every outbound Qloo call reserves a budget slot before sending, with no retries or refunds, under an owner-authorized 1,000-call lifetime maximum, a 200-call daily cap, and a 30-call per-room cap. Cookie sessions, single-use 1-hour host invitations, bounded review invitations, 256-bit participant links, salted host passwords, same-origin/CSRF checks, and 2-hour room expiry protect room data.

## Deployment

Update `wrangler.jsonc` with your own account settings and exact HTTPS origin before deploying; the repository file is a template rather than the operator's live configuration. A fresh deployment runs the complete card flow with Qloo off by default (`session` mode is startup-off and limited to two hours when armed). See [`docs/deployment.md`](docs/deployment.md) for required bindings, version-bound activation rules, and recovery procedures.

The hosted review deployment at https://common-ground-test.studio-gennai1.workers.dev/ uses a deployment-specific `invited-review` grant activated by the operator through November 6, 2026, 15:00 JST (06:00 UTC) within a 477-call cumulative ceiling (including 237 historical calls); this hosted grant is not automatic for forks or new deployments, and lookups can still stop on quota exhaustion or runtime failure. See [judging instructions](docs/judging.md).

## License

MIT, Copyright (c) 2026 STUDIO-GENNAI. See `LICENSE` and `THIRD_PARTY_NOTICES.md`. Third-party components and Qloo data retain their respective licenses and terms.
