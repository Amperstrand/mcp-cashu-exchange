#!/usr/bin/env python3
"""
record.py — Playwright browser E2E recording for plugin-trust-ring.

Connects to a running Chrome instance via CDP (Chrome DevTools Protocol),
opens harness.html, clicks "Run Walkthrough", waits for each beat to complete,
asserts every beat's verdict, and records video to MP4.

Prerequisites:
  1. Start Chrome with remote debugging:
     /usr/bin/google-chrome-stable --headless=old --no-sandbox --disable-gpu \
       --disable-dev-shm-usage --remote-debugging-port=9333 \
       --user-data-dir=/tmp/pw-trust-ring &

  2. Run this script:
     ~/.hermes/hermes-agent/venv/bin/python e2e/record.py

Requirements:
  - Playwright python (installed in Hermes venv: ~/.hermes/hermes-agent/venv/bin/python)
  - System Chrome at /usr/bin/google-chrome-stable
  - ffmpeg at /usr/bin/ffmpeg (for video encoding)

Outputs:
  - trust-ring-happy-path.mp4 (H.264, 1280x720) in the e2e/ directory
  - Also copies to /home/c03rad0r/reports/mcp-cashu-trust-ring/
"""
import os
import sys
import shutil
import subprocess
from pathlib import Path
from playwright.sync_api import sync_playwright

# ── Paths ──────────────────────────────────────────────────────────
HERE = Path(__file__).resolve().parent
HARNESS = HERE / "harness.html"
VIDEO_DIR = HERE / "videos"
FINAL_VIDEO = HERE / "trust-ring-happy-path.mp4"
REPORTS_DIR = Path("/home/c03rad0r/reports/mcp-cashu-trust-ring")
FFMPEG = "/usr/bin/ffmpeg"
CDP_URL = "http://127.0.0.1:9333"
VIEWPORT = {"width": 1280, "height": 720}

# ── Expected beats (must match harness.html) ───────────────────────
EXPECTED_BEATS = [
    "Setup — Trust Set Published",
    "Operator Generates Key Pair",
    "Operator Produces Trust Proof (LSAG Ring Signature)",
    "Client Verifies — Honest Proof Accepted",
    "Attack 1 — Non-Member Forges Signature",
    "Attack 2 — Ring Contains Outside Key",
    "Attack 3 — Replay Proof for Different Order",
    "Attack 4 — Reused Key Image (Double-Spend)",
    "Summary — Full Walkthrough Complete",
]


def main():
    if not HARNESS.exists():
        print(f"ERROR: harness.html not found at {HARNESS}", file=sys.stderr)
        sys.exit(1)

    # Check Chrome is running with CDP
    import urllib.request
    try:
        with urllib.request.urlopen(f"{CDP_URL}/json/version", timeout=5) as resp:
            version_info = resp.read().decode()
        print(f"✓ Connected to Chrome via CDP at {CDP_URL}")
    except Exception as e:
        print(f"ERROR: Chrome not running with CDP at {CDP_URL}. Start it first:\n"
              f"  /usr/bin/google-chrome-stable --headless=old --no-sandbox --disable-gpu "
              f"--disable-dev-shm-usage --remote-debugging-port=9333 "
              f"--user-data-dir=/tmp/pw-trust-ring", file=sys.stderr)
        sys.exit(1)

    assertions = []
    all_pass = True

    with sync_playwright() as p:
        # Connect to the running Chrome via CDP
        browser = p.chromium.connect_over_cdp(CDP_URL)

        # Create a new context with video recording
        context = browser.new_context(
            viewport=VIEWPORT,
            record_video_dir=str(VIDEO_DIR),
            record_video_size=VIEWPORT,
        )
        page = context.new_page()
        page.goto(f"file://{HARNESS}")

        # Wait for page to load
        page.wait_for_selector("#runBtn", state="visible", timeout=10000)
        print("✓ Page loaded — harness.html rendered")

        # Click the run button
        page.click("#runBtn")
        print("✓ Clicked 'Run Walkthrough' button")

        # Wait for all beats to complete
        # Each beat takes ~3.1s (600ms appear + 2500ms display)
        # 9 beats × ~3.1s ≈ 28s + summary ≈ 35s
        page.wait_for_function("window.__allDone === true", timeout=120000)
        print("✓ All beats completed")

        # Extract results from the page
        results = page.evaluate("window.__beatResults")
        all_pass_js = page.evaluate("window.__allPass")

        # Give the summary a moment to render
        page.wait_for_timeout(3000)

        # Close context to finalize video (but don't close the browser — it's shared)
        context.close()
        browser.close()  # This just disconnects, doesn't kill Chrome

    # ── Process assertions ─────────────────────────────────────────
    print("\n── Per-Beat Assertion Results ──")
    for i, expected_title in enumerate(EXPECTED_BEATS):
        if i < len(results):
            r = results[i]
            title_match = expected_title in r["title"] or r["title"] in expected_title
            passed = r["pass"] and title_match
            status = "PASS" if passed else "FAIL"
            if not passed:
                all_pass = False
            print(f"  [{status}] Beat {i+1}: {r['title']} — {r['verdict']}")
            assertions.append({
                "beat": i + 1,
                "title": r["title"],
                "verdict": r["verdict"],
                "pass": r["pass"],
                "title_match": title_match,
                "overall": passed,
            })
        else:
            print(f"  [FAIL] Beat {i+1}: {expected_title} — MISSING")
            all_pass = False
            assertions.append({
                "beat": i + 1,
                "title": expected_title,
                "verdict": "MISSING",
                "pass": False,
                "title_match": False,
                "overall": False,
            })

    if all_pass and all_pass_js:
        print("\n✅ ALL BEATS PASSED")
    else:
        print("\n❌ SOME BEATS FAILED")
        all_pass = False

    # ── Convert video to MP4 ───────────────────────────────────────
    VIDEO_DIR.mkdir(exist_ok=True)
    webm_files = list(VIDEO_DIR.glob("*.webm"))
    if not webm_files:
        print("ERROR: No video file was recorded!", file=sys.stderr)
        sys.exit(1)

    webm_path = webm_files[0]
    print(f"\n── Video Conversion ──")
    print(f"  Source: {webm_path} ({webm_path.stat().st_size} bytes)")

    # Convert webm → mp4 with H.264 + yuv420p for Signal compatibility
    cmd = [
        FFMPEG, "-y",
        "-i", str(webm_path),
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "23",
        "-vf", "scale=1280:720",
        str(FINAL_VIDEO),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ERROR: ffmpeg failed:\n{result.stderr}", file=sys.stderr)
        sys.exit(1)

    print(f"  Output: {FINAL_VIDEO} ({FINAL_VIDEO.stat().st_size} bytes)")

    # Copy to reports directory
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)
    reports_video = REPORTS_DIR / "trust-ring-happy-path.mp4"
    shutil.copy2(FINAL_VIDEO, reports_video)
    print(f"  Reports: {reports_video} ({reports_video.stat().st_size} bytes)")

    # ── Print summary ──────────────────────────────────────────────
    print(f"\n── Summary ──")
    print(f"  Beats: {len(assertions)} total, {sum(1 for a in assertions if a['overall'])} passed, {sum(1 for a in assertions if not a['overall'])} failed")
    print(f"  Video: {FINAL_VIDEO}")
    print(f"  Reports copy: {reports_video}")

    if not all_pass:
        sys.exit(1)


if __name__ == "__main__":
    main()