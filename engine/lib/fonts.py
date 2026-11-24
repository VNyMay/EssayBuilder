"""Fonts.

Any family from the Google Fonts library (2,000+ families, served as npm packages by Fontsource) can be
used with `font: Name`, `heading-font: Name` and `code-font: Name` in the essay's settings, and with a
`font:` option on a `:::text` block. On every build each requested font is checked:

  1. installed on this computer?        use it
  2. already downloaded to ./fonts?     use it
  3. in the Google Fonts library?       download it now with npm (about 2 MB, a few seconds, once)
  4. none of these?                     warn, suggest similar names, fall back to the default font

Fonts that Office ships but Google does not (Cambria, Calibri, Arial, ...) have metric-compatible Google
twins (Caladea, Carlito, Arimo, ...) that are used on computers where the original is missing.
"""
import difflib
import json
import os
import re
import shutil
import struct
import subprocess
import sys
import time
import urllib.request
from functools import lru_cache
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
HOME = HERE / "fonts"
PACKAGES = HOME / "node_modules" / "@fontsource"
CATALOGUE = HOME / "catalogue.json"
API = "https://api.fontsource.org/v1/fonts"
MAX_AGE = 30 * 86400
TWINS = {
    "cambria": "Caladea", "calibri": "Carlito", "arial": "Arimo", "helvetica": "Arimo",
    "times new roman": "Tinos", "times": "Tinos", "courier new": "Cousine", "georgia": "Gelasio",
}
SKIP_CATEGORIES = {"icons", "other"}


def say(message):
    print(f"[fonts] {message}", flush=True)


def font_id(family):
    return re.sub(r"[^a-z0-9]+", "-", family.lower()).strip("-")


def parse_family(value):
    """'Lora, Georgia, serif' -> ('Lora', ['Georgia', 'serif'])."""
    parts = [p.strip().strip("\"'") for p in (value or "").split(",") if p.strip()]
    return (parts[0], parts[1:]) if parts else ("", [])


FONT_FOLDERS = [
    Path("/System/Library/Fonts"),
    Path("/Library/Fonts"),
    Path.home() / "Library" / "Fonts",
    Path("/usr/share/fonts"),
    Path("/usr/local/share/fonts"),
    Path.home() / ".local" / "share" / "fonts",
    Path.home() / ".fonts",
]
STYLE_WORDS = re.compile(r"bold|italic|light|black|thin|medium|heavy|oblique|condensed|semi|extra|ultra|narrow", re.I)


def name_records(handle, offset):
    handle.seek(offset)
    head = handle.read(12)
    if len(head) < 12:
        return []
    count = struct.unpack(">H", head[4:6])[0]
    entries = handle.read(16 * count)
    for index in range(count):
        tag, _, start, length = struct.unpack(">4sIII", entries[16 * index : 16 * index + 16])
        if tag == b"name":
            break
    else:
        return []
    handle.seek(start)
    table = handle.read(length)
    if len(table) < 6:
        return []
    _, total, storage = struct.unpack(">HHH", table[:6])
    records = []
    for index in range(total):
        row = table[6 + 12 * index : 18 + 12 * index]
        if len(row) < 12:
            break
        platform_id, _, language, name_id, size, at = struct.unpack(">HHHHHH", row)
        if name_id not in (1, 16):
            continue
        raw = table[storage + at : storage + at + size]
        if platform_id in (0, 3):
            text, english = raw.decode("utf-16-be", "ignore"), platform_id == 0 or language == 0x409
        elif platform_id == 1:
            text, english = raw.decode("mac_roman", "ignore"), language == 0
        else:
            continue
        records.append((name_id == 16, english, text.strip()))
    return records


