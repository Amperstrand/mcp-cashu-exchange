---
marp: true
theme: default
paginate: true
---

<!-- Render: npx @marp-team/marp-cli@latest docs/slides.md -o docs/slides.html -->

# **mcp.cashu.exchange**

## Agents that pay for the real world

Berlin · 2026 · Amperstrand

---

# The gap

- Agents can **find** services — search, maps, MCP servers everywhere
- They cannot **pay**: commerce ends at a checkout page built for humans
- Wiring in a card means card numbers in code, secrets, and logs
- Bitcoin rails exist — but nothing connects them to real merchants

**We connected them. Safely.**

---

# The idea

One exchange, three pieces:

- **Registry** of payable services — food, charging, cinema, parking
- **Gateway** to federated private kits (their data never goes public)
- **Swappable payment rails** — Cashu, own-card checkout handoff, Lightning (stretch)

One capability, **many surfaces**: MCP tool, REST, library, CLI.
The client decides how to talk to us.

---

# Architecture

```
 participant ──► worker (Cloudflare)
   own inbox (cashu.email npub)      POST /mcp · /api/search · chat
   own card (2fiat or personal)        │
        │                              ▼
        │              registry ── charging · cinema · jamezz food
        │              gateway ──► private kits (europark parking)
        │              rails ──── own-card handoff (holds no card)
        ▼
   Numo POS ── customer pays Bitcoin (Cashu tap / Lightning)
        │
        ▼
   numo-bridge ──► jamezz client ──► venue API ──► Mollie checkout
                                              (operator completes, own card)
```

Full diagram: README · Verified surfaces: docs/LIVE.md

---

# Real venue, real menu

- Jamezz: **2,000+ venues, 25+ countries** — Germany is a main market
- One photographed table QR → full menu in **one command**
  (`npx jamezz menu 8613S3X` — live, EUR prices)
- Worked example: **Burgermeister Mehringdamm**, Berlin
- 21 offline tests against synthetic transports — no captured data
- The onboarding method is a deliverable: `prompts/` in the jamezz repo

---

# The customer pays Bitcoin

**Numo** (cashubtc) — Android POS:

- Cashu ecash **tap-2-pay** (NFC) and **Lightning** invoices
- Catalog loaded from our API — the real menu, real prices
- Customer-side rail needs no account, no card, no KYC

---

# The venue gets paid its way

1. Paid basket → **numo-bridge** → jamezz `prepare()+submit()`
2. Venue creates the order → **Mollie hosted checkout URL**
3. **The operator** completes it with their own card
4. `payDirect=1`: the kitchen fires only when the venue is paid

Customer paid Bitcoin. Venue got paid normally.
**No card number entered any system of ours.**

---

# The boundary (why this is open-source-safe)

- No PAN, CVC, or card automation in **any** repo, secret, or tool response
  — the card-details tool was deleted, not gated
- **Leak gates** in CI: tree + full git history, both repos, every push
- Commit-time blockers for HAR/log/env files
- Access audit: 12 collaborators removed, 7 invites revoked (private kits)
- Payment boundary = a hosted checkout URL + a human hand

---

# Live now (verified 2026-10-02)

- `mcp.cashu.exchange` — health OK, 5 MCP tools, stateless streamable HTTP
- Cinema chat **settled in Cashu** (Testnut mint)
- Berlin EV map (OSM/Overpass, KV-cached)
- Federated parking (europark-mcp) answering through the gateway
- Weekly smoke: live venue check, green

Everything merged goes public the moment the deploy token is set.

---

# 48 hours

- Day 0: one private kit, captured data, cards in fixtures
- Day 1: extraction → **two leak-gated public repos**; card-free refactor;
  collaborator + card audit; architecture + live docs
- Day 2: typed client, offline test suites, CLI, generic REST surface,
  plugin-jamezz, **Numo POS integration in flight**
- Method documented as prompts — new venue ≈ one photograph

---

# Roadmap

- **Now**: deploy token → live `jamezz.search` + `/api/search`
- **Hours**: Numo catalog on hardware phone, bridge order test (free pipeline)
- **Next**: more tables (a lunch trip = +1 venue), pecan numeraires,
  npm publish decision
- **Vision**: any QR-ordering venue on Earth, payable in Bitcoin,
  safely open-sourceable

---

# Try it

**docs/TOUR.md** — zero to a paid burger in one afternoon:

1. Call the live exchange (5 min)
2. Order real food with your own card (30 min)
3. Run the exchange yourself (10 min)
4. Extend it — prompts do the onboarding

**github.com/Amperstrand/mcp-cashu-exchange**
**github.com/Amperstrand/jamezz**

One prompt and a QR code away from a paid burger.
