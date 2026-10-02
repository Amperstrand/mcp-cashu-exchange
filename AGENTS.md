# AGENTS.md — contributing to mcp-cashu-exchange

A modular MCP service exchange: one registry of payable services, a gateway
to federated private kits, and swappable payment rails. Public by design —
**one capability, many surfaces**: every provider is reachable as an MCP
tool (`<id>.search`), as REST (`/api/search?category=…`), and as a library.
Read the [README](README.md) (architecture diagram + component status) and
[docs/TOUR.md](docs/TOUR.md) first; this file is how to work here safely.

## Repo map

| Path | What |
|---|---|
| `packages/contracts` | the two contracts: `ServiceProvider`, `PaymentRail` |
| `packages/core` | registry + MCP server + downstream gateway + catalog |
| `packages/plugin-*` | native providers (charging, cinema, jamezz food) and the card-free rail |
| `apps/worker` | composition root → deploys to `mcp.cashu.exchange` (Hono routes, chat, Cashu settle, KV cache) |
| `docs/` | TOUR · LIVE (deployed today, verified) · DEMO · ROADMAP-24H · EVIDENCE · PAYMENT · slides |
| `scripts/` | leak gate, commit wrapper, hook installer |

## Dev loop

```sh
npm install
npm test          # vitest — offline; providers tested via injected transports
npm run typecheck # tsc --noEmit (strict)
npm run check     # biome (warnings pre-exist in biome.json; errors fail CI)
npm run gate      # leak scan, tree + history
npm run dev       # wrangler dev on :8787
```

Conventions:

- Strict TypeScript. No `as any`/`@ts-ignore`; Zod at boundaries (HTTP
  input, KV payloads), plain readonly types inside.
- Tests are offline by construction: inject `fetchImpl` fakes for
  providers (see `packages/plugin-jamezz/test`), `app.request()` for HTTP
  routes (see `apps/worker/test/routes.test.ts`). Synthetic fixtures only,
  with a provenance comment.
- Adding a provider → implement `ServiceProvider`, register it in
  `apps/worker/src/index.ts`; the `<id>.search` tool appears automatically.
  Wrap slow upstreams with `withKvCache` (per-provider key prefix).
- Federating an MCP server → append to the `DOWNSTREAMS` secret. Never
  vendor a private kit's code or data here.

## Commits and CI

Commit with `sh scripts/git-commit.sh` (the wrapper runs the staged leak
scan; this environment does not execute git hooks). CI runs the same gates
on every push and PR — leak scan, biome, typecheck, tests. Keep it green;
small PRs; issues before big designs.

## Deploy

Deploys run **only from the protected `prod` branch** through the
`production` environment (README → Deploy for the full flow): PR review on
`prod`, environment reviewer approval before secrets are touched, full
gates re-run, then `wrangler deploy`. Secrets live only as environment
secrets — never in the repo, never on `main`-only runs. The worker serves
only `mcp.cashu.exchange` (`workers_dev: false`).

## Publication rules (hard boundaries)

This repository is public. Treat every file as if a stranger will read it.

Never commit:

- Card numbers, expiry, CVC, or a 2fiat / prepaid card in any form.
- HAR files, pcaps, logs, screenshots of a checkout page, cookies, session
  dumps, `.env`, `.dev.vars`, identity files, or secret keys.
- A tool response or secret that returns or stores a PAN. There is no
  `payment.card_details` and no card-shaped secret in this repo; keep it
  that way. The public payment boundary is a checkout URL
  ([docs/PAYMENT.md](docs/PAYMENT.md)).
- Names of private repos, people, or machine paths in docs.

Logs and HAR files are how a card number leaks. They are gitignored.
`git add -f` on one of them must still fail the pre-commit hook.

Before a public push:

1. `sh scripts/install-hooks.sh` once per clone.
2. Commit with `sh scripts/git-commit.sh`, not bare `git commit`.
3. `node scripts/leak-scan.mjs . --history` — must print 0 findings.
4. Checkpoint-page screenshots stay local, never committed (they can carry
   a live payment session link).

CI rejects a push that fails the scan.
