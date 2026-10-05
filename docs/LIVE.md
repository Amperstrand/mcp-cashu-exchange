# What is deployed today + handover

> **⚠️ Domain handover executed 2026-10-05 (mcp-oda #10): `mcp.cashu.exchange`
> and `api.cashu.exchange` now serve the DropShop agent-gateway**, not this
> worker.** Verified live: `tools/list` on `mcp.cashu.exchange/mcp?token=demo`
> returns the gateway's 19-tool set (`orders_*`, `orders_intent`, cinema
> snapshot world, wallet, checkout), `/api/search?category=food` answers
> 200, and `/api/health` is green. The gateway deploys that completed the
> handover: versions `d1c2b6f2` → `3a353e7d` (attestation modes, OrderGate
> race fix, 2026-10-05 snapshot refresh, /pos, map badges).
>
> **Footgun DEFUSED (2026-10-05):** the route claim on `mcp.cashu.exchange`
> is removed; the worker now defaults to its `workers.dev` subdomain, so a
> deploy from this repo can no longer steal the gateway's domain. If a
> custom home is wanted later (e.g. `hub.cashu.exchange`), add that route
> and set `workers_dev: false` — one deliberate edit, no hazard.
>
> The sections below this notice describe the pre-handover exchange hub and
> are kept as the reference for restoring/rehoming that surface.

## Surfaces (all live)

| Surface | What it is |
|---|---|
| `GET /health` | liveness: `{"ok":true,"service":"mcp.cashu.exchange","version":"0.0.1"}` |
| `GET /` | meta-refresh to `/demo` |
| `GET /demo` | demo page |
| `GET /berlin` | cinema box-office chat (Cashu-settled) |
| `GET /map.html` | Leaflet map of Berlin EV chargers |
| `GET /api/services` | catalog + providers + rail ids (JSON) |
| `GET /api/charging?lat&lng&radiusKm` | chargers near a point (OSM/Overpass, KV-cached) |
| `POST /api/chat` | demo chat agent — body `{"session","message"}` |
| `POST /api/chat/pay` | settle a chat offer with a Cashu token — body `{"session","offer_id","token"}` |
| `POST /mcp` | the MCP server (streamable HTTP, stateless) |

## The MCP endpoint

`POST https://mcp.cashu.exchange/mcp` with `content-type: application/json`
and `accept: application/json, text/event-stream`. The server is
**stateless**: one request = one server instance; no `initialize` handshake
is required — `tools/list` and `tools/call` work directly. Responses arrive
as SSE `data:` lines.

Five tools are registered on the live build:

| Tool | Verified behavior today |
|---|---|
| `directory.list_services` | catalog (europark-mcp, pecan, evmap, energy, cashu.exchange) + native providers + rails |
| `gateway.list_downstreams` | **europark-mcp is federated and reachable**: reports `parking.search`, `parking.details` (EasyPark-backed zones) |
| `berlin-charging.search` | OSM chargers near a point. Cold Overpass calls take ~20 s; results are KV-cached (10 min) — retry is fast |
| `cinema.search` | 3-film Berlin programme (Primetime 20 sat, Vaterland 18, Das geträumte Abenteuer 15) |
| `payment.quote` | returns `[]` on the live build (see status note above). After the next deploy: the own-card handoff instructions |

Example session (all verified):

```sh
# list tools
curl -sS -X POST https://mcp.cashu.exchange/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'

# search chargers (first call ~20 s, then cached)
curl -sS -X POST https://mcp.cashu.exchange/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{
        "name":"berlin-charging.search",
        "arguments":{"near":{"lat":52.52,"lng":13.405},"radiusKm":1}}}'

# tonight's programme
curl -sS "https://mcp.cashu.exchange/api/charging?lat=52.52&lng=13.405&radiusKm=1"
curl -sS -X POST https://mcp.cashu.exchange/api/chat \
  -H 'content-type: application/json' \
  -d '{"session":"my-session","message":"two tickets for tonight please"}'
```

Point any MCP client at the URL above (streamable HTTP transport); no auth.

## The cinema chat, end to end

1. Open <https://mcp.cashu.exchange/berlin> (or `POST /api/chat`).
2. "two tickets for tonight" → the agent lists films with sat prices.
3. Name a film and quantity → the agent returns an **offer** with
   `offer_id` and an amount in sats (pending offers live in KV, 15-min TTL).
4. Get a Testnut Cashu token from
   [cashu.exchange](https://cashu.exchange) (demo funds source).
5. Paste the token → `POST /api/chat/pay` settles it at the Testnut mint
   and confirms.

## Handover: run it yourself

```sh
git clone git@github.com:Amperstrand/mcp-cashu-exchange.git
cd mcp-cashu-exchange
npm install
cp .dev.vars.example .dev.vars   # optional: DOWNSTREAMS
npm run dev                       # wrangler dev on :8787
```

Tests, typecheck, lint, leak gate: `npm test && npm run typecheck &&
npm run check && npm run gate`. Commit through `sh scripts/git-commit.sh`
(the environment does not run git hooks; CI runs the same scan regardless).

**To deploy**: set the repo secret `CLOUDFLARE_API_TOKEN` (Workers
Scripts:Edit + Zone:Read) — push to `main` then deploys automatically.
That single action also publishes the card-free payment rail.

**To extend** (README has the full map):

- New provider → implement `ServiceProvider`, register in
  `apps/worker/src/index.ts`; a `<id>.search` tool appears automatically.
- Federate an MCP server → append to the `DOWNSTREAMS` secret.
- A venue provider already exists upstream: the
  [jamezz](https://github.com/Amperstrand/jamezz) package reads menus and
  prepares orders (Burgermeister Mehringdamm is the worked example); wiring
  it in as `plugin-jamezz` is the top open build (README → Component status).

**Payments rule** ([docs/PAYMENT.md](PAYMENT.md)): the payment boundary is
the merchant's hosted checkout URL. No card number, ever, in a repo, secret,
or tool — participants pay with their own card (personal or
[2fiat](https://2fiat.com)).

**Known issues:** #1 deploy token (blocks everything above), #3 hardcoded
cinema programme (stale-data policy). Cold Overpass latency is cached away
after the first hit.

**Known quirks (verified 2026-10-01):**

- `cinema.search` with `text` matches **film titles only** —
  `text:"Primetime"` returns that film, `text:"drama"` returns `[]`. Omit
  `text` for the whole programme.
- `berlin-charging.search` and `/api/charging` take ~20 s on a cold
  Overpass call, then are KV-cached for 10 minutes. A first-time timeout
  is usually just Overpass, not an outage — retry.
- `gateway.list_downstreams` reflects the `DOWNSTREAMS` secret; if it is
  ever unset, the tool reports zero downstreams rather than erroring.