def font_families(path):
    try:
        with open(path, "rb") as handle:
            tag = handle.read(4)
            if tag == b"ttcf":
                handle.seek(8)
                count = struct.unpack(">I", handle.read(4))[0]
                offsets = struct.unpack(f">{count}I", handle.read(4 * count))
            else:
                offsets = (0,)
            families = []
            for offset in offsets:
                records = [record for record in name_records(handle, offset) if record[2]]
                if records:
                    families.append(max(records, key=lambda record: (record[1], record[0]))[2])
            return families
    except (OSError, struct.error, ValueError):
        return []


@lru_cache(maxsize=1)
def local_fonts():
    found = {}
    for folder in FONT_FOLDERS:
        if not folder.is_dir():
            continue
        for path in folder.rglob("*"):
            if path.suffix.lower() not in {".ttf", ".otf", ".ttc"}:
                continue
            for family in font_families(path):
                if not family or family.startswith("."):
                    continue
                current = found.get(family.lower())
                rank = (path.suffix.lower() == ".ttc", bool(STYLE_WORDS.search(path.stem)), len(path.stem))
                if current is None or rank < current[2]:
                    found[family.lower()] = (family, path, rank)
    return {key: (family, path) for key, (family, path, _) in found.items()}


def find_system(family):
    """Path of an installed font file with this family name, or None."""
    if sys.platform == "win32":
        import winreg

        key = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
        folder = Path(os.environ.get("WINDIR", r"C:\Windows")) / "Fonts"
        for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
            try:
                fonts = winreg.OpenKey(hive, key)
            except OSError:
                continue
            for i in range(winreg.QueryInfoKey(fonts)[1]):
                name, file, _ = winreg.EnumValue(fonts, i)
                if re.split(r" \(| & ", name)[0].lower() == family.lower():
                    return Path(file) if Path(file).is_absolute() else folder / file
    found = local_fonts().get(family.lower())
    return found[1] if found else None


def system_families():
    names = set()
    if sys.platform == "win32":
        import winreg

        key = r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"
        for hive in [winreg.HKEY_LOCAL_MACHINE, winreg.HKEY_CURRENT_USER]:
            try:
                fonts = winreg.OpenKey(hive, key)
            except OSError:
                continue
            for i in range(winreg.QueryInfoKey(fonts)[1]):
                name = re.sub(r"\s*\(.*\)$", "", winreg.EnumValue(fonts, i)[0])
                for part in name.split(" & "):
                    family = re.sub(
                        r"\s+(Bold|Italic|Light|Semibold|SemiBold|Semilight|SemiLight|Black|Regular|Medium|Thin|ExtraLight|ExtraBold|Condensed|Oblique|Heavy)\b.*$",
                        "",
                        part.strip(),
                    )
                    if family and not family.startswith("@"):
                        names.add(family)
    else:
        names.update(family for family, _ in local_fonts().values())
    return sorted(names, key=str.lower)


