#!/usr/bin/env python3
"""
record_demo.py — record the two-actor pizza flow as ONE watchable video.

Why a separate surface: Playwright records one video PER PAGE, so driving
order.html and facilitator.html as two tabs produces two videos and the
facilitator's half is never in frame. flow-demo.html therefore loads the SAME
two pages as same-origin iframes side by side — real pages, real
BroadcastChannel between them, one recording. Nothing is mocked or replayed.

Paces the beats so a human can follow (~75s) and captions each step.

    ~/.hermes/hermes-agent/venv/bin/python apps/worker/e2e/record_demo.py
"""
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
VIDEO_DIR = HERE / "videos"
REPORT_DIR = Path("/home/c03rad0r/reports/mcp-cashu-pizza")
FINAL = REPORT_DIR / "trust-ring-pizza-flow.mp4"
IN_REPO = HERE / "trust-ring-pizza-flow.mp4"
CHROME = "/usr/bin/google-chrome-stable"
PORT, CDP_PORT = 8792, 9335
VIEWPORT = {"width": 1280, "height": 720}

BEATS = []


def beat(n, text, hold=2500):
    BEATS.append((n, text, hold))


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
    shutil.rmtree(VIDEO_DIR, ignore_errors=True)
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    REPORT_DIR.mkdir(parents=True, exist_ok=True)

    httpd = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT),
                              "--bind", "127.0.0.1", "--directory", str(PUBLIC)],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chrome = subprocess.Popen(
        [CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
         "--disable-dev-shm-usage", f"--remote-debugging-port={CDP_PORT}",
         "--user-data-dir=/tmp/pw-pizza-demo", "--no-first-run", "--noerrdialogs",
         "--hide-scrollbars", f"--window-size={VIEWPORT['width']},{VIEWPORT['height']}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        if not (wait_port(PORT) and wait_port(CDP_PORT)):
            print("FATAL: server/chrome did not come up", file=sys.stderr)
            return 1
        print("✓ servers up", flush=True)

        with sync_playwright() as p:
            browser = p.chromium.connect_over_cdp(f"http://127.0.0.1:{CDP_PORT}")
            ctx = browser.new_context(viewport=VIEWPORT, record_video_dir=str(VIDEO_DIR),
                                      record_video_size=VIEWPORT)
            page = ctx.new_page()
            page.goto(f"http://127.0.0.1:{PORT}/flow-demo.html")
            page.wait_for_function("() => window.__demo && window.__demo.ready", timeout=20000)

            text = "Loading the buyer and the facilitator…"
            page.evaluate("t => window.setCaption('0', t)", text)
            page.wait_for_timeout(2500)

            def frames():
                b = next(f for f in page.frames if f.url.endswith("order.html"))
                fa = next(f for f in page.frames if f.url.endswith("facilitator.html"))
                return b, fa

            buyer, fac = frames()
            buyer.wait_for_function("() => window.__buyer && window.__buyer.ready === true", timeout=20000)
            fac.wait_for_function("() => window.__facilitator && window.__facilitator.roster", timeout=20000)

            cap = lambda n, t: (page.evaluate("([n,t]) => window.setCaption(n,t)", [n, t]))

            # 1 — the pinned trust set
            cap(1, "The buyer holds a pinned trust set: 8 vetted facilitators, version hash f3809a4c…")
            page.wait_for_timeout(4000)

            # 2 — basket
            buyer.click("#go-menu"); page.wait_for_timeout(1800)
            cap(2, "Order: 2 pizzas from Pizzeria Napoli — 27,900 sats")
            page.wait_for_timeout(2800)
            buyer.click("#go-choose"); page.wait_for_timeout(2000)

            # 3 — choose the facilitator
            cap(3, "Who fulfils it? Only a facilitator who can prove they are in the buyer's set")
            page.wait_for_timeout(3500)
            buyer.click('#fac-list [data-fac="0"]')
            page.wait_for_timeout(1500)
            buyer.click('#fac-list [data-fac="outsider"]')
            cap(3, "…and one candidate deliberately outside the set: Anon Delivery")
            page.wait_for_timeout(3000)
            buyer.click('#fac-list [data-fac="0"]')
            page.wait_for_timeout(1200)

            # 4 — the vetting screen (the core beat)
            buyer.click("#go-vet")
            fac.wait_for_selector("#order:not(.hide)", timeout=15000)
            cap(4, "The order reaches the facilitator — it must prove membership in the buyer's pinned set")
            page.wait_for_timeout(3500)
            fac.click("#prove")
            buyer.wait_for_function("() => window.__buyer.verdict !== null", timeout=20000)
            cap(4, "Proof returned: a ring of 4 drawn from the buyer's 8 — the signer stays hidden")
            page.wait_for_timeout(5000)

            v = buyer.evaluate("() => window.__buyer.verdict")
            anon = buyer.evaluate("() => window.__buyer.anonymitySetSize")
            cap(4, f"VERIFIED — a member of the trust set signed. Anonymity set = {anon}. "
                   f"(real verdict: ok={v['ok']})")
            page.wait_for_timeout(5000)

            # 5 — live attacks
            buyer.click("#atk-replay")
            rp = buyer.evaluate("() => window.__buyer.attacks.replay")
            cap(5, f"Attack 1 — replay this proof for another order: rejected ({rp['reason']})")
            page.wait_for_timeout(4500)
            buyer.click("#atk-reuse")
            ru = buyer.evaluate("() => window.__buyer.attacks.reuse")
            cap(5, f"Attack 2 — reuse the key image: second attempt rejected ({ru['reason']})")
            page.wait_for_timeout(4500)

            # 6 — payment (simulated, labeled)
            buyer.click("#go-pay")
            cap(6, "Payment — SIMULATED in this demo, no Lightning node. The verification was the real part")
            page.wait_for_timeout(4000)
            buyer.click("#pay-confirm")
            page.wait_for_timeout(2000)

            # 7 — lifecycle
            for st, txt in (("accepted", "Facilitator accepted"), ("preparing", "Making your pizza"),
                            ("delivery", "Out for delivery"), ("delivered", "Delivered — sats released")):
                fac.click(f'[data-status="{st}"]')
                cap(7, f"Order lifecycle — {txt}")
                page.wait_for_timeout(2600)

            # 8 — the blocked case
            buyer.goto(f"http://127.0.0.1:{PORT}/order.html")
            buyer.wait_for_function("() => window.__buyer && window.__buyer.ready === true", timeout=20000)
            buyer, fac = frames()
            buyer.wait_for_function("() => window.__buyer && window.__buyer.ready === true", timeout=20000)
            buyer.click("#go-menu"); buyer.click("#go-choose")
            buyer.click('#fac-list [data-fac="outsider"]')
            buyer.click("#go-vet")
            fac.wait_for_selector("#order:not(.hide)", timeout=15000)
            fac.click("#prove")
            buyer.wait_for_function("() => window.__buyer.verdict !== null", timeout=20000)
            bad = buyer.evaluate("() => window.__buyer.verdict")
            cap(8, f"Impostor: a key outside the pinned set is rejected — {bad['reason']}")
            page.wait_for_timeout(6000)

            page.close()
            ctx.close()
            browser.close()
    finally:
        httpd.terminate()
        chrome.terminate()
        for proc in (httpd, chrome):
            try:
                proc.wait(timeout=5)
            except Exception:
                pass

    webms = sorted(VIDEO_DIR.glob("*.webm"))
    if not webms:
        print("FATAL: no video recorded", file=sys.stderr)
        return 1
    print(f"source {webms[0].name} ({webms[0].stat().st_size} bytes)", flush=True)
    conv = subprocess.run(["/usr/bin/ffmpeg", "-y", "-i", str(webms[0]), "-c:v", "libx264",
                           "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "24",
                           "-vf", "scale=1280:720", str(FINAL)], capture_output=True, text=True)
    if conv.returncode != 0:
        print(f"FATAL: ffmpeg\n{conv.stderr[-1200:]}", file=sys.stderr)
        return 1
    shutil.copy2(FINAL, IN_REPO)
    probe = subprocess.run(["/usr/bin/ffprobe", "-v", "error", "-show_entries",
                            "format=duration,size", "-show_entries", "stream=width,height,codec_name",
                            "-of", "default=nw=1", str(FINAL)], capture_output=True, text=True).stdout.strip()
    print(probe, flush=True)
    print(f"written: {FINAL}\n         {IN_REPO}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
