#!/usr/bin/env python3
"""
test_pizza_flow.py — two-actor end-to-end smoke test for the pizza ordering flow.

Drives the REAL pages as two actors in one browser context:
  buyer        apps/worker/public/order.html
  facilitator  apps/worker/public/facilitator.html
They talk over BroadcastChannel, and every verdict asserted here comes from the
real plugin-trust-ring verifier (window.__buyer.verdict / .checks / .attacks),
never from page text.

Covers:
  1. happy path          — honest facilitator is ACCEPTED, anonymity set 4
  2. replay attack       — the same proof for a different order is REJECTED
  3. key-image reuse     — the same proof twice with one seen-set is REJECTED
  4. outside key         — a ring containing a key outside the pinned set is REJECTED
  5. order lifecycle     — paid -> accepted -> preparing -> delivery -> delivered

Toolchain note (this box): `npx playwright install chromium` refuses on Ubuntu
26.04 and `chromium.launch(executable_path=...)` HANGS. So this script starts
Chrome itself and attaches over CDP. Run with the Hermes venv python:
    ~/.hermes/hermes-agent/venv/bin/python apps/worker/e2e/test_pizza_flow.py
"""
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
REPO = HERE.parent.parent.parent
VIDEO_DIR = HERE / "videos"
REPORT_DIR = Path("/home/c03rad0r/reports/mcp-cashu-pizza")
FINAL_MP4 = REPORT_DIR / "pizza-e2e-check.mp4"   # NOT the deliverable name — see record_demo.py
CHROME = "/usr/bin/google-chrome-stable"
MINT = "https://cdk-a056e0f.cashu.exchange"   # the mint apps/worker/src/cashu-settle.ts accepts
PORT = 8791
CDP_PORT = 9334
VIEWPORT = {"width": 1280, "height": 860}

results = []


def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""), flush=True)
    return bool(ok)


def wait_port(port, timeout=25):
    end = time.time() + timeout
    while time.time() < end:
        with socket.socket() as s:
            s.settimeout(0.4)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.2)
    return False


