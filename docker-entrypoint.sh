#!/bin/bash
# NOTE: do NOT use `set -e` here. Per-slot Xvfb/x11vnc failures must NOT take
# down the whole container — at minimum the shared display has to keep working.

pkill -9 -f chromium || true
pkill -9 -f chrome || true

rm -rf /root/.cortex/profiles/*/SingletonLock 2>/dev/null || true
rm -rf /tmp/.X*-lock 2>/dev/null || true

# Sanity: noVNC static files must exist for ANY VNC URL to load.
if [ ! -f /usr/share/novnc/vnc.html ]; then
  echo "FATAL: /usr/share/novnc/vnc.html is missing — novnc package not installed correctly" >&2
  exit 1
fi
echo "noVNC static root OK at /usr/share/novnc/"

# Helper: wait up to N seconds for an X display socket to appear; returns 0 on
# success, 1 on timeout. Used so a flaky slot doesn't hang the entrypoint.
wait_for_x() {
  local d="$1"; local timeout="${2:-5}"; local i=0
  while [ ! -S "/tmp/.X11-unix/X$d" ]; do
    if [ "$i" -ge "$((timeout * 10))" ]; then return 1; fi
    sleep 0.1; i=$((i + 1))
  done
  return 0
}

# ── Shared display (:99) ────────────────────────────────────────────────────
# This is the ONLY websockify that serves the noVNC static files (--web).
# Every iframe loads /novnc/vnc.html from here. Per-slot websockifies below
# are WS-only — they just forward WebSocket frames to their x11vnc.
Xvfb :99 -screen 0 1280x900x24 -ac >/tmp/xvfb-99.log 2>&1 &
wait_for_x 99 8 || { echo "FATAL: Xvfb :99 failed to start; see /tmp/xvfb-99.log" >&2; exit 1; }
export DISPLAY=:99
fluxbox >/tmp/fluxbox-99.log 2>&1 &
sleep 0.3
x11vnc -display :99 -forever -shared -nopw -listen 0.0.0.0 -rfbport 5900 >/tmp/x11vnc-99.log 2>&1 &
websockify --web=/usr/share/novnc/ 6080 localhost:5900 >/tmp/websockify-99.log 2>&1 &
echo "Shared display :99 → vnc 5900 → ws 6080 (serves noVNC static files)"

# ── Per-profile display slots (:100..:109) ──────────────────────────────────
# Each cortex account is bound to ONE slot. WS-only websockify (NO --web)
# forwards to that slot's x11vnc.
#
#   slot N → Display :(100+N)   VNC port (5910+N)   websockify (6090+N)
SLOTS=10
for N in $(seq 0 $((SLOTS - 1))); do
  D=$((100 + N))
  VP=$((5910 + N))
  WP=$((6090 + N))
  Xvfb ":$D" -screen 0 1280x900x24 -ac >"/tmp/xvfb-$D.log" 2>&1 &
  if wait_for_x "$D" 5; then
    DISPLAY=":$D" fluxbox >"/tmp/fluxbox-$D.log" 2>&1 &
    x11vnc -display ":$D" -forever -shared -nopw -listen 0.0.0.0 -rfbport "$VP" >"/tmp/x11vnc-$D.log" 2>&1 &
    websockify "$WP" "localhost:$VP" >"/tmp/websockify-$D.log" 2>&1 &
    echo "  slot $N → display :$D → vnc $VP → ws $WP (WS-only)"
  else
    echo "  slot $N → display :$D FAILED to start (see /tmp/xvfb-$D.log); skipping" >&2
  fi
done

sleep 0.5
echo "All services launched; starting cortex…"

cd /app
exec node dist/cli.js start