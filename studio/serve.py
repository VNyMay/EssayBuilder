import argparse
import base64
import json
import mimetypes
import os
import re
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlparse

STUDIO = Path(__file__).resolve().parent
ROOT = STUDIO.parent
ENGINE = ROOT / "engine"
DATA = Path(os.environ.get("ESSAY_BUILDER_DATA") or STUDIO)
RECENT = DATA / "recent.json"
HIDDEN = DATA / "hidden.json"
BACKUPS = DATA / "backups"
PREFS = DATA / "prefs.json"
THUMBS = DATA / "thumbs"
LINKS = DATA / "exports.json"
CHECKS = DATA / "checks.json"
STARTER = "title: Untitled essay\nsubject:\ncover: no\ncontents: no\n---\n\n# Introduction\n\n"
STARTER_DIR = STUDIO / "starters"
OWN_TEMPLATES = DATA / "templates"
STARTERS = (
    ("extended-essay", "Extended Essay", "Core", ""),
    ("tok-essay", "TOK Essay", "Core", ""),
    ("tok-exhibition", "TOK Exhibition", "Core", ""),
    ("cas-reflection", "CAS Reflection", "Core", "One experience"),
    ("cas-project", "CAS Project", "Core", "Five stages"),
    ("science-ia", "Science IA", "Subjects", "Biology, Chemistry, Physics"),
    ("maths-ia", "Maths IA", "Subjects", "AA and AI, 12–20 pages"),
    ("cs-ia", "Computer Science IA", "Subjects", ""),
    ("business-ia", "Business Management IA", "Subjects", ""),
    ("digital-society-ia", "Digital Society IA", "Subjects", ""),
    ("history-ia", "History IA", "Subjects", ""),
    ("english-essay", "English Essay", "Languages", ""),
    ("english-io", "English Individual Oral", "Languages", "10-point outline"),
    ("french-writing", "French Writing Task", "Languages", ""),
    ("arabic-writing", "Arabic Writing Task", "Languages", ""),
    ("essay", "Essay", "General", "Any length"),
    ("report", "Report", "General", "Any length"),
    ("lab-report", "Lab Report", "General", "Any length"),
)
PNG_DPI = 144
DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
SMOOTH = [
    "--disable-frame-rate-limit",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
    "--ignore-gpu-blocklist",
    "--enable-smooth-scrolling",
]

sys.path.insert(0, str(ENGINE))

import build  # noqa: E402
import history  # noqa: E402
import update  # noqa: E402
from storage import Storage  # noqa: E402
from lib import setup  # noqa: E402

STORAGE = Storage(DATA, os.environ.get("ESSAY_BUILDER_ESSAYS") or (None if (ROOT / "installed.flag").is_file() else ROOT / "Essays"))
ESSAYS = STORAGE.initial()
UPDATER = update.Updater(DATA / "updates", (ROOT / "installed.flag").is_file())


