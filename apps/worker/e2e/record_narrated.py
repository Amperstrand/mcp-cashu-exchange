#!/usr/bin/env python3
"""
record_narrated.py — record the HAPPY PATH as one narrated video, both actors in frame.

A variation on record_demo.py, for one purpose: a judge-facing clip where the
narration fits the action. It differs in three ways:

  1. Happy path only (the attacks/rejections are proven in test_pizza_flow.py, not
     narrated here; beat 6 shows the one refusal that matters in the flow).
  2. Holds come from the narration: each beat's text is synthesised first
     (~/reports/judge-deck/narration/*.wav), and the beat is held for
     audio_length + pad. The video therefore fits the words, not the reverse.
  3. It writes timeline.json — the wall-clock offset of every beat caption — which
     build_narrated_video.py uses to place each audio clip on the video.

Both pages are real, side by side in flow-demo.html, sharing the same
BroadcastChannel. Nothing is mocked.

    python apps/worker/e2e/record_narrated.py [--mint URL]

Writes:  ~/reports/judge-deck/raw-happy-path.mp4
         ~/reports/judge-deck/timeline.json
"""
from __future__ import annotations

import json
import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
VIDEO_DIR = HERE / "videos-narrated"
OUT_DIR = Path.home() / "reports" / "judge-deck"
NARRATION = OUT_DIR / "narration"
NARRATION_JSON = HERE / "narration.json"
RAW = OUT_DIR / "raw-happy-path.mp4"
TIMELINE = OUT_DIR / "timeline.json"
CHROME = "/usr/bin/google-chrome-stable"
PORT, CDP_PORT = 8794, 9337
VIEWPORT = {"width": 1280, "height": 720}
DEFAULT_MINT = "https://testnut.cashu.space"   # auto-pays; labelled in the narration


def wait_port(port: int, timeout: float = 25) -> bool:
    end = time.time() + timeout
    while time.time() < end:
        with socket.socket() as s:
            s.settimeout(0.4)
            if s.connect_ex(("127.0.0.1", port)) == 0:
                return True
        time.sleep(0.2)
    return False


def audio_durations() -> dict[int, float]:
    """Measured length of each beat's narration, in seconds."""
    spec = json.loads(NARRATION_JSON.read_text())
    pad = float(spec.get("pad_seconds", 0.7))
    out: dict[int, float] = {}
    for beat in spec["beats"]:
        wav = NARRATION / f"b{beat['id']}.wav"
        if not wav.exists():
            print(f"FATAL: missing narration {wav} — synthesise it first", file=sys.stderr)
            raise SystemExit(1)
        dur = float(subprocess.run(
            ["/usr/bin/ffprobe", "-v", "error", "-show_entries", "format=duration",
             "-of", "default=nw=1:nk=1", str(wav)],
            capture_output=True, text=True).stdout.strip())
        out[beat["id"]] = dur + pad
    return out


