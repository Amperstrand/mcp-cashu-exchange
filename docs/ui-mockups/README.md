# UI mockups — pizza order flow with ring-signature facilitator vetting

Design artifact, not shipped code. See `GAP-ANALYSIS.md` for what exists today,
what is missing, and the recommendations.

Open `mockups.html` in a browser:

- no query string → all screens in a grid
- `mockups.html?s=4` → one screen full-bleed (this is how `shot.sh` renders)

Palette matches the existing app (`apps/worker/public/berlin.html`):
`--bg #0f1115`, `--panel #171a21`, `--accent #f7931a`, `--ok #34d399`.

## Screens

| # | Screen | Status | Note |
|---|--------|--------|------|
| 1 | Discover pizzerias | partly exists (chat) | vetted-facilitator count per pizzeria |
| 2 | Menu + basket | partly exists (chat) | sats pricing is native, no fiat switch |
| 3 | Who fulfils it | **NEW UI** | facilitator choice with trust badges |
| 4 | **Verifying the facilitator** | **NEW UI** | the core beat: pin, ring proof, six checks, anonymity |
| 5 | Pay with bitcoin | **NEW UI** | BOLT11 QR + Cashu ecash as secondary |
| 6 | Order tracking | missing today | release-on-delivery, not release-on-proof |
| 7 | Order blocked | **NEW UI** | the four attack cases map onto one screen |
| 8 | Facilitator app | **NEW UI · operator side** | no operator screen exists today |

## Re-render the screenshots

```bash
bash shot.sh        # writes screens/screen-<n>.png at 840x1760 (2x)
```

Uses system Chrome in headless mode — no Playwright needed for static mockups.
That is deliberate: the Playwright/CDP route on this box is fragile (see the
`happy-path-playwright` skill), and static screenshots do not need a browser
driver.