def catalogue():
    """{id: {family, category, weights, styles, subsets}} for the whole library (cached for 30 days)."""
    try:
        if CATALOGUE.is_file() and time.time() - CATALOGUE.stat().st_mtime < MAX_AGE:
            return json.loads(CATALOGUE.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        pass
    try:
        request = urllib.request.Request(API, headers={"User-Agent": "EssayBuilder"})
        data = json.load(urllib.request.urlopen(request, timeout=30))
        slim = {
            f["id"]: {k: f.get(k) for k in ("family", "category", "weights", "styles", "subsets")}
            for f in data
        }
        HOME.mkdir(parents=True, exist_ok=True)
        CATALOGUE.write_text(json.dumps(slim), encoding="utf-8")
        return slim
    except Exception:
        try:
            return json.loads(CATALOGUE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}


def downloaded(ident):
    return (PACKAGES / ident / "package.json").is_file()


def install(ident):
    npm = shutil.which("npm")
    if not npm:
        return False
    HOME.mkdir(parents=True, exist_ok=True)
    if not (HOME / "package.json").is_file():
        (HOME / "package.json").write_text('{"private": true}\n', encoding="utf-8")
    try:
        subprocess.run(
            [npm, "install", f"@fontsource/{ident}", "--prefix", str(HOME), "--no-audit", "--no-fund", "--loglevel=error"],
            check=True, capture_output=True, timeout=300,
        )
    except (subprocess.SubprocessError, OSError):
        return False
    return downloaded(ident)


def faces(ident, as_name):
    """@font-face rules (regular, bold and their italics) for a downloaded font, named `as_name`."""
    base = PACKAGES / ident
    weights = sorted(int(m.group(1)) for p in base.glob("*.css") if (m := re.fullmatch(r"(\d+)\.css", p.name)))
    if not weights:
        return ""
    regular = min(weights, key=lambda w: (abs(w - 400), w))
    heavy = [w for w in weights if w >= 600]
    bold = 700 if 700 in weights else (min(heavy, key=lambda w: abs(w - 700)) if heavy else max(weights))
    css = []
    for weight in sorted({regular, bold}):
        for style in ("", "-italic"):
            path = base / f"{weight}{style}.css"
            if path.is_file():
                css.append(path.read_text(encoding="utf-8"))
    text = "\n".join(css)
    text = re.sub(r"url\(\./files/([^)]+)\)", lambda m: f'url("{(base / "files" / m.group(1)).as_uri()}")', text)
    text = re.sub(r"font-family:\s*'[^']*'", f"font-family: '{as_name}'", text)
    return text.replace("font-display: swap", "font-display: block")


def similar(name):
    families = {meta["family"].lower(): meta["family"] for meta in catalogue().values()
                if meta.get("family") and meta.get("category") not in SKIP_CATEGORIES}
    return [families[m] for m in difflib.get_close_matches(name.lower(), list(families), n=3, cutoff=0.6)]


def resolve(name, warn):
    """@font-face CSS that makes `name` available ('' when it is installed or cannot be found)."""
    if find_system(name):
        return ""
    twin = TWINS.get(name.lower())
    ident = font_id(twin or name)
    if not downloaded(ident):
        meta = catalogue().get(ident)
        if meta is None and not CATALOGUE.is_file():
            warn(f"font '{name}' could not be looked up (no internet?); using the default font")
            return ""
        if meta is None:
            hint = similar(name)
            warn(f"font '{name}' is not installed and is not in the Google Fonts library"
                 + (f" (did you mean {', '.join(repr(h) for h in hint)}?)" if hint else "")
                 + "; using the default font. Run: python build.py --fonts <word> to search")
            return ""
        say(f"downloading '{meta['family']}' (first use only) ...")
        if not install(ident):
            warn(f"font '{name}' could not be downloaded (internet? Node.js?); using the default font")
            return ""
    return faces(ident, name)


def prepare(families, warn):
    """CSS for every requested family (a list of names, duplicates and blanks ignored)."""
    seen, css = set(), []
    for family in families:
        key = family.strip().lower()
        if key and key not in seen:
            seen.add(key)
            css.append(resolve(family.strip(), warn))
    return "\n".join(c for c in css if c)


def search(query=""):
    """Print the library, filtered by a word or a category (serif, sans-serif, monospace, handwriting, display)."""
    items = catalogue()
    if not items:
        sys.exit("The font list could not be downloaded (internet?).")
    query = query.lower().strip()
    rows = [
        (meta["family"], meta["category"], meta["weights"])
        for meta in items.values()
        if meta.get("category") not in SKIP_CATEGORIES
        and (not query or query in meta["family"].lower() or query == (meta.get("category") or ""))
    ]
    rows.sort(key=lambda r: r[0].lower())
    for family, category, weights in rows[:60]:
        print(f"{family:34} {category:12} {','.join(str(w) for w in (weights or [])[:9])}")
    more = f"  (showing 60 of {len(rows)}; add a word to narrow it)" if len(rows) > 60 else ""
    print(f"\n{len(rows)} font(s) found{more}")
    print('Use one with:  font: <Family name>   (also heading-font: and code-font:). It downloads itself on first use.')
