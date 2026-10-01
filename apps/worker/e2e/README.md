# apps/worker/e2e — two-actor end-to-end tests for the pizza flow

Two Python scripts, both driving the **real** pages (`order.html` as the buyer,
`facilitator.html` as the facilitator) in a real browser with the real
`plugin-trust-ring` policy. Nothing is mocked and no verdict is read from page
text — assertions come from `window.__buyer.verdict`, `.checks`, `.attacks`.

| Script | What it does |
|--------|--------------|
| `test_pizza_flow.py` | The smoke test. Drives the two pages as two actors, asserts 11 outcomes, exits non-zero on any failure. Writes `~/reports/mcp-cashu-pizza/pizza-e2e-results.json`. |
| `record_demo.py` | Records the watchable demo video (~88s) and writes `trust-ring-pizza-flow.mp4`. |

## Run

```bash
~/.hermes/hermes-agent/venv/bin/python apps/worker/e2e/test_pizza_flow.py
~/.hermes/hermes-agent/venv/bin/python apps/worker/e2e/record_demo.py
```

Both scripts are self-contained: they start their own `http.server` on
`127.0.0.1` and their own headless Chrome, then clean both up. Nothing needs to
be started by hand and no port is left occupied.

## Toolchain note — read this before "fixing" the launch

On this box (Ubuntu 26.04):

- `npx playwright install chromium` **refuses** to install, and
- `p.chromium.launch(executable_path="/usr/bin/google-chrome-stable")` **hangs
  with no error**.

So both scripts start Chrome themselves with
`--headless=old --no-sandbox --disable-gpu --disable-dev-shm-usage
--remote-debugging-port=<port>` (Chrome adds the swiftshader GL profile that the
page needs) and attach with `p.chromium.connect_over_cdp(...)`. The Playwright
python package lives only in the Hermes venv — system `python3` does not have it.

Two more traps that cost real time:

- **Never wrap a recording run in a short timeout.** A 180s wrapper killed an
  encode mid-write and left a 48-byte mp4 that looked fine until probed. Always
  `ffprobe` the output.
- **Playwright records one video per page.** Driving the two actors as two tabs
  yields two videos and the second actor is never in frame. That is why
  `flow-demo.html` exists: it loads the same two pages as same-origin iframes,
  which keeps the real BroadcastChannel traffic and fits both actors in one
  recording.

## What is asserted

1. the buyer's trust set is pinned from the roster fixture (8 members, content hash)
2. honest facilitator → `verifyProof().ok === true`
3. all six displayed checks pass
4. anonymity set = ring size = 4
5. replay to a different order → rejected (real reason)
6. key-image reuse → first accepted, second rejected (real reason)
7. the payment step runs and is flagged simulated
8. the order lifecycle advances through all five stages
9. a ring containing a key outside the pinned set → rejected (real reason)
10. the rejection text names the trust set / outside key
11. the buyer displays the blocked state, not a pass

Honest scope: there is no Lightning node. The payment step is labelled
`SIMULATED` in the UI itself and moves no sats. The ring-signature verification
— the part this work is about — is real and runs the shipped policy.
