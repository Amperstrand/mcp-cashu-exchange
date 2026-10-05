#!/usr/bin/env bash
# record-run.sh — clean re-record + convert, run under the Hermes venv.
# Chrome must already be listening on CDP :9333 (headless, swiftshader).
set -u
cd "$(dirname "$0")" || exit 1
PY=~/.hermes/hermes-agent/venv/bin/python

echo "=== 0. prerequisites ==="
curl -s --max-time 5 http://127.0.0.1:9333/json/version | head -c 60 || { echo "NO CDP"; exit 1; }
echo

echo "=== 1. clear stale videos ==="
rm -rf videos && mkdir -p videos

echo "=== 2. record (this takes ~3-5 min under load) ==="
timeout 900 "$PY" record.py
RC=$?
echo "record.py rc=$RC"
if [ "$RC" -ne 0 ]; then echo "RECORD FAILED"; exit "$RC"; fi

echo "=== 3. ffprobe the mp4 ==="
ffprobe -v error -show_entries format=duration,size -show_entries stream=width,height,codec_name -of default=nw=1 trust-ring-happy-path.mp4

echo "=== 4. reports copy ==="
ls -la /home/c03rad0r/reports/mcp-cashu-trust-ring/ 2>/dev/null
echo "DONE"