class State:
    def __init__(self):
        self.path = None
        self.work = Path(tempfile.mkdtemp(prefix="essay-studio-"))
        self.version = 0
        self.lock = threading.Lock()
        self.history_lock = threading.Lock()
        self.last_ping = time.time()
        self.seen = False
        self.pool = ThreadPoolExecutor(6)
        self.cache = {}
        self.kept = []

    def stored(self):
        try:
            items = json.loads(RECENT.read_text(encoding="utf-8-sig")) if RECENT.exists() else []
        except (OSError, ValueError):
            items = []
        if isinstance(items, str):
            items = [items]
        return [item for item in items if isinstance(item, str)] if isinstance(items, list) else []

    def recent(self):
        return self.everything()[:8]

    def everything(self):
        hidden = self.hidden()
        found = [item for item in self.stored() if Path(item).is_file() and item not in hidden]
        if ESSAYS.is_dir():
            skip = {BACKUPS.resolve(), DATA.resolve()}
            own = sorted((file for file in ESSAYS.rglob("*.txt") if not skip & set(file.resolve().parents)), key=lambda file: file.stat().st_mtime, reverse=True)
            found += [str(file) for file in own if str(file) not in found and str(file) not in hidden]
        return found

    def library(self):
        out = []
        for item in self.everything()[:500]:
            path = Path(item)
            try:
                modified = path.stat().st_mtime
            except OSError:
                continue
            out.append({"path": item, "name": essay_title(item) or path.stem, "folder": path.parent.name, "modified": modified, "thumb": thumb_url(item), "title": essay_title(item)})
        return out

    def hidden(self):
        try:
            items = json.loads(HIDDEN.read_text(encoding="utf-8-sig")) if HIDDEN.exists() else []
        except (OSError, ValueError):
            items = []
        return set(item for item in items if isinstance(item, str))

    def forget(self, path):
        hidden = self.hidden() | {str(path)}
        HIDDEN.write_text(json.dumps(sorted(hidden)), encoding="utf-8")
        RECENT.write_text(json.dumps([item for item in self.stored() if item != str(path)]), encoding="utf-8")

    def trash(self, path):
        target = Path(path)
        if str(target) not in self.everything() or target.suffix.lower() != ".txt" or not target.is_file():
            raise ValueError("Only your own essays can be deleted")
        if self.path is not None and Path(self.path) == target:
            raise ValueError("Close this essay before deleting it")
        recycle(target)
        versions = versions_folder(target)
        if versions.is_dir():
            try:
                recycle(versions)
            except OSError:
                shutil.rmtree(versions, ignore_errors=True)
        self.forget(target)

    def backup_folder(self):
        folder = versions_folder(self.path)
        folder.mkdir(parents=True, exist_ok=True)
        return folder

    def backup(self, source, force=False):
        keep = getattr(self, "keep", history.FOREVER)
        if self.path is None or not source.strip() or keep <= 0:
            return
        try:
            with self.history_lock:
                history.snapshot(self.backup_folder(), source, keep, force=force)
        except OSError:
            pass

    def name_version(self, name, label, current):
        with self.history_lock:
            if name:
                history.rename(self.backup_folder(), name, label)
            else:
                history.name_current(self.backup_folder(), current, label, getattr(self, "keep", history.FOREVER))
        return self.versions()

    def restore_version(self, name, current):
        with self.history_lock:
            text = history.restore(self.backup_folder(), name, current, getattr(self, "keep", history.FOREVER))
        self.path.write_text(text, encoding="utf-8")
        self.known = text
        return text

    def copy_version(self, name):
        text = self.read_version(name)
        when = time.localtime(Path(self.backup_folder(), Path(name).name).stat().st_mtime)
        stem = re.sub(r" \(\d+ \w+ \d{4} \d+\.\d+\)$", "", self.path.stem)
        label = f"{stem} ({time.strftime('%d %b %Y %H.%M', when).lstrip('0')})"
        target = self.path.with_name(f"{label}.txt")
        number = 2
        while target.exists():
            target = self.path.with_name(f"{label} {number}.txt")
            number += 1
        target.write_text(text, encoding="utf-8")
        fresh_versions(target)
        self.open(target)

    def copy(self):
        if self.path is None:
            return
        number = 1
        stem = re.sub(r" copy( \d+)?$", "", self.path.stem)
        target = self.path.with_name(f"{stem} copy.txt")
        while target.exists():
            number += 1
            target = self.path.with_name(f"{stem} copy {number}.txt")
        shutil.copyfile(self.path, target)
        fresh_versions(target)
        self.open(target)

    def disk(self):
        try:
            return self.path.read_text(encoding="utf-8-sig")
        except (OSError, AttributeError):
            return None

    def save(self, source, leaving=False):
        if self.path is None:
            return None
        disk = self.disk()
        known = getattr(self, "known", None)
        if disk is not None and known is not None and disk != known and disk != source:
            if leaving:
                self.keep_copy(source, "this computer")
            return disk
        self.path.write_text(source, encoding="utf-8")
        self.known = source
        self.backup(source)
        return None

    def keep_copy(self, text, label):
        stem = self.path.stem
        target = self.path.with_name(f"{stem} ({label}).txt")
        number = 2
        while target.exists():
            target = self.path.with_name(f"{stem} ({label} {number}).txt")
            number += 1
        target.write_text(text, encoding="utf-8")
        return target

    def resolve(self, mode, source):
        disk = self.disk()
        if disk is None:
            self.save(source)
            return {"ok": True}
        if mode == "theirs":
            self.backup(source, force=True)
            self.known = disk
            return {"ok": True, "source": disk}
        copy = self.keep_copy(disk, "other version")
        self.path.write_text(source, encoding="utf-8")
        self.known = source
        self.backup(source)
        return {"ok": True, "copy": copy.stem}

    def versions(self):
        if self.path is None:
            return []
        with self.history_lock:
            return history.listing(self.backup_folder())

    def read_version(self, name):
        return history.read(self.backup_folder(), name)

    def remember(self, path):
        hidden = self.hidden()
        if str(path) in hidden:
            HIDDEN.write_text(json.dumps(sorted(hidden - {str(path)})), encoding="utf-8")
        items = [str(path)] + [item for item in self.stored() if item != str(path) and Path(item).is_file()]
        RECENT.write_text(json.dumps(items[:8]), encoding="utf-8")

    def from_word(self, source):
        from lib.docx_import import import_docx

        ESSAYS.mkdir(parents=True, exist_ok=True)
        stem = re.sub(r"[^\w -]+", "", source.stem).strip() or "Essay"
        folder = ESSAYS / stem
        number = 2
        while folder.exists():
            folder = ESSAYS / f"{stem} {number}"
            number += 1
        try:
            target, warnings = import_docx(source, folder)
        except Exception as error:
            shutil.rmtree(folder, ignore_errors=True)
            raise ValueError("This Word file could not be read") from error
        fresh_versions(target)
        self.notice = "Imported from Word. " + "; ".join(warnings).capitalize() if warnings else "Imported from Word"
        return target

    def extract(self, pdf):
        import io
        import zipfile

        import pymupdf

        saved = load_links()
        for essay, linked in saved["links"].items():
            if linked and Path(linked).resolve() == pdf.resolve() and Path(essay).is_file():
                return Path(essay)

        with pymupdf.open(pdf) as doc:
            if "essay-project.zip" not in doc.embfile_names():
                raise ValueError("This PDF was not made by Essay Builder, so it cannot be edited")
            data = doc.embfile_get("essay-project.zip")
        ESSAYS.mkdir(parents=True, exist_ok=True)
        stem = re.sub(r"[^\w -]+", "", pdf.stem).strip() or "Essay"
        folder = ESSAYS / stem
        number = 2
        while folder.exists():
            folder = ESSAYS / f"{stem} {number}"
            number += 1
        folder.mkdir()
        with zipfile.ZipFile(io.BytesIO(data)) as bundle:
            for member in bundle.namelist():
                target = (folder / member).resolve()
                if folder.resolve() not in target.parents:
                    raise ValueError("The project inside this PDF is not safe to open")
            bundle.extractall(folder)
        texts = sorted(folder.glob("*.txt"))
        if not texts:
            raise ValueError("No essay was found inside this PDF")
        fresh_versions(texts[0].resolve())
        saved["links"][str(texts[0].resolve())] = str(pdf.resolve())
        save_links(saved)
        return texts[0]

    def open(self, path):
        path = Path(path).resolve()
        if not path.is_file():
            raise FileNotFoundError(f"File not found: {path}")
        if path.suffix.lower() == ".pdf":
            path = self.extract(path)
        elif path.suffix.lower() == ".docx":
            path = self.from_word(path)
        self.path = path
        self.remember(path)
        self.known = self.disk()
        try:
            self.backup(path.read_text(encoding="utf-8-sig"), force=True)
        except OSError:
            pass

    def import_file(self, name, data):
        ESSAYS.mkdir(parents=True, exist_ok=True)
        clean = re.sub(r"[^\w. -]+", "", Path(name).name).strip() or "Essay.txt"
        if Path(clean).suffix.lower() not in {".txt", ".pdf", ".docx"}:
            raise ValueError("Choose an essay (.txt), a Word file (.docx) or a PDF made by Essay Builder")
        if Path(clean).suffix.lower() == ".docx":
            with tempfile.TemporaryDirectory() as folder:
                source = Path(folder) / clean
                source.write_bytes(base64.b64decode(data))
                self.open(source)
            return
        target = ESSAYS / clean
        number = 2
        while target.exists():
            target = ESSAYS / f"{Path(clean).stem} {number}{Path(clean).suffix}"
            number += 1
        target.write_bytes(base64.b64decode(data))
        self.open(target)

    def create(self, template=None):
        names = {ident: name for ident, name, *_ in STARTERS}
        own = OWN_TEMPLATES / f"{template[5:]}.txt" if template and template.startswith("mine:") else None
        if template and template not in names and not (own and own.is_file()):
            raise ValueError(f"Unknown template: {template}")
        ESSAYS.mkdir(parents=True, exist_ok=True)
        stem = own.stem if own else names.get(template, "Untitled essay")
        if own:
            text = own.read_text(encoding="utf-8")
        else:
            text = (STARTER_DIR / f"{template}.txt").read_text(encoding="utf-8") if template else STARTER
        path = ESSAYS / (f"{stem}.txt" if template else f"{stem} 1.txt")
        number = 2
        while path.exists():
            path = ESSAYS / f"{stem} {number}.txt"
            number += 1
        path.write_text(text, encoding="utf-8")
        fresh_versions(path)
        self.open(path)

    def snapshot(self):
        if self.path is None:
            recent = self.recent()
            return {"open": False, "recent": recent, "details": details(recent)}
        notice, self.notice = getattr(self, "notice", None), None
        return {
            "open": True,
            "notice": notice,
            "path": str(self.path),
            "name": self.path.name,
            "source": self.path.read_text(encoding="utf-8-sig"),
            "recent": self.recent(),
            "pdf": load_links()["links"].get(str(self.path), ""),
        }

    def page_key(self, doc, page):
        import hashlib

        digest = hashlib.sha1(page.read_contents())
        digest.update(repr((page.rect, [(font[3], font[4]) for font in page.get_fonts()])).encode())
        for image in page.get_images(full=True):
            digest.update(doc.xref_stream_raw(image[0]) or b"")
        for xref in {item[0] for item in page.get_xobjects()}:
            digest.update(doc.xref_stream_raw(xref) or b"")
        return digest.hexdigest()

    def save_png(self, pixmap, target):
        try:
            from PIL import Image

            Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples).save(target, compress_level=1)
        except ImportError:
            pixmap.save(target)

    def rasterise(self, pdf, version, dpi):
        import pymupdf

        pages, jobs, names = [], [], set()
        with pymupdf.open(pdf) as doc:
            for index, page in enumerate(doc):
                key = f"{self.page_key(doc, page)}@{dpi}"
                name = self.cache.get(key)
                if not name or not (self.work / name).is_file():
                    name = f"r{version}-p{index}-{dpi}.png"
                    self.cache[key] = name
                    jobs.append(self.pool.submit(self.save_png, page.get_pixmap(dpi=dpi), self.work / name))
                names.add(name)
                pages.append({"url": f"/pages/{name}", "w": page.rect.width, "h": page.rect.height})
        for job in jobs:
            job.result()
        return pages, names

    def sharpen(self, dpi):
        with self.lock:
            pdf = getattr(self, "last_pdf", None)
            if not pdf or not Path(pdf).is_file():
                return {"pages": []}
            dpi = max(96, min(300, int(dpi)))
            pages, names = self.rasterise(pdf, self.version, dpi)
            self.kept = (self.kept + [names])[-3:]
            return {"pages": pages, "dpi": dpi, "version": self.version}

    def render(self, source, have="", dpi=PNG_DPI):
        import pymupdf

        with self.lock:
            conflict = self.save(source)
            self.version += 1
            version = self.version
            output = self.work / f"r{version}.pdf"
            try:
                result = build.studio_build(self.path, source, output)
            except SystemExit as error:
                return {"version": version, "fatal": str(error)}
            except Exception as error:
                return {"version": version, "fatal": f"{type(error).__name__}: {error}"}
            result["version"] = version
            if result.get("title") is not None:
                result["title"] = display_title(source, str(result["title"]))
            if "pdf" in result:
                dpi = max(96, min(300, int(dpi or PNG_DPI)))
                pages, names = self.rasterise(output, version, dpi)
                self.last_pdf = output
                self.make_thumb(output)
                result["dpi"] = dpi
                self.kept = (self.kept + [names])[-3:]
                result["pages"] = pages
                fonts = re.sub(
                    r'url\("file:///([^"]+)"\)',
                    lambda match: f'url("/fontfile/{quote(unquote(match.group(1)))}")',
                    result.pop("fontCss", ""),
                )
                stamp = str(hash(fonts))
                if stamp != have:
                    result["fontCss"] = fonts
                result["fontStamp"] = stamp
                result["regions"] = {str(key): value for key, value in result["regions"].items()}
                result.pop("pdf")
                result.pop("sizes", None)
                self.clean(version)
            if conflict is not None and isinstance(result, dict):
                result["conflict"] = True
            return result

    def make_thumb(self, pdf):
        import pymupdf

        try:
            THUMBS.mkdir(parents=True, exist_ok=True)
            with pymupdf.open(pdf) as doc:
                doc[0].get_pixmap(matrix=pymupdf.Matrix(0.62, 0.62)).save(str(THUMBS / thumb_name(self.path)))
        except Exception:
            pass

    def clean(self, keep):
        for file in self.work.iterdir():
            match = re.match(r"r(\d+)[-.]", file.name)
            if match and int(match.group(1)) < keep - 1 and not any(file.name in names for names in self.kept):
                file.unlink(missing_ok=True)

    def export(self):
        with self.lock:
            target = self.work / "export" / f"{self.path.stem}.pdf"
            target.parent.mkdir(exist_ok=True)
            try:
                build.build(self.path, target)
            except SystemExit as error:
                found = re.search(r"(\d+) error", str(error))
                if found:
                    count = int(found.group(1))
                    return {"error": f"Fix {'this problem' if count == 1 else f'these {count} problems'} first, then export again.", "problems": count}
                return {"error": str(error)}
        if not target.is_file():
            return {"error": "no PDF was produced"}
        return {"name": target.name}

    def export_docx(self):
        from lib import docx_export

        with self.lock:
            target = self.work / "export" / f"{self.path.stem}.docx"
            target.parent.mkdir(exist_ok=True)
            try:
                docx_export.export(self.path, target)
            except (SystemExit, ValueError) as error:
                return {"error": str(error)}
            except Exception as error:
                return {"error": f"{type(error).__name__}: {error}"}
        if not target.is_file():
            return {"error": "no Word document was produced"}
        return {"name": target.name}

    def upload(self, name, data):
        folder = self.path.parent / "assets"
        folder.mkdir(exist_ok=True)
        stem = re.sub(r"[^\w.-]+", "-", Path(name).stem).strip("-") or "file"
        suffix = Path(name).suffix.lower()
        target = folder / f"{stem}{suffix}"
        number = 2
        while target.exists():
            target = folder / f"{stem}-{number}{suffix}"
            number += 1
        target.write_bytes(base64.b64decode(data))
        return target.relative_to(self.path.parent).as_posix()


