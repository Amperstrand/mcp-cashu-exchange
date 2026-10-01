# plugin-trust-ring — Browser E2E Harness

End-to-end browser happy-path smoke test for the LSAG ring-signature trust gate.
Records a Playwright video of the full walkthrough: setup → prove → verify → 4 attack scenarios → summary.

## What this tests

The harness loads the **real** bundled package source (not mocks) in a browser and
drives the complete narrative:

1. **Setup** — Trust set published (8 members, pinned by content hash)
2. **Operator generates key pair** — secp256k1 key pair in the trust set
3. **Operator produces trust proof** — LSAG ring signature over a 4-member ring
4. **Client verifies** — Honest proof accepted (pin match, subset check, LSAG valid, key image fresh)
5. **Attack 1: Non-member** — Forged signature rejected (LSAG won't close)
6. **Attack 2: Outside key** — Ring not subset of pinned set, rejected
7. **Attack 3: Replay** — Proof for order A rejected for order B (message binds order)
8. **Attack 4: Key image reuse** — Double-spend rejected (one-use enforced)
9. **Summary** — All attacks defeated, anonymity set = ring size

Every value displayed comes from executing the real `src/*.ts` modules in the browser.

## Files

| File | Purpose |
|------|---------|
| `harness.html` | Self-contained page that imports the bundle and drives the narrative UI |
| `build-bundle.mjs` | esbuild script: bundles `src/index.ts` → `dist/trust-ring.bundle.js` |
| `dist/trust-ring.bundle.js` | Bundled IIFE (real source + @noble/curves + @noble/hashes, ~99KB, committed) |
| `record.py` | Playwright script: opens harness, runs beats, asserts, records video |
| `record-run.sh` | One-shot: clears stale videos, records, converts to mp4, probes the result |
| `trust-ring-happy-path.mp4` | Recorded video (H.264, 1280×720, ~55s) — gitignored; the copy of record lives in `~/reports/mcp-cashu-trust-ring/` |
| `videos/` | Raw webm captured by Playwright — gitignored |

## Rebuild the bundle

```bash
cd packages/plugin-trust-ring
node e2e/build-bundle.mjs
```

This uses esbuild (already in the repo) to bundle `src/index.ts` with all dependencies
(`@noble/curves`, `@noble/hashes`) into a single **IIFE** file that assigns every
export to `window.__trustRing` — IIFE, not ESM, so the page loads from `file://`
without CORS blocking module imports.

## Re-record the video

```bash
# 1. Start Chrome with CDP enabled (headless + swiftshader)
/usr/bin/google-chrome-stable --headless=old --no-sandbox --disable-gpu \
  --disable-dev-shm-usage --remote-debugging-port=9333 \
  --user-data-dir=/tmp/pw-trust-ring &

# 2. Record + convert + probe in one shot
bash e2e/record-run.sh
```

`record.py` connects to that Chrome over CDP (`connect_over_cdp`). Do NOT use
`p.chromium.launch()` with a Playwright-bundled browser here: on Ubuntu 26.04 the
installer refuses (`Playwright does not support chromium on ubuntu26.04-x64`), and
a hand-rolled Chrome launch without swiftshader leaves the page without the GL
profile it needs.

Requirements:
- Playwright python package (Hermes venv only — system python3 lacks it)
- System Chrome at `/usr/bin/google-chrome-stable`
- ffmpeg at `/usr/bin/ffmpeg`

Runtime note: the walkthrough itself takes ~39s; under load (this box regularly
sits at load 20+ on 4 cores) allow up to 5 minutes for the record step. A 180s
timeout is NOT enough — that is what truncated an earlier attempt mid-encode.

Output:
- `e2e/trust-ring-happy-path.mp4` (H.264, 1280×720, yuv420p)
- `/home/c03rad0r/reports/mcp-cashu-trust-ring/trust-ring-happy-path.mp4`

## How it works

1. `build-bundle.mjs` uses esbuild to bundle the real TypeScript source into a
   single ESM JavaScript file with all `@noble` dependencies inlined.
2. `harness.html` imports this bundle as `type="module"`, runs the real
   `generateKeyPair`, `prove`, `verifyProof`, `sign`, `verify` functions, and
   renders a beat-by-beat narrative UI.
3. `record.py` opens the harness in headless Chrome via Playwright, clicks
   "Run Walkthrough", waits for each beat, asserts every beat's verdict, and
   records the session as video (webm → mp4 via ffmpeg).

No crypto or policy logic is reimplemented in the harness — the browser executes
the exact same source as the Node.js test suite.