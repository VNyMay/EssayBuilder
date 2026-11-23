#!/bin/sh
set -e
if [ -z "$1" ] || [ "$1" = "studio" ]; then
  exec python /app/studio/serve.py --host 0.0.0.0 --port 8787 --no-window --keep-running
fi
exec python /app/engine/build.py "$@"