STATE = State()


REGIONS = [
    "africa", "europe", "asia", "middle east", "north america", "south america", "oceania", "north africa",
    "east africa", "west africa", "southeast asia", "south asia", "scandinavia",
]
SHORT = {
    "United States of America": "United States", "Dem. Rep. Congo": "DR Congo", "Bosnia and Herz.": "Bosnia and Herzegovina",
    "Central African Rep.": "Central African Republic", "Dominican Rep.": "Dominican Republic", "Eq. Guinea": "Equatorial Guinea",
    "S. Sudan": "South Sudan", "W. Sahara": "Western Sahara", "eSwatini": "Eswatini", "Solomon Is.": "Solomon Islands",
}


def places():
    data = json.loads((ENGINE / "data" / "countries.json").read_text(encoding="utf-8"))
    names = {SHORT.get(item["name"], item["name"]) for item in data if item["a2"]}
    return {"countries": sorted(names), "regions": REGIONS}


FONT_LISTS = {}


def font_lists():
    if not FONT_LISTS:
        from lib import fonts

        try:
            system = fonts.system_families()
        except Exception:
            system = []
        try:
            google = sorted(
                ([meta["family"], meta.get("category") or ""] for meta in fonts.catalogue().values() if meta.get("category") not in fonts.SKIP_CATEGORIES),
                key=lambda item: item[0].lower(),
            )
        except Exception:
            google = []
        FONT_LISTS.update(system=system, google=google)
    return FONT_LISTS


