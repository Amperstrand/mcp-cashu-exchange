# Roadmap — the next 24 hours (hackathon run-up)

Owners: **you** = presenter/owner; **numo-dev** = the Herdr-managed agent on
ai-legion (workspace `numo-pos`, poll with
`herdr --machine ai-legion agent read numo-dev`); **here** = this session.

## T-24 → T-22 — unblock and verify (owner: you, 10 minutes)

1. **Set `CLOUDFLARE_API_TOKEN`** (repo secret; Workers Scripts:Edit +
   Zone:Read). Issue #1. Everything merged goes live on the next push:
   `jamezz.search`, `/api/search`, KV-cached searches, cinema fix,
   card-free rail. Wrangler dry-run bundling already verified (376 KB gzip).
2. Push any trivial commit to trigger deploy; confirm
   `curl mcp.cashu.exchange/health` and `/api/search?category=food` match
   `docs/LIVE.md`. Update LIVE.md's build-status paragraph.

## T-22 → T-16 — POS integration lands (owner: numo-dev)

Phase 0/1: APK built, `INTEGRATION.md` written, Burgermeister catalog
imported into Numo, screenshot captured. Known risk already hit:
**ai-legion disk is 100% full** (agent shrank the AVD to a 2G partition).
Preferred fix: install Numo on the physical device `ZY326DPC7R` and demo on
hardware — better on stage anyway. Fallback: free disk on ai-legion or run
the emulator on ai-legion-small.

Phase 2: numo-bridge (private repo) — operator taps the paid basket →
jamezz `prepare()+submit()` → Mollie URL rendered as link + QR. One
free-pipeline order test during venue opening hours (submit, show status,
abandon — never pay during rehearsal unless it is the final demo).

## T-16 → T-12 — make it concrete (owner: you + here)

- Lunch trip: photograph one more Burgermeister table QR (any location) →
  row in `src/venues.ts` → catalog re-import → demo shows *two* venues.
- If venue mapping is impossible: rehearse with the Mehringdamm table only;
  the CANDIDATES.md discovery method is the story, not the count.
- Rehearse `docs/DEMO.md` end-to-end once; note which beats need practice.

## T-12 → T-8 — assets (owner: here + you)

- Screenshot pack for slides: /api/services JSON, berlin chat settled
  offer, `npx jamezz menu` output, Numo catalog, the Mollie handoff screen.
- One short screen-recording of the Numo tap-2-pay as the no-fail fallback.
- Slide skeleton: pitch (3 sentences from DEMO.md) → architecture diagram
  (README) → live beats → safety story → roadmap/vision (pecan numeraires,
  more venues, npm publish).

## T-8 → T-4 — freeze and rehearse (owner: everyone)

- Code freeze: only fixes after this point. Both repos green, Smoke green.
- Second full rehearsal with the fallback ladder. Time each beat; cut to
  5 minutes. Decide the beat-5 variant (real operator payment vs
  free-pipeline) based on venue hours and card funding.

## T-4 → T-0 — final checks (owner: you)

- `CLOUDFLARE_API_TOKEN` still valid, worker healthy, KV cache warm
  (hit `/api/search?category=food` once before stage).
- Phone charged, Testnut sats loaded, operator card funded (~€10 covers
  the cheapest €3.10 order + fees), emulator booted as backup.
- Repo tabs open: README (diagram), docs/LIVE.md, docs/DEMO.md.

## Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Deploy token never set | certain unless you act | beats 1–2 fall back to `npm run dev`; do it at T-24 anyway |
| ai-legion disk full breaks the emulator | already happened | physical device first choice; 2G AVD already shrunk |
| Venue closed at demo time | check hours | free-pipeline variant needs no kitchen; menu read works 24/7 |
| NFC tap flaky on stage | possible | switch to the Lightning QR tab — same rail story |
| Real payment accident | must be zero | Only the operator ever pays; rehearsal rule: abandon at Mollie |
| Live venue API drift | low (Smoke green) | cached search results + CLI recording |
