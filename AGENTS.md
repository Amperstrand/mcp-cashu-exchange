# Publication rules

This repository is public. Treat every file as if a stranger will read it.

## Never commit

- Card numbers, expiry, CVC, or a 2fiat / prepaid card in any form.
- HAR files, pcaps, logs, screenshots of a checkout page, cookies, session
  dumps, `.env`, `.dev.vars`, identity files, or secret keys.
- A tool response or secret that returns or stores a PAN. There is no
  `payment.card_details` and no card-shaped secret in this repo; keep it that
  way. The public payment boundary is a checkout URL (docs/PAYMENT.md).

Logs and HAR files are how a card number leaks. They are gitignored.
`git add -f` on one of them must still fail the pre-commit hook.

## Before a public push

1. `sh scripts/install-hooks.sh` once per clone.
2. Commit with `sh scripts/git-commit.sh`, not bare `git commit`. This
   environment does not launch git hooks, so the wrapper is the local gate.
3. `node scripts/leak-scan.mjs . --history` — must print 0 findings.
4. Do not name private repos, people, or machine paths in new docs.
   CI rejects a push that fails the scan.
