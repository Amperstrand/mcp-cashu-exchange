# Evidence pack — every claim, and where to verify it

Snapshot **2026-10-02T07:02Z**, extended post-demo (18:50Z):
demo delivered (reel + live beats; POS footage verified frame-by-frame),
catalog at 4 live-verified tables, trust-lane PR #10 reviewed and approved
(CI pending a formatting fix), demo assets committed under `docs/assets/`.
Re-verify any line with the command shown. The live worker still runs the
pre-`33e5343` build (deploy token pending, issue #1) — see
[docs/LIVE.md](LIVE.md).

## Live service

| Claim | Verify |
|---|---|
| Exchange healthy | `curl mcp.cashu.exchange/health` → `{"ok":true,...,"version":"0.0.1"}` (re-verified at snapshot time) |
| 5 MCP tools live | `POST /mcp` `tools/list` → directory, gateway, berlin-charging, cinema, payment.quote (re-verified at snapshot time) |
| Federated parking answers | `tools/call gateway.list_downstreams` → europark-mcp with `parking.search`, `parking.details` |
| Cinema chat settles Cashu | open `/berlin`, pay an offer with a Testnut token (verified 2026-10-01, recorded in LIVE.md) |
| Real venue menu, one command | `npx jamezz menu 8613S3X` — live read, EUR prices (verified 2026-10-01 and by the weekly Smoke workflow) |

## Tests and CI

| Repo | Tests | CI |
|---|---|---|
| mcp-cashu-exchange | 36 passing (5 files), incl. offline provider + HTTP route tests | green on every push; Deploy red only on the missing token (issue #1) |
| jamezz | 21 passing (6 files), fully offline against synthetic transports | green on every push; Smoke workflow green (read-only live venue check, weekly + on demand) |

Re-verify: `npm test` in either repo; `gh run list -R Amperstrand/<repo>`.

## Leak gates and the card-free proof

- Both repos scan clean on tree **and** full git history
  (`node scripts/leak-scan.mjs . --history` → 0 findings). Rules include
  Luhn-validated PANs, plates, phones, tokens, secret-shaped pairs.
- Commit-time enforcement in both repos (`.githooks` + `scripts/git-commit.sh`
  wrapper + path-blocker for HAR/log/env files) and the same scan in CI.
- No card number exists in any public repo, secret, or tool response: the
  `payment.card_details` tool and its `TWOFIAT_CARD_*` secrets were deleted
  (commit `33e5343`); the worker's only runtime secret is `DOWNSTREAMS`;
  the live tools list contains no card tool. Design rationale:
  [docs/PAYMENT.md](PAYMENT.md).
- Access audit (aggregate, no names): 12 collaborator memberships removed
  and 7 pending invitations revoked across 10 private data repos on
  2026-10-01, verified clean afterwards.

## Issue trail (work tracked, not claimed)

Closed: exchange #2 #3 #4 #5, jamezz #1 #2 #3.
Open by design: exchange #1 (deploy token — owner action), jamezz #4
(npm publish decision).
Verify: `gh issue list -R Amperstrand/mcp-cashu-exchange --state all`,
`gh issue list -R Amperstrand/jamezz --state all`.

## Proven E2E — the POS loop (2026-10-02)

- **Numo POS integration** (ai-legion, Herdr-managed agent `numo-dev`):
  Numo fork (v1.9 base) + private `numo-bridge` (converter, bridge,
  demo-payer; 24 tests green).
- **Two live customer payments** drove the loop end to end over the webhook
  — one Cashu/nostr, one Lightning.
- **A real guest order reached the venue** through `prepare()+submit()` and
  the hosted checkout answered HTTP 200, then was abandoned per the
  no-payment-during-rehearsal rule (order and session identifiers withheld
  from public repos on purpose — see jamezz `docs/ORDERING.md`; evidence
  lives in the private bridge repo and local screenshots).
- The integration surfaced real platform drift (jamezz-v2.0 shapes), filed
  as jamezz#5 and **fixed upstream the same day** (commit `77920fa`, 22
  offline tests) — the quirk → test → lesson loop working as designed.
- Bridge runs dry-run by default (`ALLOW_SUBMIT` off); secrets in `0600`
  files outside git, history scan clean.

## Waiting on the deploy token

Everything merged and live-on-next-deploy: `jamezz.search` (food + live
menu preview), generic `/api/search`, KV-cached searches, cinema name
matching, card-free `payment.quote`.

## Documentation index

| Doc | What |
|---|---|
| [TOUR.md](TOUR.md) | zero → paid burger in one afternoon |
| [DEMO.md](DEMO.md) | 5-minute demo script with fallbacks |
| [ROADMAP-24H.md](ROADMAP-24H.md) | the 24-hour run-up plan + risk register |
| [LIVE.md](LIVE.md) | deployed-today surface with verified calls |
| [PAYMENT.md](PAYMENT.md) | the own-card payment pattern |
| [slides.md](slides.md) | the presentation deck (Marp) — rendered: <https://amperstrand.github.io/mcp-cashu-exchange/slides.html> |
| [jamezz docs](https://github.com/Amperstrand/jamezz/tree/main/docs) | ordering, venues, candidates, participant guide |
