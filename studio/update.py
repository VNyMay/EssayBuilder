import hashlib
import json
import re
import subprocess
import sys
import threading
import time
import urllib.request
from pathlib import Path

STUDIO = Path(__file__).resolve().parent
RELEASES = "https://api.github.com/repos/VNyMay/EssayBuilder/releases/latest"
PAGE = "https://github.com/VNyMay/EssayBuilder/releases/latest"
HOURS = 6
ASSET = "EssayBuilder-Setup.exe"


def current():
    file = STUDIO / "version.txt"
    return file.read_text(encoding="utf-8").strip() if file.is_file() else "0"


def parts(text):
    return tuple(int(piece) for piece in re.findall(r"\d+", text)[:3]) or (0,)


def whats_new():
    file = STUDIO / "whatsnew.json"
    if not file.is_file():
        return {}
    try:
        return json.loads(file.read_text(encoding="utf-8"))
    except ValueError:
        return {}


def latest(cache):
    saved = {}
    if cache.is_file():
        try:
            saved = json.loads(cache.read_text(encoding="utf-8"))
        except ValueError:
            saved = {}
    if saved.get("checked", 0) > time.time() - HOURS * 3600:
        return saved
    found = {"checked": time.time(), "tag": saved.get("tag", ""), "url": saved.get("url", PAGE), "installer": saved.get("installer")}
    request = urllib.request.Request(
        RELEASES,
        headers={"User-Agent": f"EssayBuilder/{current()}", "Accept": "application/vnd.github+json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as reply:
            data = json.loads(reply.read().decode("utf-8"))
        found["tag"] = str(data.get("tag_name") or "")
        found["url"] = str(data.get("html_url") or PAGE)
        found["installer"] = None
        for asset in data.get("assets") or []:
            if asset.get("name") == ASSET and asset.get("browser_download_url"):
                digest = str(asset.get("digest") or "")
                found["installer"] = {
                    "url": str(asset["browser_download_url"]),
                    "size": int(asset.get("size") or 0),
                    "sha256": digest.split(":", 1)[1].lower() if digest.startswith("sha256:") else "",
                }
    except Exception:
        found["checked"] = time.time() - (HOURS - 0.25) * 3600
    try:
        cache.write_text(json.dumps(found), encoding="utf-8")
    except OSError:
        pass
    return found


def status(cache):
    here = current()
    info = latest(cache)
    tag = info.get("tag", "")
    newer = bool(tag) and parts(tag) > parts(here)
    return {
        "current": here,
        "latest": tag.lstrip("v"),
        "url": info.get("url", PAGE),
        "newer": newer,
        "news": whats_new(),
        "installer": info.get("installer") if newer else None,
    }


class Updater:
    def __init__(self, folder, installed):
        self.folder = Path(folder)
        self.installed = installed
        self.state = {"stage": "idle", "done": 0, "total": 0}
        self.file = None
        self.lock = threading.Lock()

    def can_install(self):
        return self.installed and sys.platform == "win32"

    def progress(self):
        return dict(self.state)

    def start(self, installer, tag):
        if not installer or not installer.get("url"):
            return {"stage": "error", "error": "There is no update to download."}
        with self.lock:
            if self.state["stage"] in {"downloading", "ready"}:
                return self.progress()
            self.state = {"stage": "downloading", "done": 0, "total": int(installer.get("size") or 0)}
        threading.Thread(target=self.fetch, args=(installer, tag), daemon=True).start()
        return self.progress()

    def fetch(self, installer, tag):
        try:
            self.folder.mkdir(parents=True, exist_ok=True)
            name = re.sub(r"[^\w.-]+", "", tag or "new") or "new"
            target = self.folder / f"EssayBuilder-Setup-{name}.exe"
            for old in self.folder.glob("EssayBuilder-Setup-*"):
                if old != target:
                    old.unlink(missing_ok=True)
            part = target.with_name(target.name + ".part")
            digest = hashlib.sha256()
            request = urllib.request.Request(installer["url"], headers={"User-Agent": f"EssayBuilder/{current()}"})
            with urllib.request.urlopen(request, timeout=30) as reply, part.open("wb") as out:
                self.state["total"] = int(reply.headers.get("Content-Length") or installer.get("size") or 0)
                while True:
                    chunk = reply.read(262144)
                    if not chunk:
                        break
                    out.write(chunk)
                    digest.update(chunk)
                    self.state["done"] += len(chunk)
            size = int(installer.get("size") or 0)
            if size and part.stat().st_size != size:
                raise ValueError("The download was incomplete. Try again.")
            if installer.get("sha256") and digest.hexdigest() != installer["sha256"]:
                raise ValueError("The download was damaged, so it was not used. Try again.")
            part.replace(target)
            self.file = target
            self.state["stage"] = "ready"
        except ValueError as error:
            self.state = {"stage": "error", "error": str(error), "done": 0, "total": 0}
        except Exception:
            self.state = {"stage": "error", "error": "The update could not be downloaded. Check your internet connection and try again.", "done": 0, "total": 0}

    def install(self):
        if self.state["stage"] != "ready" or not self.file or not self.file.is_file():
            return {"error": "The update is not ready yet."}
        if not self.can_install():
            return {"error": "Updates install by themselves only in the installed Windows app."}
        flags = getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        subprocess.Popen([str(self.file), "/VERYSILENT", "/SUPPRESSMSGBOXES", "/NORESTART", "/RELAUNCH=1"], creationflags=flags, close_fds=True)
        return {"ok": True}
