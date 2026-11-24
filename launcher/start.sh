#!/bin/bash
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "$(uname -s)" = "Darwin" ]; then
  DATA="$HOME/Library/Application Support/Essay Builder"
else
  DATA="${XDG_DATA_HOME:-$HOME/.local/share}/essay-builder"
fi
RUNTIME="$DATA/runtime"
VENV="$RUNTIME/venv"
PY="$VENV/bin/python"
mkdir -p "$RUNTIME"

export ESSAY_BUILDER_DATA="$DATA"
export ESSAY_BUILDER_RUNTIME="$RUNTIME"
export ESSAY_BUILDER_ESSAYS="${ESSAY_BUILDER_ESSAYS:-$HOME/Documents/Essay Builder}"
export PATH="$RUNTIME/node/bin:$PATH"
export UV_PYTHON_INSTALL_DIR="$RUNTIME/python"
export UV_CACHE_DIR="$RUNTIME/cache"

if [ ! -t 1 ]; then
  exec >>"$DATA/launcher.log" 2>&1
fi

alert() {
  echo "$1" >&2
  if [ "$(uname -s)" = "Darwin" ]; then
    osascript -e "display alert \"Essay Builder\" message \"$1\"" >/dev/null 2>&1
  elif command -v zenity >/dev/null 2>&1; then
    zenity --error --title="Essay Builder" --text="$1" >/dev/null 2>&1
  elif command -v kdialog >/dev/null 2>&1; then
    kdialog --title "Essay Builder" --error "$1" >/dev/null 2>&1
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "Essay Builder" "$1"
  fi
  exit 1
}

notice() {
  echo "$1"
  [ -t 1 ] && return
  if [ "$(uname -s)" = "Darwin" ]; then
    osascript -e "display notification \"$1\" with title \"Essay Builder\"" >/dev/null 2>&1
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "Essay Builder" "$1"
  fi
}

get() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1"
  else
    wget -qO- "$1"
  fi
}

find_uv() {
  for candidate in "$(command -v uv 2>/dev/null)" "$RUNTIME/uv/uv" "$RUNTIME/uv/bin/uv"; do
    if [ -n "$candidate" ] && [ -x "$candidate" ]; then
      echo "$candidate"
      return
    fi
  done
}

if ! "$PY" -c "import tkinter, fitz, PIL, nodejs_wheel" >/dev/null 2>&1; then
  notice "Getting Essay Builder ready. The first start takes a few minutes."
  UV="$(find_uv)"
  if [ -z "$UV" ]; then
    echo "Downloading uv (Python manager)"
    get https://astral.sh/uv/install.sh | env UV_INSTALL_DIR="$RUNTIME/uv" UV_NO_MODIFY_PATH=1 INSTALLER_NO_MODIFY_PATH=1 sh \
      || alert "Could not download Python. Check the internet connection and try again."
    UV="$(find_uv)"
    [ -n "$UV" ] || alert "Could not download Python. Check the internet connection and try again."
  fi
  if [ ! -x "$PY" ]; then
    echo "Downloading Python"
    "$UV" venv --seed --python 3.12 --python-preference only-managed "$VENV" \
      || alert "Could not set up Python. Check the internet connection and try again."
  fi
  echo "Installing Python packages"
  "$UV" pip install --python "$PY" -r "$ROOT/engine/requirements.txt" nodejs-wheel-binaries \
    || alert "Could not install the Python packages. Check the internet connection and try again."
fi

if [ -n "$ESSAY_BUILDER_SETUP_ONLY" ]; then
  cd "$ROOT/engine" && exec "$PY" -c "from lib import setup; setup.ensure()"
fi

ARGS=()
for argument in "$@"; do
  case "$argument" in
    -psn_*) ;;
    *) ARGS+=("$argument") ;;
  esac
done

cd "$ROOT"
exec "$PY" "$ROOT/Essay Builder.pyw" "${ARGS[@]}"
