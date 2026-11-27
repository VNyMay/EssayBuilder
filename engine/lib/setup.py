"""First-run check: makes sure every library the builder needs is present, installing what is missing."""

import importlib
import importlib.util
import os
import shutil
import subprocess
import sys
from pathlib import Path

from . import runtime

HERE = Path(__file__).resolve().parent.parent
MODULES = HERE / "node_modules"

PYTHON = [
    ("pymupdf", "pymupdf", True),
    ("pygments", "pygments", True),
    ("openpyxl", "openpyxl", False),
    ("websockets", "websockets", False),
    ("docx", "python-docx", False),
]
if sys.platform == "win32":
    PYTHON.append(("webview", "pywebview", False))
NODE_FILES = [
    MODULES / "katex" / "dist" / "katex.min.css",
    MODULES / "@fontsource" / "jetbrains-mono" / "files" / "jetbrains-mono-latin-400-normal.woff2",
    MODULES / "mermaid" / "dist" / "mermaid.min.js",
    MODULES / "d3-geo" / "package.json",
    MODULES / "d3-geo-projection" / "package.json",
    MODULES / "topojson-client" / "package.json",
    MODULES / "world-atlas" / "countries-50m.json",
    MODULES / "us-atlas" / "states-10m.json",
    MODULES / "@rdkit" / "rdkit" / "dist" / "RDKit_minimal.wasm",
]


def say(message):
    print(f"[setup] {message}", flush=True)


def run(command, **kwargs):
    return subprocess.run(command, check=True, **kwargs)


def python_packages():
    from .kits import KIT_PIP

    wanted = PYTHON + [item for item in KIT_PIP if item not in PYTHON]
    missing = [(module, package, needed) for module, package, needed in wanted if importlib.util.find_spec(module) is None]
    if not missing:
        return
    say(f"installing Python packages: {', '.join(package for _, package, _ in missing)}")
    runtime.NOTE["text"] = "Installing Python packages"
    for _, package, needed in missing:
        try:
            run([sys.executable, "-m", "pip", "install", "--disable-pip-version-check", "-q", package])
        except subprocess.CalledProcessError:
            if needed:
                sys.exit(f"Could not install '{package}'. Run: {sys.executable} -m pip install {package}")
            say(f"optional package '{package}' could not be installed (only needed for .xlsx tables)")
    importlib.invalidate_caches()


def node_modules():
    node, npm = shutil.which("node"), shutil.which("npm")
    ready = all(path.is_file() for path in NODE_FILES)
    if sys.platform != "win32" and not (node and runtime.works(node)):
        try:
            runtime.node()
        except (OSError, ValueError, StopIteration) as error:
            say(f"could not download Node.js: {error}")
        node, npm = shutil.which("node"), shutil.which("npm")
    if not node or (not npm and not ready):
        if sys.platform == "win32" and shutil.which("winget"):
            say("Node.js is missing - installing it with winget")
            subprocess.run(
                ["winget", "install", "-e", "--id", "OpenJS.NodeJS.LTS", "--silent",
                 "--accept-package-agreements", "--accept-source-agreements"]
            )
            sys.exit("Node.js was installed. Close this window, open a new one and run the same command again.")
        sys.exit("Node.js 18+ is required. Install it from https://nodejs.org and run the same command again.")

    if ready:
        return
    say("installing the JavaScript libraries (KaTeX, Mermaid, maps, JetBrains Mono) - first run only")
    runtime.NOTE["text"] = "Installing libraries"
    try:
        run([npm, "install", "--no-audit", "--no-fund", "--loglevel=error"], cwd=HERE)
    except subprocess.CalledProcessError:
        sys.exit(f'npm install failed. Check your internet connection, then run: npm install --prefix "{HERE}"')


def browser():
    names = ["chrome", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "msedge", "microsoft-edge", "microsoft-edge-stable"]
    found = [shutil.which(name) for name in names]
    for root in ["ProgramFiles", "ProgramFiles(x86)", "LocalAppData"]:
        base = Path(os.environ.get(root, "/nonexistent"))
        found.append(base / "Google" / "Chrome" / "Application" / "chrome.exe")
        found.append(base / "Microsoft" / "Edge" / "Application" / "msedge.exe")
    found.append("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
    found.append("/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge")
    found.append(Path.home() / "Applications" / "Google Chrome.app" / "Contents" / "MacOS" / "Google Chrome")

    for path in found:
        if path and Path(path).is_file():
            return str(path)

    raise RuntimeError("Google Chrome or Microsoft Edge is required (Docker image: chromium is built in)")


def browser_flags():
    flags = ["--headless", "--disable-gpu"]
    if os.environ.get("ESSAY_BUILDER_NO_SANDBOX") or (hasattr(os, "geteuid") and os.geteuid() == 0):
        flags += ["--no-sandbox", "--disable-dev-shm-usage"]
    return flags


def ensure():
    if os.environ.get("ESSAY_BUILDER_SKIP_SETUP"):
        return
    python_packages()
    node_modules()
    try:
        browser()
    except RuntimeError as error:
        sys.exit(f"{error}. Install Google Chrome, then open Essay Builder again.")