def versions_folder(path):
    import hashlib

    path = Path(path)
    key = hashlib.sha1(str(path).lower().encode("utf-8")).hexdigest()[:8]
    return BACKUPS / f"{re.sub(r'[^A-Za-z0-9 _-]+', '', path.stem)[:40]}-{key}"


def fresh_versions(path):
    folder = versions_folder(Path(path).resolve())
    if folder.is_dir():
        shutil.rmtree(folder, ignore_errors=True)


def recycle(path):
    if sys.platform == "win32":
        import ctypes
        from ctypes import wintypes

        class Operation(ctypes.Structure):
            _fields_ = [
                ("hwnd", wintypes.HWND),
                ("wFunc", wintypes.UINT),
                ("pFrom", wintypes.LPCWSTR),
                ("pTo", wintypes.LPCWSTR),
                ("fFlags", ctypes.c_uint16),
                ("fAnyOperationsAborted", wintypes.BOOL),
                ("hNameMappings", ctypes.c_void_p),
                ("lpszProgressTitle", wintypes.LPCWSTR),
            ]

        operation = Operation(None, 3, str(path) + "\0", None, 0x40 | 0x10 | 0x4 | 0x400, False, None, None)
        if ctypes.windll.shell32.SHFileOperationW(ctypes.byref(operation)) or operation.fAnyOperationsAborted:
            raise OSError("The essay could not be moved to the Recycle Bin")
        return
    folder = DATA / "trash"
    folder.mkdir(parents=True, exist_ok=True)
    shutil.move(str(path), folder / f"{int(time.time())}-{Path(path).name}")


def pick_file():
    if sys.platform != "win32" and not os.environ.get("DISPLAY") and sys.platform != "darwin":
        return None
    script = (
        "import tkinter as tk\n"
        "from tkinter import filedialog\n"
        "root = tk.Tk()\n"
        "root.withdraw()\n"
        "root.attributes('-topmost', True)\n"
        "print(filedialog.askopenfilename(filetypes=[('Essay, Word file or Essay Builder PDF', '*.txt *.docx *.pdf'), ('All files', '*.*')]))\n"
    )
    done = subprocess.run([sys.executable, "-c", script], capture_output=True, text=True)
    return done.stdout.strip()


def thumb_name(path):
    import hashlib

    return hashlib.sha1(str(path).lower().encode("utf-8")).hexdigest()[:16] + ".png"


def thumb_url(path):
    file = THUMBS / thumb_name(path)
    if not file.is_file():
        return ""
    return f"/thumb/{file.name}?t={int(file.stat().st_mtime)}"


