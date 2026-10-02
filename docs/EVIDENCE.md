# Evidence pack — every claim, and where to verify it

Snapshot taken **2026-10-02T07:02Z**. Re-verify any line with the command
shown. The live worker runs the pre-`33e5343` build (deploy token pending,
issue #1) — see [docs/LIVE.md](LIVE.md) for what that means.

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

## In flight

- **Numo POS integration** (ai-legion, Herdr-managed agent `numo-dev`,
  workspace `numo-pos`): Android POS showing the Burgermeister menu,
  Cashu/Lightning customer payment, order placement through the jamezz API,
  operator completes the venue checkout. Status: working (checked at
  snapshot time). Its design doc will land as `INTEGRATION.md` in the
  private `numo-bridge` repo.
- Everything already merged and waiting on the deploy token: `jamezz.search`
  (food + live menu preview), generic `/api/search`, KV-cached searches,
  cinema name matching, card-free `payment.quote`.

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
