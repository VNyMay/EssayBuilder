import json
import os
import platform
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import urllib.request
import zipfile
from pathlib import Path

NODE_INDEX = "https://nodejs.org/dist/index.json"
CHROME_INDEX = "https://googlechromelabs.github.io/chrome-for-testing/last-known-good-versions-with-downloads.json"
NOTE = {"text": ""}


def home():
    custom = os.environ.get("ESSAY_BUILDER_RUNTIME")
    if custom:
        return Path(custom)
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Essay Builder" / "runtime"
    if sys.platform == "win32":
        return Path(os.environ.get("LOCALAPPDATA") or Path.home()) / "Essay Builder" / "runtime"
    return Path(os.environ.get("XDG_DATA_HOME") or Path.home() / ".local" / "share") / "essay-builder" / "runtime"


def arch():
    machine = platform.machine().lower()
    return "arm64" if machine in {"arm64", "aarch64"} else "x64"


def note(text):
    NOTE["text"] = text
    print(f"[setup] {text}", flush=True)


def fetch(url, target, label):
    request = urllib.request.Request(url, headers={"User-Agent": "EssayBuilder"})
    with urllib.request.urlopen(request, timeout=60) as response, open(target, "wb") as out:
        total = int(response.headers.get("Content-Length") or 0)
        done, shown = 0, -1
        while chunk := response.read(1 << 18):
            out.write(chunk)
            done += len(chunk)
            if total:
                percent = done * 100 // total
                if percent != shown and percent % 5 == 0:
                    shown = percent
                    note(f"Downloading {label} {percent}%")


def read_json(url):
    request = urllib.request.Request(url, headers={"User-Agent": "EssayBuilder"})
    with urllib.request.urlopen(request, timeout=60) as response:
        return json.load(response)


def unzip(archive, target):
    with zipfile.ZipFile(archive) as bundle:
        for info in bundle.infolist():
            path = target / info.filename
            mode = info.external_attr >> 16
            if info.is_dir():
                path.mkdir(parents=True, exist_ok=True)
                continue
            path.parent.mkdir(parents=True, exist_ok=True)
            if stat.S_ISLNK(mode):
                if path.is_symlink() or path.exists():
                    path.unlink()
                os.symlink(bundle.read(info).decode("utf-8"), path)
                continue
            with bundle.open(info) as source, open(path, "wb") as out:
                shutil.copyfileobj(source, out)
            if mode & 0o777:
                path.chmod(mode & 0o777)


def install(name, url, label, unpack):
    root = home()
    root.mkdir(parents=True, exist_ok=True)
    final = root / name
    with tempfile.TemporaryDirectory(dir=root) as scratch:
        scratch = Path(scratch)
        archive = scratch / Path(url).name
        fetch(url, archive, label)
        note(f"Unpacking {label}")
        unpacked = scratch / "out"
        unpacked.mkdir()
        unpack(archive, unpacked)
        inner = next(unpacked.iterdir())
        shutil.rmtree(final, ignore_errors=True)
        inner.rename(final)
    return final


def node_dir():
    return home() / "node" / "bin"


def works(command):
    try:
        return subprocess.run([str(command), "--version"], capture_output=True, timeout=30).returncode == 0
    except OSError:
        return False


def from_wheel(folder):
    try:
        import nodejs_wheel
    except ImportError:
        return False
    package = Path(nodejs_wheel.__file__).parent
    shutil.rmtree(folder.parent, ignore_errors=True)
    folder.mkdir(parents=True)
    (folder / "node").symlink_to(package / "bin" / "node")
    for name in ("npm", "npx"):
        script = package / "lib" / "node_modules" / "npm" / "bin" / f"{name}-cli.js"
        (folder / name).write_text(f'#!/bin/sh\nexec "{folder / "node"}" "{script}" "$@"\n', encoding="utf-8")
        (folder / name).chmod(0o755)
    return works(folder / "node")


def from_nodejs(folder):
    system = {"darwin": "darwin", "linux": "linux"}.get(sys.platform)
    if not system:
        return False
    release = next(item for item in read_json(NODE_INDEX) if item.get("lts"))
    version = release["version"]
    url = f"https://nodejs.org/dist/{version}/node-{version}-{system}-{arch()}.tar.gz"

    def untar(archive, target):
        with tarfile.open(archive) as bundle:
            if hasattr(tarfile, "data_filter"):
                bundle.extractall(target, filter="tar")
            else:
                bundle.extractall(target)

    install("node", url, "Node.js", untar)
    return works(folder / "node")


def node():
    folder = node_dir()
    if not works(folder / "node") and not from_wheel(folder) and not from_nodejs(folder):
        return False
    os.environ["PATH"] = str(folder) + os.pathsep + os.environ.get("PATH", "")
    return True


def chrome_key():
    if sys.platform == "darwin":
        return f"mac-{arch()}"
    if sys.platform == "linux" and arch() == "x64":
        return "linux64"
    return None


def chrome_path():
    key = chrome_key()
    if not key:
        return None
    folder = home() / "chrome"
    if key.startswith("mac"):
        return folder / "Google Chrome for Testing.app" / "Contents" / "MacOS" / "Google Chrome for Testing"
    return folder / "chrome"


def chrome():
    path = chrome_path()
    if path is None:
        return None
    if path.is_file():
        return path
    builds = read_json(CHROME_INDEX)["channels"]["Stable"]["downloads"]["chrome"]
    url = next(item["url"] for item in builds if item["platform"] == chrome_key())
    install("chrome", url, "Chrome", unzip)
    return path if path.is_file() else None
