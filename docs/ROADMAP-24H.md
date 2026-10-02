# Roadmap — the next 24 hours (hackathon run-up)

> **Status 2026-10-02, post-demo:** the hackathon presentation is delivered.
> Completed: the POS loop (proven E2E), the 4-venue catalog, the demo reel,
> the presentation kit, contributor onboarding, and the deploy pipeline
> (prod branch + reviewer-gated `production` environment). The only item
> that never landed was the deploy token itself — everything merged is
> live-on-next-deploy. Keep the blocks below as the historical run-up; the
> forward view is the README component table plus issues.

Owners: **you** = presenter/owner; **numo-dev** = the Herdr-managed agent on
ai-legion (workspace `numo-pos`, poll with
`herdr --machine ai-legion agent read numo-dev`); **here** = this session.

## T-24 → T-22 — unblock and verify (owner: you, 10 minutes)

1. **Create the scoped Cloudflare token** (My Profile → API Tokens →
   Create Custom Token): *Account → Workers Scripts → Edit* and
   *Zone → Zone → Read*, account resource = your account only, zone
   resource = `cashu.exchange` only.
2. **Add it as an environment secret**: repo Settings → Environments →
   `production` → secrets → `CLOUDFLARE_API_TOKEN` (+
   `CLOUDFLARE_ACCOUNT_ID`). The `prod` branch and its protections are
   already in place; the deploy job waits for a reviewer and the secrets
   before doing anything.
3. Merge `main` → `prod` (or approve the pending run), then confirm
   `curl mcp.cashu.exchange/health` and `/api/search?category=food` match
   `docs/LIVE.md`. Update LIVE.md's build-status paragraph.

## T-22 → T-16 — POS integration lands (owner: numo-dev)

**Status 2026-10-02: proven early.** APK built, catalog imported, bridge
live (24 tests), two webhook payments (Cashu + Lightning) drove a real
venue order through `prepare()+submit()`; checkout answered HTTP 200 and
was abandoned per the no-payment rule. The drift it surfaced (jamezz#5)
is fixed upstream (`77920fa`). Remaining in this block: un-shim the bridge
onto the fixed package (in progress), one optional re-verify during venue
hours, move to the physical phone for the stage.

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
