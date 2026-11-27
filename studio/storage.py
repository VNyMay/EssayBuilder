import json
import os
import shutil
import string
import sys
from pathlib import Path

FOLDER = "Essay Builder"


def documents():
    if sys.platform == "win32":
        try:
            import ctypes

            buffer = ctypes.create_unicode_buffer(1024)
            if ctypes.windll.shell32.SHGetFolderPathW(None, 5, None, 0, buffer) == 0 and buffer.value:
                return Path(buffer.value)
        except Exception:
            pass
    return Path.home() / "Documents"


def clouds():
    found = []
    seen = set()

    def add(kind, name, root):
        try:
            root = Path(root)
            if not root.is_dir():
                return
            key = str(root.resolve()).lower()
        except OSError:
            return
        if key in seen:
            return
        seen.add(key)
        found.append({"kind": kind, "name": name, "root": str(root), "path": str(root / FOLDER)})

    if os.environ.get("OneDriveCommercial"):
        add("onedrive", "OneDrive (school or work)", os.environ["OneDriveCommercial"])
    for key in ("OneDriveConsumer", "OneDrive"):
        if os.environ.get(key):
            add("onedrive", "OneDrive", os.environ[key])
    home = Path.home()
    if sys.platform == "win32":
        for letter in string.ascii_uppercase:
            drive = Path(f"{letter}:\\My Drive")
            try:
                if drive.is_dir():
                    add("gdrive", "Google Drive", drive)
            except OSError:
                pass
    for candidate in (home / "Google Drive" / "My Drive", home / "My Drive", home / "Google Drive"):
        add("gdrive", "Google Drive", candidate)
    for base in (os.environ.get("LOCALAPPDATA"), os.environ.get("APPDATA")):
        info = Path(base or "") / "Dropbox" / "info.json"
        try:
            data = json.loads(info.read_text(encoding="utf-8")) if base and info.is_file() else {}
        except (OSError, ValueError):
            data = {}
        for kind in ("personal", "business"):
            if isinstance(data.get(kind), dict) and data[kind].get("path"):
                add("dropbox", "Dropbox", data[kind]["path"])
    add("dropbox", "Dropbox", home / "Dropbox")
    add("icloud", "iCloud Drive", home / "iCloudDrive")
    cloud = home / "Library" / "CloudStorage"
    if cloud.is_dir():
        for item in sorted(cloud.iterdir()):
            name = item.name.lower()
            if name.startswith("onedrive"):
                add("onedrive", "OneDrive", item)
            elif name.startswith("googledrive"):
                add("gdrive", "Google Drive", item / "My Drive" if (item / "My Drive").is_dir() else item)
            elif name.startswith("dropbox"):
                add("dropbox", "Dropbox", item)
    add("icloud", "iCloud Drive", home / "Library" / "Mobile Documents" / "com~apple~CloudDocs")
    return found


def cloud_of(path):
    try:
        target = Path(path).resolve()
    except OSError:
        return None
    for item in clouds():
        root = Path(item["root"]).resolve()
        if target == root or root in target.parents:
            return item
    return None


class Storage:
    def __init__(self, data, fallback):
        self.file = Path(data) / "storage.json"
        self.fallback = fallback

    def chosen(self):
        try:
            value = json.loads(self.file.read_text(encoding="utf-8")).get("essays")
        except (OSError, ValueError):
            return None
        return Path(value) if value else None

    def initial(self):
        picked = self.chosen()
        if picked:
            return picked
        if self.fallback:
            return Path(self.fallback)
        legacy = Path.home() / "Documents" / FOLDER
        if legacy.is_dir() and any(legacy.rglob("*.txt")):
            return legacy
        return documents() / FOLDER

    def describe(self, current):
        current = Path(current)
        cloud = cloud_of(current)
        local = documents() / FOLDER
        home = cloud_of(local)
        options = []
        for item in clouds():
            if home and home["root"] == item["root"]:
                item = dict(item, path=str(local))
            options.append(dict(item, exists=Path(item["path"]).is_dir()))
        plain = local if not home else Path.home() / "Documents" / FOLDER
        if not cloud_of(plain):
            options.append({"kind": "local", "name": "This computer", "root": str(plain.parent), "path": str(plain), "exists": plain.is_dir()})
        count = sum(1 for _ in current.rglob("*.txt")) if current.is_dir() else 0
        return {
            "current": str(current),
            "cloud": cloud["kind"] if cloud else None,
            "service": cloud["name"] if cloud else None,
            "chosen": self.chosen() is not None,
            "count": count,
            "options": options,
        }

    def move(self, old, new, skip=()):
        old, new = Path(old), Path(new)
        moved = {}
        if not old.is_dir() or old.resolve() == new.resolve():
            return moved
        new.mkdir(parents=True, exist_ok=True)
        blocked = {Path(item).resolve() for item in skip}
        for item in sorted(old.iterdir()):
            if item.resolve() in blocked or item.name.startswith("."):
                continue
            target = new / item.name
            number = 2
            while target.exists():
                target = new / (f"{item.stem} {number}{item.suffix}" if item.is_file() else f"{item.name} {number}")
                number += 1
            shutil.move(str(item), str(target))
            moved[str(item)] = str(target)
        try:
            old.rmdir()
        except OSError:
            pass
        return moved

    def choose(self, path):
        target = Path(path)
        target.mkdir(parents=True, exist_ok=True)
        probe = target / ".essay-builder-check"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink()
        self.file.parent.mkdir(parents=True, exist_ok=True)
        self.file.write_text(json.dumps({"essays": str(target)}, indent=1), encoding="utf-8")
        return target