def save_template(name, page=""):
    if STATE.path is None:
        return {"error": "Open an essay first"}
    clean = re.sub(r'[\\/:*?"<>|]+', "", str(name or "")).strip()[:60]
    if not clean:
        return {"error": "Give the template a name"}
    OWN_TEMPLATES.mkdir(parents=True, exist_ok=True)
    base = STATE.path.parent
    lines = []
    for line in STATE.path.read_text(encoding="utf-8").split("\n"):
        found = re.match(r"^(\s*(?:src|cover-image|cover-logo|logo)\s*:\s*)(.+?)\s*$", line)
        if found and not re.match(r"^([a-zA-Z]:[\\/]|/|https?:)", found.group(2)):
            target = (base / found.group(2)).resolve()
            if target.exists():
                line = f"{found.group(1)}{target}"
        lines.append(line)
    (OWN_TEMPLATES / f"{clean}.txt").write_text("\n".join(lines), encoding="utf-8")
    picture = STATE.work / Path(str(page)).name if page else None
    if picture and picture.is_file() and picture.suffix == ".png":
        try:
            from PIL import Image

            with Image.open(picture) as image:
                image.thumbnail((360, 520))
                image.save(OWN_TEMPLATES / f"{clean}.png")
        except Exception:
            shutil.copyfile(picture, OWN_TEMPLATES / f"{clean}.png")
    return {"ok": True, "id": f"mine:{clean}"}


def remove_template(ident):
    name = str(ident or "")
    if not name.startswith("mine:"):
        return {"error": "Only your own templates can be removed"}
    for suffix in (".txt", ".png"):
        file = OWN_TEMPLATES / f"{Path(name[5:]).name}{suffix}"
        if file.is_file():
            file.unlink()
    return {"ok": True}


def own_templates():
    out = []
    if not OWN_TEMPLATES.is_dir():
        return out
    for file in sorted(OWN_TEMPLATES.glob("*.txt"), key=lambda item: item.stat().st_mtime, reverse=True):
        head = file.read_text(encoding="utf-8").split("\n---", 1)[0]
        limit = re.search(r"^word-limit:\s*(\d+)\s*$", head, re.M)
        thumb = file.with_suffix(".png")
        out.append(
            {
                "id": f"mine:{file.stem}",
                "name": file.stem,
                "group": "Mine",
                "note": f"{int(limit.group(1)):,} words" if limit else "Your template",
                "thumb": f"/mytemplates/{quote(thumb.name)}?t={int(thumb.stat().st_mtime)}" if thumb.is_file() else "",
                "mine": True,
            }
        )
    return out


def starters():
    out = own_templates()
    for ident, name, group, note in STARTERS:
        file = STARTER_DIR / f"{ident}.txt"
        if not file.is_file():
            continue
        head = file.read_text(encoding="utf-8").split("\n---", 1)[0]
        limit = re.search(r"^word-limit:\s*(\d+)\s*$", head, re.M)
        thumb = STARTER_DIR / f"{ident}.png"
        out.append(
            {
                "id": ident,
                "name": name,
                "group": group,
                "note": " · ".join(part for part in (note, f"{int(limit.group(1)):,} words" if limit else "") if part),
                "thumb": f"/starters/{ident}.png?t={int(thumb.stat().st_mtime)}" if thumb.is_file() else "",
            }
        )
    return out


def essay_title(path):
    path = Path(path)
    if path.suffix.lower() != ".txt":
        return ""
    try:
        with path.open(encoding="utf-8-sig", errors="replace") as handle:
            text = handle.read(8192)
    except OSError:
        return ""
    return display_title(text)


GENERIC_TITLES = {"tok essay", "essay", "report", "lab report", "extended essay"}


def display_title(text, title=None):
    head, _, body = text.partition("\n---")
    if title is None:
        found = re.search(r"^title\s*:\s*(.+?)\s*$", head, re.M)
        title = found.group(1).replace("*", "").strip() if found else ""
    if title.lower() in GENERIC_TITLES:
        lead = body.split("\n# ", 1)[0]
        block = re.search(r"^:::text\s*\n(?:[\w-]+\s*:.*\n)*---\s*\n(.+?)\s*\n:::", lead, re.M)
        if block:
            line = block.group(1).replace("*", "").strip()
            if line and not re.search(r"\b(copy your|your|here)\b", line, re.I):
                return line[:120]
    return title[:120]


def details(paths):
    out = {}
    for item in paths:
        try:
            modified = Path(item).stat().st_mtime
        except OSError:
            modified = 0
        out[item] = {"thumb": thumb_url(item), "modified": modified, "title": essay_title(item)}
    return out


