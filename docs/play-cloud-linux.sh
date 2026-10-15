#!/bin/sh
# CPU-rendered Chromium, using an isolated and persistent game profile.
set -eu
if [ "$(id -u)" = 0 ]; then
  printf '%s\n' 'Run this launcher as a normal desktop user. Do not disable the browser sandbox.' >&2
  exit 1
fi
if [ -z "${DISPLAY:-}" ]; then
  printf '%s\n' 'Open a terminal in the cloud PC X11 desktop, then run this script.' >&2
  exit 1
fi
if [ -n "${TANOSHI_BROWSER:-}" ]; then
  browser=$TANOSHI_BROWSER
elif command -v chromium >/dev/null 2>&1; then
  browser=$(command -v chromium)
elif command -v chromium-browser >/dev/null 2>&1; then
  browser=$(command -v chromium-browser)
else
  printf '%s\n' 'Chromium was not found. Install Debian chromium and chromium-common first.' >&2
  exit 1
fi
profile=${XDG_DATA_HOME:-"$HOME/.local/share"}/tanoshi-boken/chromium-cpu
mkdir -p "$profile"
printf '%s\n' 'Starting the game with the CPU renderer. Saves are stored in this dedicated browser profile.'
exec "$browser" \
  --user-data-dir="$profile" \
  --ozone-platform=x11 \
  --use-gl=angle \
  --use-angle=swiftshader \
  --new-window \
  'https://anonymous51398747310968.github.io/tanoshi-boken-browser/'
