#!/bin/bash
set -e

pkill -9 -f chromium || true
pkill -9 -f chrome || true

rm -rf /root/.conduit/profiles/*/SingletonLock 2>/dev/null || true
rm -rf /tmp/.X99-lock 2>/dev/null || true

Xvfb :99 -screen 0 1280x900x24 -ac >/tmp/xvfb.log 2>&1 &
while [ ! -S /tmp/.X11-unix/X99 ]; do sleep 0.2; done
export DISPLAY=:99

x11vnc -display :99 -forever -shared -nopw -listen 0.0.0.0 -rfbport 5900 >/tmp/x11vnc.log 2>&1 &
websockify --web=/usr/share/novnc/ 6080 localhost:5900 >/tmp/websockify.log 2>&1 &

echo "VNC server started on port 5900"
echo "noVNC web interface on http://localhost:6080/vnc.html"

cd /app
node dist/cli.js start &

wait