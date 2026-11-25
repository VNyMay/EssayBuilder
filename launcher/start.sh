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

find_chrome() {
  for name in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge microsoft-edge-stable; do
    command -v "$name" >/dev/null 2>&1 && return 0
  done
  for app in "/Applications/Google Chrome.app" "$HOME/Applications/Google Chrome.app" "/Applications/Microsoft Edge.app"; do
    [ -d "$app" ] && return 0
  done
  return 1
}

download_to() {
  if command -v curl >/dev/null 2>&1; then
    echo "curl -fL -o $1 $2"
  else
    echo "wget -O $1 $2"
  fi
}

chrome_command() {
  if [ "$(uname -s)" = "Darwin" ]; then
    command -v brew >/dev/null 2>&1 && echo "brew install --cask google-chrome"
    return
  fi
  if [ "$(uname -m)" != "x86_64" ]; then
    if command -v apt-get >/dev/null 2>&1; then
      echo "sudo apt-get install -y chromium"
    elif command -v dnf >/dev/null 2>&1; then
      echo "sudo dnf install -y chromium"
    elif command -v pacman >/dev/null 2>&1; then
      echo "sudo pacman -S --needed chromium"
    fi
    return
  fi
  if command -v apt-get >/dev/null 2>&1; then
    echo "$(download_to /tmp/google-chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb) && sudo apt-get install -y /tmp/google-chrome.deb"
  elif command -v dnf >/dev/null 2>&1; then
    echo "sudo dnf install -y https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm"
  elif command -v zypper >/dev/null 2>&1; then
    echo "sudo zypper install -y https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm"
  elif command -v pacman >/dev/null 2>&1; then
    echo "sudo pacman -S --needed chromium"
  fi
}

open_page() {
  if [ "$(uname -s)" = "Darwin" ]; then
    open "$1" >/dev/null 2>&1
  elif command -v xdg-open >/dev/null 2>&1; then
    (xdg-open "$1" >/dev/null 2>&1 &)
  fi
}

wait_chrome() {
  find_chrome && return 0
  PAGE="https://www.google.com/chrome/"
  COMMAND="$(chrome_command)"
  if [ -t 1 ] && [ -r /dev/tty ]; then
    printf '\n\033[1;33mEssay Builder needs Google Chrome to show and print your essays.\033[0m\n'
    if [ -n "$COMMAND" ]; then
      printf '\nThis command installs it (it asks for your password):\n\n  \033[1m%s\033[0m\n\n' "$COMMAND"
      printf 'Run it now? [Y/n] '
      read -r answer </dev/tty || answer="n"
      case "$answer" in
        n | N | no | No) printf 'Run it in another terminal, or install Chrome from %s\n' "$PAGE" ;;
        *) bash -c "$COMMAND" </dev/tty || printf 'That did not finish. Install Chrome from %s\n' "$PAGE" ;;
      esac
    else
      printf 'Install it from %s\n' "$PAGE"
      open_page "$PAGE"
    fi
    printf 'Waiting for Chrome'
    until find_chrome; do
      printf '.'
      sleep 3
    done
    printf '\n\033[1;32mChrome is installed. Carrying on.\033[0m\n'
    return 0
  fi
  open_page "$PAGE"
  TEXT="Essay Builder needs Google Chrome. Install it from the page that just opened. Essay Builder starts by itself once Chrome is ready."
  if [ "$(uname -s)" = "Darwin" ]; then
    osascript -e "display notification \"$TEXT\" with title \"Essay Builder\"" >/dev/null 2>&1
  elif command -v zenity >/dev/null 2>&1; then
    (zenity --info --title="Essay Builder" --text="$TEXT" >/dev/null 2>&1 &)
  elif command -v kdialog >/dev/null 2>&1; then
    (kdialog --title "Essay Builder" --msgbox "$TEXT" >/dev/null 2>&1 &)
  elif command -v notify-send >/dev/null 2>&1; then
    notify-send "Essay Builder" "$TEXT"
  fi
  WAITED=0
  until find_chrome; do
    sleep 3
    WAITED=$((WAITED + 3))
    [ "$WAITED" -ge 1800 ] && alert "Google Chrome is still missing. Install it, then open Essay Builder again."
  done
  return 0
}

if [ -z "$ESSAY_BUILDER_SKIP_SETUP" ]; then
  wait_chrome
  rm -rf "$RUNTIME/chrome"
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
