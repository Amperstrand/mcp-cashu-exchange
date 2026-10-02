# Hackathon demo script (5 minutes, with fallbacks)

The pitch in three sentences: **AI agents can already find services — we
made them payable.** One exchange (MCP + REST + library), real venues, real
Bitcoin rails, and a payment boundary that never touches a card number.
Everything you will see is open-source and leak-gated.

## The story beats

| # | Beat | What the audience sees | Fallback if live fails |
|---|---|---|---|
| 1 | Discovery | `curl mcp.cashu.exchange/api/services` — charging, cinema, food, federated parking | `npm run dev` locally, same call on :8787 |
| 2 | Pay for cinema with ecash | /berlin chat → offer → pay with a Testnut Cashu token → settled | Pre-captured screenshot of the settled offer |
| 3 | Real food, real venue | `npx jamezz menu 8613S3X` — the live Burgermeister Mehringdamm menu with EUR prices | Terminal recording (the CLI output is text) |
| 4 | Customer-facing POS | Numo on the phone: Burgermeister catalog, customer pays Cashu tap-2-pay (Testnut mint) | Emulator on the projector; or the Lightning QR tab |
| 5 | The order reaches the venue | numo-bridge places the order via the jamezz API → Mollie checkout URL → **the operator** completes it with their own card; order status shows `payStatus`, kitchen not fired until paid | Free-pipeline variant: submit, show order id + status, abandon at Mollie — costs nothing, proves the pipe |
| 6 | Why this is safe to open-source | Leak gates in CI, card-free repos by design, worker holds no card, collaborator audit done | This is a slide, not a demo — never fails |

Beat 5 is the differentiator — say it explicitly: **"The customer pays
Bitcoin; the venue gets paid the way it already accepts money. No card
number ever entered a repo, a secret, or a tool response."**

## Props checklist

- Phone with Numo installed (physical device `ZY326DPC7R` on ai-legion, or
  the demo phone) + a Cashu wallet holding Testnut sats (testnut.cashu.space
  auto-settles — load plenty beforehand).
- The operator card (2fiat or personal) for beat 5 — **the only card in the
  show, and it stays in a human hand.**
- `CLOUDFLARE_API_TOKEN` set — beats 1–2 live vs local depend on it.
- Terminal with the jamezz repo cloned, Node 22+.
- Charger, spare phone, exported screenshots in a folder as last resort.

## What we built (progress slide material)

- 48h timeline: one private kit → two leak-gated public repos
  (`jamezz`: client + prompts + offline test suite; `mcp-cashu-exchange`:
  registry, gateway, payment rails) + a POS integration in flight.
- The venue method is itself a deliverable: photograph any Jamezz QR →
  menu in one command (2000+ venues, 25 countries, Germany a main market).
- Full evidence trail: `docs/LIVE.md` (verified live calls), component
  status in README, this script.