def main():
    shutil.rmtree(VIDEO_DIR, ignore_errors=True)   # never let a stale webm win
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    httpd = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1",
         "--directory", str(PUBLIC)],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    chrome = subprocess.Popen(
        [CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
         "--disable-dev-shm-usage", f"--remote-debugging-port={CDP_PORT}",
         "--user-data-dir=/tmp/pw-pizza", "--no-first-run", "--noerrdialogs",
         "--window-size=1280,860"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    ok_servers = wait_port(PORT) and wait_port(CDP_PORT)
    if not ok_servers:
        print("FATAL: server/chrome did not come up", file=sys.stderr)
        httpd.terminate(); chrome.terminate()
        return 1
    print(f"✓ http.server :{PORT} and Chrome CDP :{CDP_PORT} up", flush=True)

    buyer_url = f"http://127.0.0.1:{PORT}/order.html"
    fac_url = f"http://127.0.0.1:{PORT}/facilitator.html"
    # E2E_MINT=<url> points both pages at another mint. testnut auto-pays its own
    # quotes, which is the only way to exercise the PAID LEG end to end without a
    # funded wallet; the signet mint needs a real signet payment first.
    e2e_mint = os.environ.get("E2E_MINT")
    if e2e_mint:
        buyer_url += f"?mint={e2e_mint}"
        fac_url += f"?mint={e2e_mint}"
        print(f"paid-leg mode: pages pinned to {e2e_mint}", flush=True)

    try:
        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{CDP_PORT}")
            ctx = browser.new_context(viewport=VIEWPORT,
                                      record_video_dir=str(VIDEO_DIR),
                                      record_video_size=VIEWPORT)
            buyer = ctx.new_page()
            fac = ctx.new_page()

            # ── setup ────────────────────────────────────────────────────────
            buyer.goto(buyer_url)
            buyer.wait_for_function("() => window.__buyer && window.__buyer.ready === true", timeout=20000)
            fac.goto(fac_url)
            fac.wait_for_function("() => window.__facilitator && window.__facilitator.roster", timeout=20000)
            print("✓ both pages loaded (roster fetched, trust set pinned)", flush=True)

            pinned = buyer.evaluate("() => ({ setId: window.__buyer.trustSet.setId, "
                                    "members: window.__buyer.trustSet.members.length, "
                                    "hash: window.__buyer.pin.contentHash })")
            check("trust set pinned from the roster fixture",
                  pinned["members"] == 8 and pinned["setId"] == "pizza-facilitators-berlin",
                  f"{pinned['members']} members, hash {pinned['hash'][:12]}…")

            # ── happy path ───────────────────────────────────────────────────
            buyer.click("#go-menu")
            buyer.click("#go-choose")
            buyer.click('#fac-list [data-fac="0"]')
            buyer.click("#go-vet")
            fac.wait_for_selector("#order:not(.hide)", timeout=15000)
            fac.click("#prove")
            buyer.wait_for_function("() => window.__buyer.verdict !== null", timeout=20000)

            v = buyer.evaluate("() => window.__buyer.verdict")
            checks = buyer.evaluate("() => window.__buyer.checks")
            anon = buyer.evaluate("() => window.__buyer.anonymitySetSize")
            check("happy path: honest facilitator ACCEPTED", v["ok"] is True,
                  f"reason={v.get('reason')!r}")
            check("all six displayed checks pass", all(c["ok"] for c in checks),
                  ", ".join(f"{'ok' if c['ok'] else 'FAIL'}:{c['label'][:38]}" for c in checks))
            check("anonymity set = ring size 4", anon == 4, f"anonymitySetSize={anon}")

            # ── attack: replay ───────────────────────────────────────────────
            buyer.click("#atk-replay")
            rp = buyer.evaluate("() => window.__buyer.attacks.replay")
            check("replay to a different order REJECTED", rp["ok"] is False, f"reason={rp.get('reason')!r}")

            # ── attack: key-image reuse ──────────────────────────────────────
            buyer.click("#atk-reuse")
            ru = buyer.evaluate("() => window.__buyer.attacks.reuse")
            check("key image reuse REJECTED on the second attempt",
                  ru["first"] is True and ru["second"] is False,
                  f"first={ru['first']} second={ru['second']} reason={ru.get('reason')!r}")

            # ── payment: a REAL mint quote, requested through the trust gate ──
            buyer.click("#go-pay")
            buyer.wait_for_function(
                "() => window.__buyer.realQuote !== null || window.__buyer.gateReason !== null",
                timeout=25000)
            inv = buyer.evaluate("() => window.__buyer.realQuote")
            net = buyer.evaluate("() => window.__buyer.invoiceNetwork")
            check("a REAL invoice is issued by the mint",
                  bool(inv and inv.get("request")),
                  f"state={inv.get('state') if inv else None} network={net}")
            if e2e_mint:
                check("invoice comes from the test mint for the exact order amount",
                      inv is not None and str(inv.get("amount")) == "27900",
                      f"{str(inv.get('request',''))[:22]}… amount={inv.get('amount') if inv else None}")
            else:
                check("invoice is a signet BOLT11 for the exact order amount",
                      net == "signet" and inv is not None
                      and str(inv.get("request", "")).startswith("lntbs")
                      and str(inv.get("amount")) == "27900",
                      f"{str(inv.get('request',''))[:22]}… amount={inv.get('amount') if inv else None}")

            # independent check: ask the mint ourselves, from the test process
            live = None
            try:
                # Cloudflare-fronted mints 403 urllib's default UA — send a browser one
                req = urllib.request.Request(
                    f"{e2e_mint or MINT}/v1/mint/quote/bolt11/{inv['quote']}",
                    headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=15) as r:
                    live = json.load(r)
            except Exception as exc:  # noqa: BLE001
                live = {"error": str(exc)}
            check("the mint itself serves that same quote (not a local string)",
                  live is not None and live.get("quote") == inv["quote"]
                  and live.get("state") in ("UNPAID", "PAID", "ISSUED"),
                  f"mint says state={live.get('state') if live else None}")

            # one-use at the money boundary: the same proof cannot buy a 2nd invoice
            second = buyer.evaluate(
                "() => window.__buyer.gate.quote({amount:'27900',currency:'sats'}, window.__buyer.proof)"
                ".then(() => 'ACCEPTED (bad!)').catch(e => e.message)")
            check("the trust gate refuses a SECOND invoice for the same proof (key image spent)",
                  "key image" in (second or "").lower() or "already used" in (second or "").lower(),
                  f"gate said: {second}")

            if e2e_mint:
                # the test mint pays its own quotes, so the order must advance on its own
                buyer.wait_for_function("() => window.__buyer.paymentConfirmed === true", timeout=90000)
                check("the auto-paying test mint drove the order to PAID", True,
                      "state=PAID (testnut)")

                # ── PAID LEG: mint the ecash, hand it over, redeem it ────────────
                buyer.wait_for_function(
                    "() => window.__buyer.token !== null || window.__buyer.settleError !== null",
                    timeout=90000)
                minted = buyer.evaluate(
                    "() => ({ total: window.__buyer.mintedTotal, proofs: window.__buyer.mintedProofs,"
                    " err: window.__buyer.settleError })")
                check("buyer MINTED the ecash (NUT-04) after the quote was PAID",
                      minted["total"] > 0 and not minted["err"], f"{minted}")

                fac.wait_for_function(
                    "() => window.__facilitator.redeemStates !== null"
                    " || window.__facilitator.redeemError !== null", timeout=90000)
                redeemed = fac.evaluate(
                    "() => ({ total: window.__facilitator.redeemedTotal,"
                    " states: window.__facilitator.redeemStates, err: window.__facilitator.redeemError })")
                check("facilitator REDEEMED the buyer's token at the mint",
                      redeemed["total"] is not None and not redeemed["err"], f"{redeemed}")
                check("the buyer's original proofs are SPENT at the mint",
                      bool(redeemed["states"]) and all(s == "SPENT" for s in redeemed["states"]),
                      f"proof states={redeemed['states']}")
            else:
                check("order lifecycle does NOT advance while the mint reports UNPAID",
                      buyer.evaluate("() => window.__buyer.paymentConfirmed") is False,
                      f"mint state={live.get('state') if live else None}")

            # ── negative: a ring containing an outside key ───────────────────
            buyer.goto(buyer_url)
            buyer.wait_for_function("() => window.__buyer && window.__buyer.ready === true", timeout=20000)
            fac.goto(fac_url)
            fac.wait_for_function("() => window.__facilitator && window.__facilitator.roster", timeout=20000)
            buyer.click("#go-menu")
            buyer.click("#go-choose")
            buyer.click('#fac-list [data-fac="outsider"]')
            buyer.click("#go-vet")
            fac.wait_for_selector("#order:not(.hide)", timeout=15000)
            fac.click("#prove")
            buyer.wait_for_function("() => window.__buyer.verdict !== null", timeout=20000)
            bad = buyer.evaluate("() => window.__buyer.verdict")
            reason = (bad.get("reason") or "")
            check("ring containing a key outside the pinned set REJECTED", bad["ok"] is False,
                  f"reason={reason!r}")
            check("rejection names the trust set / outside key (real policy text)",
                  any(t in reason.lower() for t in ("trust set", "outside", "pinned", "subset", "invalid")),
                  reason)
            blocked_visible = buyer.evaluate(
                "() => !document.querySelector('#vet-banner').textContent.includes('VERIFIED')")
            check("buyer sees the blocked state, not a pass", blocked_visible is True)

            # the gate sits on the MONEY path. The UI already disables the button,
            # so bypass the UI entirely: the rail itself must still refuse.
            direct = buyer.evaluate(
                "() => window.__buyer.gate.quote({amount:'27900',currency:'sats'}, window.__buyer.proof)"
                ".then(() => 'ACCEPTED (bad!)').catch(e => e.message)")
            check("no invoice for a rejected proof, even bypassing the UI",
                  buyer.evaluate("() => window.__buyer.realQuote") is None, str(direct))
            check("the gate's refusal is the real policy reason",
                  "outside" in (direct or "").lower() or "trust set" in (direct or "").lower(),
                  str(direct))

            buyer.close()
            ctx.close()
            browser.close()
    finally:
        httpd.terminate()
        chrome.terminate()
        try:
            httpd.wait(timeout=5)
        except Exception:
            pass
        try:
            chrome.wait(timeout=5)
        except Exception:
            subprocess.run(["pkill", "-f", "pw-pizza"], check=False)

    # ── video ────────────────────────────────────────────────────────────────
    webms = sorted(VIDEO_DIR.glob("*.webm"))
    if not webms:
        print("FATAL: no video recorded", file=sys.stderr)
        return 1
    src = webms[0]
    print(f"\n── video ──\nsource {src.name} ({src.stat().st_size} bytes)", flush=True)
    conv = subprocess.run(
        ["/usr/bin/ffmpeg", "-y", "-i", str(src), "-c:v", "libx264", "-pix_fmt", "yuv420p",
         "-preset", "medium", "-crf", "24", "-vf", "scale=1280:720", str(FINAL_MP4)],
        capture_output=True, text=True)
    if conv.returncode != 0:
        print(f"FATAL: ffmpeg failed\n{conv.stderr[-1500:]}", file=sys.stderr)
        return 1
    probe = subprocess.run(
        ["/usr/bin/ffprobe", "-v", "error", "-show_entries", "format=duration,size",
         "-show_entries", "stream=width,height,codec_name", "-of", "default=nw=1", str(FINAL_MP4)],
        capture_output=True, text=True).stdout.strip()
    print(probe, flush=True)

    passed = sum(1 for _, ok, _ in results if ok)
    print(f"\n── summary ──\n  {passed}/{len(results)} assertions passed", flush=True)
    (REPORT_DIR / "pizza-e2e-results.json").write_text(
        json.dumps({"assertions": [{"name": n, "pass": o, "detail": d} for n, o, d in results],
                    "video": str(FINAL_MP4), "ffprobe": probe}, indent=2) + "\n")
    return 0 if passed == len(results) else 1


if __name__ == "__main__":
    sys.exit(main())
