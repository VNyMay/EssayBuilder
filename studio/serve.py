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
ESSAYS = Path(os.environ.get("ESSAY_BUILDER_ESSAYS") or ROOT / "Essays")
RECENT = DATA / "recent.json"
HIDDEN = DATA / "hidden.json"
BACKUPS = DATA / "backups"
STARTER = "title: Untitled essay\nsubject:\ncover: no\ncontents: no\n---\n\n# Introduction\n\n"
PNG_DPI = 144
SMOOTH = [
    "--disable-frame-rate-limit",
    "--enable-gpu-rasterization",
    "--enable-zero-copy",
    "--ignore-gpu-blocklist",
    "--enable-smooth-scrolling",
]

sys.path.insert(0, str(ENGINE))

import build  # noqa: E402
from lib import setup  # noqa: E402


class State:
    def __init__(self):
        self.path = None
        self.work = Path(tempfile.mkdtemp(prefix="essay-studio-"))
        self.version = 0
        self.lock = threading.Lock()
        self.last_ping = time.time()
        self.seen = False
        self.pool = ThreadPoolExecutor(6)
        self.cache = {}
        self.kept = []

    def recent(self):
        try:
            items = json.loads(RECENT.read_text(encoding="utf-8-sig")) if RECENT.exists() else []
        except (OSError, ValueError):
            items = []
        if isinstance(items, str):
            items = [items]
        return self.everything()[:8]

    def everything(self):
        try:
            items = json.loads(RECENT.read_text(encoding="utf-8-sig")) if RECENT.exists() else []
        except (OSError, ValueError):
            items = []
        if isinstance(items, str):
            items = [items]
        hidden = self.hidden()
        found = [item for item in items if isinstance(item, str) and Path(item).is_file() and item not in hidden]
        if ESSAYS.is_dir():
            own = sorted(ESSAYS.rglob("*.txt"), key=lambda file: file.stat().st_mtime, reverse=True)
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
            out.append({"path": item, "name": path.stem, "folder": path.parent.name, "modified": modified})
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
        try:
            items = json.loads(RECENT.read_text(encoding="utf-8-sig")) if RECENT.exists() else []
        except (OSError, ValueError):
            items = []
        RECENT.write_text(json.dumps([item for item in items if item != str(path)]), encoding="utf-8")

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
        keep = getattr(self, "keep", 30)
        if self.path is None or not source.strip():
            return
        if keep <= 0:
            return
        try:
            folder = self.backup_folder()
            files = sorted(folder.glob("*.txt"))
            if files:
                last = files[-1]
                if last.read_text(encoding="utf-8") == source:
                    return
                if not force and time.time() - last.stat().st_mtime < 90:
                    return
            stamp = time.strftime("%Y-%m-%d %H-%M-%S")
            (folder / f"{stamp}.txt").write_text(source, encoding="utf-8")
            for old in sorted(folder.glob("*.txt"))[:-keep]:
                old.unlink(missing_ok=True)
        except OSError:
            pass

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

    def save(self, source):
        if self.path is None:
            return
        self.path.write_text(source, encoding="utf-8")
        self.backup(source)

    def versions(self):
        if self.path is None:
            return []
        out = []
        for file in sorted(self.backup_folder().glob("*.txt"), reverse=True):
            text = file.read_text(encoding="utf-8")
            out.append({"name": file.name, "time": file.stat().st_mtime, "words": len(re.findall(r"\w+", text))})
        return out

    def read_version(self, name):
        file = self.backup_folder() / Path(name).name
        return file.read_text(encoding="utf-8")

    def remember(self, path):
        hidden = self.hidden()
        if str(path) in hidden:
            HIDDEN.write_text(json.dumps(sorted(hidden - {str(path)})), encoding="utf-8")
        items = [str(path)] + [item for item in self.recent() if item != str(path)]
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

    def create(self):
        ESSAYS.mkdir(parents=True, exist_ok=True)
        number = 1
        while (ESSAYS / f"Untitled essay {number}.txt").exists():
            number += 1
        path = ESSAYS / f"Untitled essay {number}.txt"
        path.write_text(STARTER, encoding="utf-8")
        fresh_versions(path)
        self.open(path)

    def snapshot(self):
        if self.path is None:
            return {"open": False, "recent": self.recent()}
        notice, self.notice = getattr(self, "notice", None), None
        return {
            "open": True,
            "notice": notice,
            "path": str(self.path),
            "name": self.path.name,
            "source": self.path.read_text(encoding="utf-8-sig"),
            "recent": self.recent(),
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
            self.save(source)
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
            if "pdf" in result:
                dpi = max(96, min(300, int(dpi or PNG_DPI)))
                pages, names = self.rasterise(output, version, dpi)
                self.last_pdf = output
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
            return result

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
                return {"error": str(error)}
        if not target.is_file():
            return {"error": "no PDF was produced"}
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
                return self.send_bytes(200, file.read_bytes(), "application/pdf", disposition)
        if route.startswith("/file/") and STATE.path:
            file = (STATE.path.parent / route[len("/file/"):]).resolve()
            if file.is_file() and STATE.path.parent in file.parents:
                kind = mimetypes.guess_type(file.name)[0] or "application/octet-stream"
                return self.send_bytes(200, file.read_bytes(), kind)
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
        if route.startswith("/previews/"):
            file = (STUDIO / "previews" / Path(route).name).resolve()
            if file.is_file() and file.suffix == ".webp":
                return self.send_bytes(200, file.read_bytes(), "image/webp", {"Cache-Control": "max-age=86400"})
        name = "index.html" if route in {"/", ""} else route.lstrip("/")
        file = STUDIO / name
        if file.is_file() and file.parent == STUDIO and file.suffix in {".html", ".css", ".js", ".svg", ".png", ".ico"}:
            kind = mimetypes.guess_type(file.name)[0] or "text/plain"
            return self.send_bytes(200, file.read_bytes(), f"{kind}; charset=utf-8" if kind.startswith("text") or kind.endswith("javascript") else kind)
        self.send_bytes(404, b"not found", "text/plain")

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length) or b"{}")
        route = urlparse(self.path).path
        try:
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
                    STATE.keep = max(0, min(200, int(body["keep"])))
                STATE.save(body["source"])
                return self.send_json({"ok": True})
            if route == "/api/versions":
                return self.send_json({"versions": STATE.versions()})
            if route == "/api/version":
                return self.send_json({"source": STATE.read_version(body["name"])})
            if route == "/api/close":
                STATE.path = None
                return self.send_json(STATE.snapshot())
            if route == "/api/new":
                STATE.create()
                return self.send_json(STATE.snapshot())
            if route == "/api/pick":
                chosen = pick_file()
                if chosen is None:
                    return self.send_json({"headless": True})
                if chosen:
                    STATE.open(chosen)
                return self.send_json(STATE.snapshot())
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
            if route == "/api/copy_export":
                source = STATE.work / "export" / Path(body["name"]).name
                shutil.copyfile(source, body["path"])
                return self.send_json({"ok": True})
            if route == "/api/upload":
                return self.send_json({"path": STATE.upload(body["name"], body["data"])})
            if route == "/api/reveal" and STATE.path:
                target = body.get("path") or str(STATE.path)
                subprocess.Popen(["explorer", "/select,", str(Path(target))])
                return self.send_json({"ok": True})
        except Exception as error:
            return self.send_json({"error": f"{type(error).__name__}: {error}"}, 500)
        self.send_bytes(404, b"not found", "text/plain")


def watch(server):
    while True:
        time.sleep(3)
        if STATE.seen and time.time() - STATE.last_ping > 25:
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
    time.sleep(3.0)
    return process.poll() is None or process.returncode == 0


def launch_window(url):
    try:
        found = setup.browser()
    except RuntimeError:
        return False
    profile = setup.runtime.home().parent / "window"
    flags = [f"--user-data-dir={profile}", "--no-first-run", "--no-default-browser-check"]
    subprocess.Popen(
        [found, f"--app={url}", "--window-size=1280,860", *flags, *SMOOTH],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
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


def create(essay=None, port=0, host="127.0.0.1", watching=True):
    if essay:
        STATE.open(essay)
    server = ThreadingHTTPServer((host, port), Handler)
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
