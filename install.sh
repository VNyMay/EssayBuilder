#!/bin/bash
set -e
REPO="VNyMay/EssayBuilder"
SYSTEM="$(uname -s)"
OPEN=1
for argument in "$@"; do
  [ "$argument" = "--no-open" ] && OPEN=0
done

if [ "$SYSTEM" = "Darwin" ]; then
  DATA="$HOME/Library/Application Support/Essay Builder"
  APP="$HOME/Applications/Essay Builder.app"
elif [ "$SYSTEM" = "Linux" ]; then
  DATA="${XDG_DATA_HOME:-$HOME/.local/share}/essay-builder"
else
  echo "This installer is for Mac and Linux. On Windows, use EssayBuilder-Setup.exe from the Releases page."
  exit 1
fi

say() {
  printf '\n\033[1;32m%s\033[0m\n' "$1"
}

get() {
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$1"
  else
    wget -qO- "$1"
  fi
}

HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "$HERE" ] && [ -f "$HERE/studio/serve.py" ] && [ -f "$HERE/launcher/start.sh" ]; then
  SOURCE="$HERE"
  say "Using Essay Builder in $SOURCE"
else
  say "Downloading Essay Builder"
  TEMP="$(mktemp -d)"
  trap 'rm -rf "$TEMP"' EXIT
  get "https://github.com/$REPO/archive/refs/heads/main.tar.gz" | tar -xz -C "$TEMP"
  SOURCE=""
fi

mkdir -p "$DATA"
if [ "$SYSTEM" = "Darwin" ]; then
  KEEP=""
  if [ -d "$APP/Contents/Resources/app/engine/node_modules" ]; then
    KEEP="$(mktemp -d)"
    mv "$APP/Contents/Resources/app/engine/node_modules" "$KEEP/"
  fi
  rm -rf "$APP"
  mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
  if [ -z "$SOURCE" ]; then
    mv "$TEMP"/*/ "$APP/Contents/Resources/app"
    ROOT="$APP/Contents/Resources/app"
    [ -n "$KEEP" ] && mv "$KEEP/node_modules" "$ROOT/engine/" && rm -rf "$KEEP"
  else
    ROOT="$SOURCE"
  fi
  cp "$ROOT/launcher/icon.icns" "$APP/Contents/Resources/icon.icns"
  VERSION="$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$ROOT/engine/package.json" | head -n 1)"
  cat >"$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Essay Builder</string>
  <key>CFBundleDisplayName</key><string>Essay Builder</string>
  <key>CFBundleIdentifier</key><string>com.vnymay.essaybuilder</string>
  <key>CFBundleExecutable</key><string>Essay Builder</string>
  <key>CFBundleIconFile</key><string>icon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION:-1.0.0}</string>
  <key>CFBundleVersion</key><string>${VERSION:-1.0.0}</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>LSApplicationCategoryType</key><string>public.app-category.productivity</string>
</dict>
</plist>
PLIST
  QUOTED="$(printf '%q' "$ROOT")"
  cat >"$APP/Contents/MacOS/Essay Builder" <<LAUNCH
#!/bin/bash
ROOT="\$(cd "\$(dirname "\$0")/../Resources/app" 2>/dev/null && pwd)"
[ -f "\$ROOT/launcher/start.sh" ] || ROOT=$QUOTED
if [ ! -f "\$ROOT/launcher/start.sh" ]; then
  osascript -e 'display alert "Essay Builder" message "Essay Builder was moved or deleted. Run the installer again."'
  exit 1
fi
exec /bin/bash "\$ROOT/launcher/start.sh" "\$@"
LAUNCH
  chmod +x "$APP/Contents/MacOS/Essay Builder" "$ROOT/launcher/start.sh"
  xattr -dr com.apple.quarantine "$APP" "$ROOT" 2>/dev/null || true
  LSREGISTER="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"
  [ -x "$LSREGISTER" ] && "$LSREGISTER" -f "$APP" >/dev/null 2>&1 || true
  if [ -d "$HOME/Desktop" ]; then
    rm -f "$HOME/Desktop/Essay Builder"
    ln -s "$APP" "$HOME/Desktop/Essay Builder"
  fi
else
  if [ -z "$SOURCE" ]; then
    KEEP=""
    if [ -d "$DATA/app/engine/node_modules" ]; then
      KEEP="$(mktemp -d)"
      mv "$DATA/app/engine/node_modules" "$KEEP/"
    fi
    rm -rf "$DATA/app"
    mv "$TEMP"/*/ "$DATA/app"
    ROOT="$DATA/app"
    [ -n "$KEEP" ] && mv "$KEEP/node_modules" "$ROOT/engine/" && rm -rf "$KEEP"
  else
    ROOT="$SOURCE"
  fi
  chmod +x "$ROOT/launcher/start.sh"
  APPS="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
  mkdir -p "$APPS"
  ENTRY="$APPS/essay-builder.desktop"
  cat >"$ENTRY" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Essay Builder
Comment=Write essays on real pages and export a PDF
Exec="$ROOT/launcher/start.sh" %f
Icon=$ROOT/studio/icon.png
Terminal=false
Categories=Office;WordProcessor;Education;
StartupNotify=true
StartupWMClass=essay-builder
DESKTOP
  chmod +x "$ENTRY"
  command -v update-desktop-database >/dev/null 2>&1 && update-desktop-database "$APPS" >/dev/null 2>&1 || true
  DESK="$(xdg-user-dir DESKTOP 2>/dev/null || echo "$HOME/Desktop")"
  if [ -d "$DESK" ]; then
    cp "$ENTRY" "$DESK/essay-builder.desktop"
    chmod +x "$DESK/essay-builder.desktop"
    command -v gio >/dev/null 2>&1 && gio set "$DESK/essay-builder.desktop" metadata::trusted true >/dev/null 2>&1 || true
  fi
fi

say "Getting Python, Node.js and the libraries (first time only, a few minutes)"
ESSAY_BUILDER_SETUP_ONLY=1 /bin/bash "$ROOT/launcher/start.sh"

say "Essay Builder is installed"
if [ "$SYSTEM" = "Darwin" ]; then
  echo "Open it from Applications, Launchpad or the Desktop icon."
  [ "$OPEN" = 1 ] && open "$APP"
else
  echo "Open it from your apps menu or the Desktop icon."
  [ "$OPEN" = 1 ] && (nohup /bin/bash "$ROOT/launcher/start.sh" >/dev/null 2>&1 &)
fi
exit 0