def load_links():
    try:
        saved = json.loads(LINKS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        saved = {}
    if not isinstance(saved, dict):
        saved = {}
    saved.setdefault("links", {})
    saved.setdefault("folder", "")
    return saved


def save_links(saved):
    LINKS.write_text(json.dumps(saved, indent=1), encoding="utf-8")


def load_prefs():
    try:
        saved = json.loads(PREFS.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {}
    return {key: value for key, value in saved.items() if isinstance(key, str) and key.startswith("studio.") and isinstance(value, str)}


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_bytes(self, status, body, kind, extra=None):
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (extra or {}).items():
            self.send_header(key, value)
        self.end_headers()
        self.wfile.write(body)

    def send_json(self, payload, status=200):
        self.send_bytes(status, json.dumps(payload).encode("utf-8"), "application/json")

    def do_GET(self):
        route = unquote(urlparse(self.path).path)
        if route == "/api/state":
            return self.send_json(STATE.snapshot())
        if route == "/api/places":
            return self.send_json(places())
        if route == "/api/update":
            info = update.status(DATA / "update.json")
            info["canInstall"] = UPDATER.can_install() and bool(info.get("installer"))
            info["progress"] = UPDATER.progress()
            return self.send_json(info)
        if route == "/api/ping":
            STATE.last_ping = time.time()
            STATE.seen = True
            return self.send_json({"ok": True})
        if route.startswith("/pages/"):
            file = STATE.work / Path(route).name
            if file.is_file():
                return self.send_bytes(200, file.read_bytes(), "image/png")
            return self.send_bytes(404, b"", "text/plain")
        if route.startswith("/export/") and STATE.path:
            file = STATE.work / "export" / Path(unquote(route)).name
            if file.is_file():
                disposition = {"Content-Disposition": f'attachment; filename="{file.name}"'}
                kind = DOCX_TYPE if file.suffix.lower() == ".docx" else "application/pdf"
                return self.send_bytes(200, file.read_bytes(), kind, disposition)
        if route.startswith("/file/") and STATE.path:
            file = (STATE.path.parent / route[len("/file/"):]).resolve()
            if file.is_file() and STATE.path.parent in file.parents:
                kind = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
                return self.send_bytes(200, file.read_bytes(), kind)
        if route.startswith("/vendor/") and route.endswith(".js") and route.count("/") == 2:
            file = STUDIO / "vendor" / Path(route).name
            if file.is_file():
                return self.send_bytes(200, file.read_bytes(), "text/javascript; charset=utf-8", {"Cache-Control": "max-age=86400"})
        if route == "/vendor/asciimath.js":
            source = (ENGINE / "node_modules" / "asciimath2tex" / "dist" / "asciimath2tex.mjs").read_text(encoding="utf-8")
            source = source.replace("export{a as default};", ";window.AsciiMath=a;")
            return self.send_bytes(200, source.encode("utf-8"), "text/javascript; charset=utf-8")
        if route.startswith("/vendor/katex/"):
            base = ENGINE / "node_modules" / "katex" / "dist"
            file = (base / route[len("/vendor/katex/"):]).resolve()
            if file.is_file() and base in file.parents and file.suffix in {".js", ".css", ".woff2", ".woff", ".ttf"}:
                kind = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
                return self.send_bytes(200, file.read_bytes(), kind)
        if route.startswith("/fontfile/"):
            file = Path(unquote(route[len("/fontfile/"):])).resolve()
            if file.is_file() and (ENGINE / "fonts") in file.parents and file.suffix in {".woff2", ".woff", ".ttf", ".otf"}:
                return self.send_bytes(200, file.read_bytes(), mimetypes.guess_type(file.name)[0] or "font/woff2", {"Cache-Control": "max-age=86400"})
        if route == "/kit-bundle.js":
            files = {file.name: file.read_text(encoding="utf-8") for file in sorted(STUDIO.glob("kit-*.js"))}
            bundle = (
                f"const KIT_FILES = {json.dumps(files)};\n"
                "Object.entries(KIT_FILES).forEach(([name, source]) => {\n"
                "  try {\n    (0, eval)(source);\n  } catch (error) {\n    console.error('kit file failed', name, error.message);\n  }\n});\n"
            )
            return self.send_bytes(200, bundle.encode("utf-8"), "text/javascript; charset=utf-8")
        if route.startswith("/typefaces/"):
            file = (STUDIO / "typefaces" / Path(route).name).resolve()
            if file.is_file() and file.suffix == ".woff2":
                return self.send_bytes(200, file.read_bytes(), "font/woff2", {"Cache-Control": "max-age=86400"})
        if route.startswith("/thumb/"):
            file = (THUMBS / Path(route).name).resolve()
            if file.parent == THUMBS.resolve() and file.suffix == ".png" and file.is_file():
                return self.send_bytes(200, file.read_bytes(), "image/png", {"Cache-Control": "max-age=31536000"})
            return self.send_bytes(404, b"not found", "text/plain")
        if route.startswith("/previews/"):
            file = (STUDIO / "previews" / Path(route).name).resolve()
            if file.is_file() and file.suffix == ".webp":
                return self.send_bytes(200, file.read_bytes(), "image/webp", {"Cache-Control": "max-age=86400"})
        if route.startswith("/mytemplates/"):
            file = (OWN_TEMPLATES / Path(unquote(route)).name).resolve()
            if file.parent == OWN_TEMPLATES.resolve() and file.suffix == ".png" and file.is_file():
                return self.send_bytes(200, file.read_bytes(), "image/png", {"Cache-Control": "max-age=86400"})
            return self.send_bytes(404, b"not found", "text/plain")
        if route.startswith("/starters/"):
            file = (STARTER_DIR / Path(route).name).resolve()
            if file.parent == STARTER_DIR.resolve() and file.suffix == ".png" and file.is_file():
                return self.send_bytes(200, file.read_bytes(), "image/png", {"Cache-Control": "max-age=86400"})
            return self.send_bytes(404, b"not found", "text/plain")
        name = "index.html" if route in {"/", ""} else route.lstrip("/")
        file = STUDIO / name
        if name == "index.html" and file.is_file():
            saved = json.dumps(load_prefs()).replace("</", "<\\/")
            page = file.read_text(encoding="utf-8").replace("<head>", f"<head>\n<script>window.SAVED_PREFS = {saved};</script>", 1)
            return self.send_bytes(200, page.encode("utf-8"), "text/html; charset=utf-8", {"Cache-Control": "no-store"})
        if file.is_file() and file.parent == STUDIO and file.suffix in {".html", ".css", ".js", ".svg", ".png", ".ico"}:
            kind = mimetypes.guess_type(file.name)[0] or "text/plain"
            return self.send_bytes(200, file.read_bytes(), f"{kind}; charset=utf-8" if kind.startswith("text") or kind.endswith("javascript") else kind)
        self.send_bytes(404, b"not found", "text/plain")

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        route = urlparse(self.path).path
        try:
            if route == "/api/prefs":
                clean = {str(key): str(value) for key, value in body.items() if str(key).startswith("studio.") and len(str(value)) <= 500_000}
                PREFS.write_text(json.dumps(clean, indent=1), encoding="utf-8")
                return self.send_json({"ok": True})
            if route == "/api/link":
                url = str(body.get("url", ""))
                if re.match(r"^https?://[^\s]+$", url):
                    webbrowser.open(url)
                return self.send_json({"ok": True})
            if route == "/api/render":
                return self.send_json(STATE.render(body["source"], body.get("have", ""), body.get("dpi") or PNG_DPI))
            if route == "/api/sharpen":
                return self.send_json(STATE.sharpen(body.get("dpi") or PNG_DPI))
            if route == "/api/open":
                STATE.open(body["path"])
                return self.send_json(STATE.snapshot())
            if route == "/api/copy":
                STATE.copy()
                return self.send_json(STATE.snapshot())
            if route == "/api/save":
                if "keep" in body:
                    STATE.keep = max(0, min(history.FOREVER, int(body["keep"])))
                theirs = STATE.save(body["source"], bool(body.get("leaving")))
                return self.send_json({"ok": theirs is None, "conflict": theirs is not None})
            if route == "/api/disk":
                disk = STATE.disk()
                return self.send_json({"changed": disk is not None and disk != getattr(STATE, "known", disk)})
            if route == "/api/resolve":
                return self.send_json(STATE.resolve(str(body.get("mode", "both")), body.get("source", "")))
            if route == "/api/versions":
                return self.send_json({"versions": STATE.versions()})
            if route == "/api/version":
                return self.send_json({"source": STATE.read_version(body["name"])})
            if route == "/api/version_name":
                return self.send_json({"versions": STATE.name_version(body.get("name"), body.get("label", ""), body.get("current", ""))})
            if route == "/api/version_restore":
                source = STATE.restore_version(body["name"], body.get("current", ""))
                return self.send_json({"source": source, "versions": STATE.versions()})
            if route == "/api/version_copy":
                STATE.copy_version(body["name"])
                return self.send_json(STATE.snapshot())
            if route == "/api/close":
                STATE.path = None
                return self.send_json(STATE.snapshot())
            if route == "/api/sample":
                source = STUDIO / "sample" / "Demo Essay"
                target = ESSAYS / "Sample essay"
                essay = target / "Industrial Revolution Essay.txt"
                if not essay.is_file():
                    shutil.copytree(source, target, dirs_exist_ok=True)
                STATE.open(essay)
                return self.send_json(STATE.snapshot())
            if route == "/api/new":
                STATE.create(body.get("template") or None)
                return self.send_json(STATE.snapshot())
            if route == "/api/starters":
                return self.send_json({"items": starters()})
            if route == "/api/save_template":
                return self.send_json(save_template(body.get("name"), body.get("page") or ""))
            if route == "/api/remove_template":
                return self.send_json(remove_template(body.get("id")))
            if route == "/api/pick":
                chosen = pick_file()
                if chosen is None:
                    return self.send_json({"headless": True})
                if chosen:
                    STATE.open(chosen)
                return self.send_json(STATE.snapshot())
            if route == "/api/report":
                return self.send_json(report_details())
            if route == "/api/update_download":
                info = update.status(DATA / "update.json")
                return self.send_json(UPDATER.start(info.get("installer"), info.get("latest", "")))
            if route == "/api/update_progress":
                return self.send_json(UPDATER.progress())
            if route == "/api/update_install":
                return self.send_json(UPDATER.install())
            if route == "/api/storage":
                return self.send_json(STORAGE.describe(ESSAYS))
            if route == "/api/storage_set":
                return self.send_json(change_storage(str(body.get("path", "")), bool(body.get("move"))))
            if route == "/api/library":
                return self.send_json({"items": STATE.library()})
            if route == "/api/fonts":
                return self.send_json(font_lists())
            if route in {"/api/forget", "/api/trash"}:
                failed = []
                for path in body.get("paths") or [body["path"]]:
                    try:
                        (STATE.forget if route == "/api/forget" else STATE.trash)(path)
                    except Exception as error:
                        failed.append(str(error))
                if failed and not body.get("paths"):
                    raise ValueError(failed[0])
                return self.send_json({**STATE.snapshot(), "failed": len(failed)})
            if route == "/api/import":
                STATE.import_file(body["name"], body["data"])
                return self.send_json(STATE.snapshot())
            if route == "/api/export":
                return self.send_json(STATE.export())
            if route == "/api/export_docx":
                return self.send_json(STATE.export_docx())
            if route == "/api/copy_export":
                source = STATE.work / "export" / Path(body["name"]).name
                shutil.copyfile(source, body["path"])
                saved = load_links()
                key = str(STATE.path) + ("#docx" if source.suffix.lower() == ".docx" else "")
                saved["links"][key] = str(Path(body["path"]).resolve())
                save_links(saved)
                return self.send_json({"ok": True})
            if route == "/api/export_target":
                saved = load_links()
                key = str(STATE.path) + ("#docx" if body.get("kind") == "docx" else "")
                return self.send_json({"path": saved["links"].get(key, ""), "folder": saved.get("folder", "")})
            if route == "/api/pdf_folder":
                saved = load_links()
                saved["folder"] = str(body.get("folder") or "")
                save_links(saved)
                return self.send_json({"folder": saved["folder"]})
            if route == "/api/upload":
                return self.send_json({"path": STATE.upload(body["name"], body["data"])})
            if route == "/api/check":
                from lib import checks

                if STATE.path is None:
                    return self.send_json({"findings": [], "tasks": checks.tasks(), "criteria": [], "ticks": []})
                source = body.get("source")
                if not isinstance(source, str):
                    source = STATE.path.read_text(encoding="utf-8-sig")
                pages = body.get("pages")
                pages = int(pages) if isinstance(pages, (int, float)) and pages > 0 else None
                extra = [item for item in body.get("issues") or [] if isinstance(item, dict)]
                return self.send_json(checks.essay_report(CHECKS, STATE.path, source, pages, extra))
            if route == "/api/check_save":
                from lib import checks

                if STATE.path is None:
                    return self.send_json({"ok": False})
                ticks = body.get("ticks") if isinstance(body.get("ticks"), dict) else None
                own = body.get("own") if isinstance(body.get("own"), list) else None
                checks.save(CHECKS, STATE.path, body.get("task"), ticks, own)
                return self.send_json({"ok": True})
            if route == "/api/lookup":
                from lib import lookup

                try:
                    return self.send_json({"source": lookup.find(str(body.get("query", ""))[:2000])})
                except lookup.NotFound as error:
                    return self.send_json({"error": str(error)})
            if route == "/api/reference":
                from lib import lookup

                return self.send_json(lookup.preview(body.get("fields") or {}, body.get("style") or "apa"))
            if route == "/api/open_path":
                target = Path(str(body.get("path") or ""))
                if not target.is_file() or target.suffix.lower() not in {".pdf", ".docx"}:
                    return self.send_json({"error": "File not found"})
                if sys.platform == "win32":
                    os.startfile(str(target))
                elif sys.platform == "darwin":
                    subprocess.Popen(["open", str(target)])
                else:
                    subprocess.Popen(["xdg-open", str(target)])
                return self.send_json({"ok": True})
            if route == "/api/reveal" and STATE.path:
                target = body.get("path") or str(STATE.path)
                subprocess.Popen(["explorer", "/select,", str(Path(target))])
                return self.send_json({"ok": True})
        except Exception as error:
            return self.send_json({"error": f"{type(error).__name__}: {error}"}, 500)
        self.send_bytes(404, b"not found", "text/plain")


WINDOWS = []


def watch(server):
    while True:
        time.sleep(3)
        if any(process.poll() is None for process in WINDOWS):
            continue
        if STATE.seen and time.time() - STATE.last_ping > 150:
            server.shutdown()
            return


def launch_native(url):
    if sys.platform != "win32" or os.environ.get("ESSAY_BUILDER_WINDOW") == "chrome":
        return False
    try:
        import importlib.util

        if importlib.util.find_spec("webview") is None:
            return False
    except (ImportError, ValueError):
        return False
    runner = Path(sys.executable).with_name("pythonw.exe")
    command = [str(runner if runner.exists() else sys.executable), str(STUDIO / "native.py"), url]
    process = subprocess.Popen(command, stderr=subprocess.DEVNULL, stdout=subprocess.DEVNULL)
    WINDOWS.append(process)
    time.sleep(3.0)
    return process.poll() is None or process.returncode == 0


def launch_window(url):
    try:
        found = setup.browser()
    except RuntimeError:
        return False
    profile = setup.runtime.home().parent / "window"
    flags = [f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check"]
    smooth = [flag for flag in SMOOTH if flag != "--disable-frame-rate-limit"]
    if sys.platform.startswith("linux"):
        smooth += ["--ozone-platform-hint=auto", "--class=essay-builder"]
    WINDOWS.append(
        subprocess.Popen(
            [found, f"--app={url}", "--window-size=1280,860", *flags, *smooth],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )
    )
    return True


def launch(url):
    if launch_native(url):
        return
    if sys.platform != "win32" and launch_window(url):
        return
    for name in ("chrome", "msedge"):
        found = shutil.which(name)
        if found:
            subprocess.Popen([found, f"--app={url}", "--window-size=1280,860", *SMOOTH])
            return
    for base in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"), os.environ.get("LocalAppData")):
        for relative in ("Google/Chrome/Application/chrome.exe", "Microsoft/Edge/Application/msedge.exe"):
            candidate = Path(base or "/nonexistent") / relative
            if candidate.is_file():
                subprocess.Popen([str(candidate), f"--app={url}", "--window-size=1280,860", *SMOOTH])
                return
    webbrowser.open(url)


def report_details():
    import platform

    log = DATA / "studio.log"
    try:
        lines = log.read_text(encoding="utf-8", errors="replace").splitlines()[-80:]
    except OSError:
        lines = []
    home = str(Path.home())
    clean = [line.replace(home, "~").replace(home.replace("\\", "/"), "~") for line in lines]
    return {
        "version": update.current(),
        "system": f"{platform.system()} {platform.release()} ({platform.version()})",
        "python": platform.python_version(),
        "installed": (ROOT / "installed.flag").is_file(),
        "log": clean,
    }


def change_storage(path, move):
    global ESSAYS
    if not path.strip():
        return {"error": "Choose a folder first."}
    try:
        target = STORAGE.choose(Path(path).expanduser())
    except OSError as error:
        return {"error": f"Essay Builder can't save in that folder ({error.strerror or error})."}
    moved = STORAGE.move(ESSAYS, target, skip=[DATA, BACKUPS]) if move else {}
    if moved:
        def shift(item):
            for old, new in moved.items():
                if item == old or item.startswith(old + os.sep):
                    return new + item[len(old):]
            return item

        for file in (RECENT, HIDDEN):
            try:
                items = json.loads(file.read_text(encoding="utf-8-sig")) if file.exists() else []
            except (OSError, ValueError):
                continue
            if isinstance(items, list):
                file.write_text(json.dumps([shift(item) if isinstance(item, str) else item for item in items]), encoding="utf-8")
    ESSAYS = target
    return dict(STORAGE.describe(ESSAYS), moved=len(moved))


class Server(ThreadingHTTPServer):
    request_queue_size = 256
    daemon_threads = True


def create(essay=None, port=0, host="127.0.0.1", watching=True):
    if essay:
        STATE.open(essay)
    server = Server((host, port), Handler)
    if watching:
        threading.Thread(target=watch, args=(server,), daemon=True).start()
    return server, f"http://127.0.0.1:{server.server_address[1]}/"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("essay", nargs="?")
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--no-window", action="store_true")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--keep-running", action="store_true")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    setup.ensure()
    server, url = create(args.essay, args.port, args.host, not args.keep_running)
    print(f"Essay Builder Studio: {url}", flush=True)
    if not args.no_window:
        launch(url)
    try:
        server.serve_forever()
    finally:
        shutil.rmtree(STATE.work, ignore_errors=True)


if __name__ == "__main__":
    main()
