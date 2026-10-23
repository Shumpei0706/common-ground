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

The server searches for a work title, the participant selects the exact entity, and Qloo returns feature tags for that work plus related works from two other domains. Every item retains its source work and tag. Tags on a related work describe that work rather than explaining why it matched. Participants choose which prompts to include. Nicknames and personal words are never sent to Qloo.

The hosted runtime runs on Cloudflare Workers with a single SQLite-backed Durable Object. API keys remain Worker secrets. Every outgoing Qloo call reserves a budget slot before dispatch under cumulative (up to 1,000), daily, and per-room caps, using fixed endpoints, bounded responses, and no automatic retries. Cookie sessions, single-use 1-hour host invitations, 256-bit participant links, salted host passwords, same-origin/CSRF checks, and 2-hour room expiry protect room data.

## Deployment

Update `wrangler.jsonc` with your own account settings and exact HTTPS origin before deploying; the repository file is a template rather than the operator's live configuration. See `docs/deployment.md` for required bindings and operational rules. The hosted review URL is https://common-ground-test.studio-gennai1.workers.dev/ . Host invitation keys and live Qloo activation windows are coordinated separately for review.

## License

MIT, Copyright (c) 2026 STUDIO-GENNAI. See `LICENSE` and `THIRD_PARTY_NOTICES.md`. Third-party components and Qloo data retain their respective licenses and terms.
