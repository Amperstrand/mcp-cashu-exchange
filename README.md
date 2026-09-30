# mcp.cashu.exchange

A **modular MCP service exchange**: one registry, one gateway, and swappable
payment rails for payable services — EV charging, food, and more. Built as a
hackathon project (Berlin, 2026) to let AI agents *discover* and *pay for*
real-world services.

**Live:** <https://mcp.cashu.exchange> · MCP endpoint: `POST https://mcp.cashu.exchange/mcp`

## The idea

An *exchange*, not a monolith. Three moving pieces:

1. **Native plugins** (public, in this repo) — safe to open-source: OpenStreetMap
   data, card rail wiring, generic contracts.
2. **Federated downstreams** (private, yours) — existing MCP servers
   (`oda-mcp`, `vipps-mcp`, …) mounted through the gateway. Their code and
   personal data never enter this repo; only their URL + token (secrets).
3. **Payment rails** — interchangeable `PaymentRail` implementations:
   `2fiat-card` (prepaid Mastercard funded from crypto), Cashu (via
   [pecan](https://github.com/zeugmaster/pecan) for alternative numeraires),
   Lightning (stretch).

## Layout

```
packages/
  contracts/                The two contracts: ServiceProvider, PaymentRail
  core/                     Registry + MCP server + downstream gateway + catalog
  plugin-berlin-charging/   OSM/Overpass charging stations (native plugin)
  plugin-pay-2fiat/         Prepaid Mastercard rail (card credentials via secrets)
  map/                      Map frontend (placeholder: worker serves Leaflet page)
  chat/                     Chat frontend (placeholder: any MCP client works today)
apps/
  worker/                   Composition root → deploys to mcp.cashu.exchange
```

## MCP tools

| Tool | What it does |
|---|---|
| `directory.list_services` | Catalog + native providers + payment rails |
| `gateway.list_downstreams` | Tools from federated downstream MCP servers |
| `berlin-charging.search` | EV chargers near a point (defaults: central Berlin) |
| `payment.quote` | Payment instructions for an amount, per rail |
| `payment.card_details` | Card credentials — only when card secrets are set |

## Develop

```sh
npm install
npm test          # vitest
npm run typecheck # tsc --noEmit (strict)
npm run check     # biome
npm run dev       # wrangler dev on :8787
```

Copy `.dev.vars.example` → `.dev.vars` for local secrets (gitignored).

## Deploy

Continuous deployment on push to `main` (`.github/workflows/deploy.yml`) via
`wrangler`. Required repo **secrets** (never committed — this repo is public):

- `CLOUDFLARE_API_TOKEN` — scoped token: *Workers Scripts:Edit* +
  *Zone:Read* (+ DNS:Edit in the `cashu.exchange` zone for the custom domain)
- `CLOUDFLARE_ACCOUNT_ID`

Worker runtime secrets (`wrangler secret put`, per-name):

- `TWOFIAT_CARD_PAN`, `TWOFIAT_CARD_EXP`, `TWOFIAT_CARD_CVC` — enables the
  card rail and `payment.card_details`
- `DOWNSTREAMS` — JSON array `[{"name":"oda-mcp","url":"https://…/mcp"}]`
  (plus a `TOKEN`-style secret per downstream if you extend the env parsing)

## Hygiene rules (why this repo stays clean)

1. Secrets only via `wrangler secret` / `.dev.vars` (gitignored) / GitHub
   Actions secrets. Never in code, commits, or issues.
2. Fixtures are synthetic. No real names, PANs, cookies, or order histories.
3. Reverse-engineered API knowledge lives in private kits; this repo consumes
   them through the gateway. A plugin that needs personal data is a private
   kit implementing the same MCP surface — not a plugin here.
4. `payment.card_details` exists for agent-driven checkout demos. When the
   card is not configured, the tool is not registered at all.

## Publication & leak policy

What may be public: contracts/types, synthetic fixtures (inline in tests, with
a provenance comment), architecture, infrastructure config that carries no
credential material.

What never enters this repo:

- **Card numbers, license plates, phone numbers, tokens, cookies, session
  captures** — in code, fixtures, docs, or comments.
- **Captured/sample payloads.** `**/fixtures/captures/`, `**/captures/`,
  `*.har`, `*.pcap` are gitignored. If a test needs a response shape, write a
  synthetic fixture and say so in a comment.
- **Reverse-engineered API knowledge stays in private kits** — this repo
  consumes it over MCP (the gateway), it does not vendor it.

Enforcement: `node scripts/leak-scan.mjs . --history` runs in CI on every PR
and push — PAN (Luhn-validated), Norwegian/German plates, phones, JWTs, Cashu
tokens, GitHub tokens, secret-shaped key/value pairs. Exceptions live in
`scripts/leak-scan-allowlist.txt` and **require a `# because:` justification**
line above each entry; unjustified entries fail the build.

## Adding a component

- **New provider** → new package implementing `ServiceProvider`, register it in
  `apps/worker/src/index.ts`. Tools appear automatically (`<id>.search`).
- **New rail** → implement `PaymentRail`, add to `exchangeDeps`.
- **Federate an existing MCP server** → append to `DOWNSTREAMS`. Done.

## License

MIT — see [LICENSE](LICENSE). Map data © OpenStreetMap contributors (ODbL).
