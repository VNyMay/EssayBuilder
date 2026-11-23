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
import subprocess
import sys
import time
import urllib.request
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
    wanted = family.lower().replace(" ", "")
    for folder in [Path("/Library/Fonts"), Path.home() / "Library" / "Fonts", Path("/usr/share/fonts")]:
        for path in folder.rglob("*") if folder.is_dir() else []:
            if path.suffix.lower() in {".ttf", ".ttc", ".otf"} and path.stem.lower().replace(" ", "") == wanted:
                return path
    return None


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
        for folder in [Path("/Library/Fonts"), Path.home() / "Library" / "Fonts", Path("/usr/share/fonts")]:
            for path in folder.rglob("*") if folder.is_dir() else []:
                if path.suffix.lower() in {".ttf", ".otf"}:
                    names.add(re.split(r"[-_]", path.stem)[0])
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