def main() -> int:
    mint = DEFAULT_MINT
    if "--mint" in sys.argv:
        mint = sys.argv[sys.argv.index("--mint") + 1]
    spec = json.loads(NARRATION_JSON.read_text())
    captions = {b["id"]: b["caption"] for b in spec["beats"]}
    holds = audio_durations()
    total = sum(holds.values())
    print(f"narration: {len(holds)} beats, {total:.1f}s of holds, mint={mint}", flush=True)

    shutil.rmtree(VIDEO_DIR, ignore_errors=True)
    VIDEO_DIR.mkdir(parents=True, exist_ok=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    httpd = subprocess.Popen([sys.executable, "-m", "http.server", str(PORT),
                              "--bind", "127.0.0.1", "--directory", str(PUBLIC)],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    chrome = subprocess.Popen(
        [CHROME, "--headless=old", "--no-sandbox", "--disable-gpu",
         "--disable-dev-shm-usage", "--autoplay-policy=no-user-gesture-required",
         f"--remote-debugging-port={CDP_PORT}", "--user-data-dir=/tmp/pw-pizza-narrated",
         "--no-first-run", "--noerrdialogs", "--hide-scrollbars",
         f"--window-size={VIEWPORT['width']},{VIEWPORT['height']}"],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    timeline: list[dict] = []
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
            t0 = time.time()          # video starts ~here; offsets are relative to this
            page.goto(f"http://127.0.0.1:{PORT}/flow-demo.html?mint={mint}")
            page.wait_for_function("() => window.__demo && window.__demo.ready", timeout=25000)

            def frames():
                b = next(f for f in page.frames if f.url.endswith("order.html")
                         or "order.html?" in f.url)
                fa = next(f for f in page.frames if f.url.endswith("facilitator.html")
                          or "facilitator.html?" in f.url)
                return b, fa

            buyer, fac = frames()
            buyer.wait_for_function("() => window.__buyer && window.__buyer.ready === true",
                                    timeout=25000)
            fac.wait_for_function("() => window.__facilitator && window.__facilitator.roster",
                                  timeout=25000)

            def cap(n: int, override: str | None = None) -> None:
                text = override or captions[n]
                page.evaluate("([n,t]) => window.setCaption(n,t)", [n, text])
                timeline.append({"beat": n, "offset_s": round(time.time() - t0, 3),
                                 "caption": text})
                print(f"  beat {n} @ {time.time()-t0:6.1f}s :: {text}", flush=True)

            def hold(n: int) -> None:
                page.wait_for_timeout(int(holds[n] * 1000))

            # 1 — establishing shot
            cap(1, captions[1] + "   (test mint — it pays its own invoices)")
            hold(1)

            # 2 — the pinned trust set
            cap(2)
            hold(2)

            # 3 — basket
            buyer.click("#go-menu")
            cap(3)
            hold(3)

            # 4 — choose the facilitator
            buyer.click("#go-choose")
            page.wait_for_timeout(1200)
            cap(4)
            hold(4)

            # 5 — the proof and the verdict
            buyer.click('#fac-list [data-fac="0"]')
            page.wait_for_timeout(700)
            buyer.click("#go-vet")
            fac.wait_for_selector("#order:not(.hide)", timeout=20000)
            fac.click("#prove")
            buyer.wait_for_function("() => window.__buyer.verdict !== null", timeout=25000)
            cap(5)
            hold(5)

            # 6 — the refusal that matters here: a captured proof is not portable
            # (the outside-key/non-member case is covered by the e2e suite and shown
            # on the deck's slide 11, not driven in this clip)
            buyer.click("#atk-replay")
            buyer.wait_for_function("() => window.__buyer.attacks && "
                                    "window.__buyer.attacks.replay", timeout=20000)
            try:
                reason = buyer.evaluate("() => window.__buyer.attacks.replay.reason || ''")
            except Exception:
                reason = ""
            cap(6, captions[6] + (f"   [{reason}]" if reason else ""))
            hold(6)

            # 7 — a real invoice, through the gate
            buyer.click("#go-pay")
            buyer.wait_for_function(
                "() => window.__buyer.realQuote !== null || window.__buyer.gateReason !== null",
                timeout=30000)
            cap(7)
            hold(7)

            # 8 — PAID -> mint -> hand-off -> redeem -> SPENT -> released.
            # Nothing is clicked here: the page polls the mint, mints on PAID, the
            # token crosses the BroadcastChannel and the facilitator redeems. The
            # e2e asserts the same three states (no manual "check mint now" needed).
            try:
                buyer.wait_for_function("() => window.__buyer.mintState === 'PAID'", timeout=90000)
            except Exception:
                print("!! mint never reported PAID within 90s", flush=True)
            try:
                fac.wait_for_function(
                    "() => window.__facilitator.redeemStates !== null"
                    " || window.__facilitator.redeemError !== null", timeout=120000)
                print("   redeem:", fac.evaluate(
                    "() => ({total: window.__facilitator.redeemedTotal,"
                    " states: window.__facilitator.redeemStates,"
                    " err: window.__facilitator.redeemError})"), flush=True)
            except Exception:
                print("!! facilitator never reported a redeem within 120s", flush=True)
            cap(8)
            hold(8)

            # 9 — honest note + close
            cap(9)
            hold(9)

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
    conv = subprocess.run(["/usr/bin/ffmpeg", "-y", "-i", str(webms[0]), "-c:v", "libx264",
                           "-pix_fmt", "yuv420p", "-preset", "medium", "-crf", "23",
                           "-vf", "scale=1280:720", str(RAW)], capture_output=True, text=True)
    if conv.returncode != 0:
        print(f"FATAL: ffmpeg\n{conv.stderr[-1200:]}", file=sys.stderr)
        return 1
    TIMELINE.write_text(json.dumps({"mint": mint, "video": str(RAW), "beats": timeline,
                                    "holds_s": holds}, indent=2) + "\n")
    probe = subprocess.run(["/usr/bin/ffprobe", "-v", "error", "-show_entries",
                            "format=duration,size", "-of", "default=nw=1", str(RAW)],
                           capture_output=True, text=True).stdout.strip()
    print(f"raw video: {probe}\ntimeline: {TIMELINE}", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
