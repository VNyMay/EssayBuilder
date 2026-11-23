import argparse
import base64
import html
import json
import re
import shutil
import subprocess
import threading
import sys
import tempfile
from datetime import date
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from lib import fonts, setup  # noqa: E402  (stdlib only, so it can install the rest first)
from lib.setup import browser, browser_flags  # noqa: E402

MODULES = HERE / "node_modules"
KATEX_FONT = MODULES / "katex" / "dist" / "fonts" / "KaTeX_Main-Regular.ttf"
MONO = MODULES / "@fontsource" / "jetbrains-mono" / "files"
RELATION = re.compile(r"=|\\(?:lt|gt|geq|leq|neq|approx|in|to)\b")
PAPERS = {"a4": (210, 297), "a5": (148, 210), "letter": (215.9, 279.4), "legal": (215.9, 355.6)}
BAND = re.compile(r'<div class="fnb" data-b="(\d+)" data-n="([\d ]+)"></div>')
NOTE_PAGES = re.compile(r'<section class="fnm">[\s\S]*?</section>')
NOTE_KEY = re.compile(r"FN\d+")
BAND_BLUE, NOTE_BLUE = 254 / 255, 253 / 255
BAND_GAP = 6.0
OFF = {"no", "off", "false"}
ROMAN = [
    (1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"),
    (50, "l"), (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"),
]


def meta(src, name, default):
    match = re.search(rf'<meta name="{name}" content="([^"]*)"', src)
    return html.unescape(match.group(1)) if match else default


def mono_fonts():
    faces = []

    for weight, style in [(400, "normal"), (400, "italic"), (700, "normal")]:
        data = (MONO / f"jetbrains-mono-latin-{weight}-{style}.woff2").read_bytes()
        faces.append(
            "@font-face{font-family:'JetBrains Mono';"
            f"font-style:{style};font-weight:{weight};"
            f"src:url(data:font/woff2;base64,{base64.b64encode(data).decode()})"
            " format('woff2');}"
        )

    return "".join(faces)


def legacy_code(src, folder):
    from lib import code

    def card(match):
        path = folder / match.group(1).strip()
        parts, language = code.highlight(path.read_text(encoding="utf-8"), path.name)
        rows = [(n, p, False) for n, p in enumerate(parts, 1)]
        return code.card(path.name, f"{language} · {len(parts)} lines", rows)

    def run(match):
        label, *commands = match.group(1).strip("\n").split("\n")
        rows = code.terminal_rows([c.strip() for c in commands if c.strip()])
        return code.card("Terminal", label.strip(), rows, " term")

    src = re.sub(r"<!--@CODE ([\s\S]*?)@-->", card, src)
    return re.sub(r"<!--@RUN ([\s\S]*?)@-->", run, src)


def word_count(src):
    notes = NOTE_PAGES.search(src)
    if notes:
        src = src.replace(notes.group(0), "")
    words = body_words(src)
    return words + (body_words(notes.group(0)) if notes else 0)


def body_words(src):
    if "<!--WC-START-->" in src:
        body = src.split("<!--WC-START-->")[1].split("<!--WC-END-->")[0]
    else:
        body = src.split("<body", 1)[-1]
    for pattern in [
        r"<(table|figure|nav|style|script|svg)\b[\s\S]*?</\1>",
        r'<(div|p) class="(?:cap|src)[^"]*">[\s\S]*?</\1>',
        r'<span class="num">[^<]*</span>',
        r'<div class="eq[\s\S]*?</div>',
        r"\$\$[\s\S]+?\$\$",
    ]:
        body = re.sub(pattern, " ", body)
    body = re.sub(
        r"\$([^$]+?)\$",
        lambda m: " " if RELATION.search(m.group(1)) else " X ",
        body,
    )
    for pattern in [
        r"<span class=\"mk\">[^<]*</span>",
        r"<!--[\s\S]*?-->",
        r"\((?:[A-Za-z][^()]*?,\s*(?:\d{4}|n\.d\.)(?:;\s*)?)+\)",
        r"\([A-Z][\w.&' -]*? \d+(?:[–-]\d+)?\)",
        r"<[^>]+>",
    ]:
        body = re.sub(pattern, " ", body)
    return len(re.findall(r"[A-Za-z0-9][\w’'.\-]*", html.unescape(body)))


def settings_css(cfg, font):
    def number(key, default):
        try:
            return float(cfg.get(key, default))
        except ValueError:
            return float(default)

    paper = PAPERS.get(cfg.get("paper", "a4").lower(), PAPERS["a4"])
    margin = number("margins", 25)
    # The design is drawn for 12 pt text and scales as a whole with `font-size` (11 by default), so headings,
    # captions, tables, code and spacing keep their proportions. Sizes given explicitly (caption-size, ...) are final pt.
    zoom = max(0.5, min(2.0, number("font-size", 11) / 12))

    def size(key, base):
        value = cfg.get(key, "").strip()
        try:
            return float(value) / zoom if value else base
        except ValueError:
            return base

    generic = {"serif", "sans-serif", "monospace", "cursive", "fantasy", "system-ui"}

    def stack(value):
        name, rest = fonts.parse_family(value)
        return ",".join(n if n in generic else f'"{n}"' for n in [name, *rest] if n)

    extra = ""
    if cfg.get("heading-font", "").strip():
        extra += f'--hfont:{stack(cfg["heading-font"])};'
    if cfg.get("code-font", "").strip():
        extra += f'--cfont:{stack(cfg["code-font"])};'
    rules = [
        f'@page{{size:{paper[0]}mm {paper[1]}mm;margin:{margin}mm}}',
        f'@page land{{size:{paper[1]}mm {paper[0]}mm;margin:{margin}mm}}',
        f':root{{--font:{stack(font)};{extra}--fs:12pt;--lh:{number("line-spacing", 1.8)};'
        f'--cap:{size("caption-size", 10.5)}pt;--code:{size("code-size", 8.2)}pt;--tbl:{size("table-size", 10)}pt;'
        f'--accent:{cfg.get("accent", "#1f4e79")};--body-h:{(paper[1] - 2 * margin) / zoom}mm;--m:{margin}mm;--page-w:{paper[0]}mm;--page-h:{paper[1]}mm}}',
    ]
    if abs(zoom - 1) > 0.001:
        rules.append(f"body{{zoom:{zoom:.4f}}}")
        rules.append(f".cover.cv{{zoom:{1 / zoom:.4f}}}")
    if cfg.get("justify", "yes").lower() in {"no", "off", "false"}:
        rules.append("p,li{text-align:left}")
    style = cfg.get("heading-style", "rule").lower()
    if style == "underline":
        rules.append(
            "h1,h2{font-weight:400;border-bottom:0;padding-bottom:0;text-decoration:underline;"
            "text-decoration-thickness:0.7pt;text-underline-offset:3.5pt}"
            f"h1{{font-size:{17 / zoom:.2f}pt;margin-bottom:14pt}}h2{{font-size:{14 / zoom:.2f}pt}}"
        )
    elif style == "plain":
        rules.append(f"h1,h2{{border-bottom:0;padding-bottom:0}}h1{{font-size:{17 / zoom:.2f}pt;margin-bottom:12pt}}")
    elif style == "accent":  # bold headings in the accent colour, no rules: the clean modern look
        rules.append(
            "h1,h2,h3{color:var(--accent)}"
            f"h1{{border-bottom:0;padding-bottom:0;margin:20pt 0 6pt;font-size:{15 / zoom:.2f}pt;line-height:1.3}}"
            f"h2{{margin:14pt 0 4pt;font-size:{12.5 / zoom:.2f}pt}}h3{{margin:10pt 0 2pt}}"
            "section.sec.flow{margin-top:0}"
        )
    if cfg.get("heading-size", "").strip():
        heading = number("heading-size", 15)
        rules.append(f"h1{{font-size:{heading / zoom:.2f}pt}}h2{{font-size:{heading * 0.85 / zoom:.2f}pt}}")
    if cfg.get("caption-style", "bold").lower() == "italic":  # whole caption italic, like a Word document
        rules.append(".cap{font-style:italic}.cap .lab{font-weight:400}")
    indent = cfg.get("paragraph-indent", "").strip()
    if indent and indent.lower() not in {"no", "none", "0"}:
        rules.append(f"section.sec>p{{text-indent:{indent}}}")
    if cfg.get("paragraph-spacing", "").strip():
        rules.append(f"p{{margin-bottom:{number('paragraph-spacing', 10)}pt}}")
    return "\n".join(rules)


def prepare(src, cfg, folder, font_css=""):
    latex = meta(src, "numbers", "text") == "latex"
    words = word_count(src)
    count = f"${words:,}$".replace(",", "{,}") if latex else f"{words:,}"

    src = src.replace("{{WORDS}}", count)
    src = legacy_code(src, folder)

    css = (HERE / "essay.css").read_text(encoding="utf-8")
    for extra in sorted((HERE / "css").glob("*.css")):
        css += "\n" + extra.read_text(encoding="utf-8")
    font = cfg.get("font") or meta(src, "font", "Cambria")
    style = f"{css}\n{settings_css(cfg, font)}\n{mono_fonts()}\n{font_css}"
    src = src.replace("</head>", f"<style>\n{style}\n</style>\n</head>", 1)
    return src, words, latex, fonts.parse_family(font)[0]


class Worker:
    def __init__(self):
        self.process = None
        self.lock = threading.Lock()

    def ask(self, args):
        with self.lock:
            if self.process is None or self.process.poll() is not None:
                self.process = subprocess.Popen(
                    ["node", str(HERE / "renderd.js")],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.DEVNULL,
                    text=True,
                    encoding="utf-8",
                    cwd=str(HERE),
                )
            self.process.stdin.write(json.dumps([str(a) for a in args]) + "\n")
            self.process.stdin.flush()
            line = self.process.stdout.readline()
            if not line:
                self.process = None
                raise RuntimeError("render worker stopped")
            reply = json.loads(line)
            if not reply["ok"]:
                raise RuntimeError(reply["error"])
            return reply["text"]


WORKER = Worker()


def render(source, target, mode, pages):
    try:
        WORKER.ask((source, target, mode, pages))
    except Exception:
        subprocess.run(
            ["node", HERE / "render.js", source, target, mode, pages],
            check=True,
        )


def print_pdf(page, pdf):
    try:
        from lib import cdp

        cdp.print_pdf(page, pdf)
    except Exception:
        print_pdf_cli(page, pdf)


def print_pdf_cli(page, pdf):
    profile = tempfile.mkdtemp()
    subprocess.run(
        [
            browser(),
            *browser_flags(),
            "--no-pdf-header-footer",
            "--generate-pdf-document-outline",
            f"--user-data-dir={profile}",
            f"--print-to-pdf={pdf}",
            page.as_uri(),
        ],
        check=True,
        capture_output=True,
    )
    shutil.rmtree(profile, ignore_errors=True)


MARKS = {}
SCANNED = {}


def page_digest(page):
    import hashlib

    return hashlib.sha1(page.read_contents()).hexdigest() + repr(tuple(page.rect))


def page_marks(page):
    digest = page_digest(page)
    if digest not in MARKS:
        if len(MARKS) > 400:
            MARKS.clear()
        MARKS[digest] = re.findall(r"@@([\w-]+)@@", page.get_text())
    return MARKS[digest]


def find_pages(pdf, notes=False):
    import pymupdf

    pages = {}
    with pymupdf.open(pdf) as doc:
        for i, page in enumerate(doc, 1):
            for key in page_marks(page):
                if notes or not NOTE_KEY.fullmatch(key):
                    pages.setdefault(key, i)
    return pages


def zoom_of(cfg):
    try:
        size = float(cfg.get("font-size", 11))
    except ValueError:
        size = 11.0
    return max(0.5, min(2.0, size / 12))


def margin_of(cfg):
    try:
        return float(cfg.get("margins", 25)) * 72 / 25.4
    except ValueError:
        return 25 * 72 / 25.4


def marked_rects(doc, blue):
    found = []
    for number, page in enumerate(doc):
        for drawing in page.get_drawings():
            fill = drawing.get("fill")
            if fill and len(fill) == 3 and abs(fill[2] - blue) < 0.0015:
                if fill[0] > 0.995 and fill[1] > 0.995:
                    found.append((number, drawing["rect"]))
    return sorted(found, key=lambda item: (item[0], item[1].y0))


def fill_bands(text, sizes, keep, zoom):
    def band(match):
        number = int(match.group(1))
        serials = [int(n) for n in match.group(2).split()]
        height = sum(sizes.get(n, 0) for n in serials)
        style = f' style="height:{(height + BAND_GAP) / zoom:.2f}pt"' if height else ""
        flag = " data-keep" if number in keep else ""
        return f'<div class="fnb" data-b="{number}" data-n="{match.group(2)}"{style}{flag}></div>'

    return BAND.sub(band, text)


def stray_bands(raw, bands):
    import pymupdf

    with pymupdf.open(raw) as doc:
        spots = marked_rects(doc, BAND_BLUE)
    pages = find_pages(raw, True)
    late = set()
    for (page, _), (number, serials) in zip(spots, bands):
        if any(pages.get(f"FN{n}", page + 1) != page + 1 for n in serials):
            late.add(number)
    return late


def band_shift(moves, y):
    for top, bottom, up in moves:
        if top <= y <= bottom:
            return up
    return 0


def rebuild_page(doc, src, number, cuts, notes, margin):
    import pymupdf

    page = src[number]
    width, height = page.rect.width, page.rect.height
    fresh = doc.new_page(width=width, height=height)
    moves, position, up = [], 0.0, 0.0
    for rect, _ in cuts:
        moves.append((position, rect.y0, up))
        up += rect.height
        position = rect.y1
    moves.append((position, height, up))
    for top, bottom, lift in moves:
        if bottom - top > 0.5:
            target = pymupdf.Rect(0, top - lift, width, bottom - lift)
            fresh.show_pdf_page(target, src, number, clip=pymupdf.Rect(0, top, width, bottom))
    cursor = height - margin - up + BAND_GAP
    left = notes[0][1].x0
    rule = cursor - BAND_GAP / 2
    fresh.draw_line((left, rule), (left + 0.28 * (width - 2 * left), rule), color=(0.35, 0.35, 0.35), width=0.5)
    for _, serials in cuts:
        for serial in serials:
            spot, rect = notes[serial - 1]
            target = pymupdf.Rect(rect.x0, cursor, rect.x1, cursor + rect.height)
            fresh.show_pdf_page(target, src, spot, clip=rect)
            cursor += rect.height
    for link in page.get_links():
        box = link["from"]
        lift = band_shift(moves, (box.y0 + box.y1) / 2)
        link["from"] = pymupdf.Rect(box.x0, box.y0 - lift, box.x1, box.y1 - lift)
        link.pop("xref", None)
        link.pop("id", None)
        try:
            fresh.insert_link(link)
        except Exception:
            continue


def place_footnotes(raw, output, cfg, bands):
    import pymupdf

    with pymupdf.open(raw) as src:
        notes = marked_rects(src, NOTE_BLUE)
        spots = marked_rects(src, BAND_BLUE)
        if not notes or len(spots) != len(bands):
            print("warning: footnotes could not be placed at the page bottoms")
            return raw
        start = notes[0][0]
        grouped = {}
        for (page, rect), (_, serials) in zip(spots, bands):
            grouped.setdefault(page, []).append((rect, serials))
        with pymupdf.open() as doc:
            for number in range(start):
                if number in grouped:
                    rebuild_page(doc, src, number, grouped[number], notes, margin_of(cfg))
                else:
                    doc.insert_pdf(src, from_page=number, to_page=number)
            try:
                doc.set_toc(src.get_toc(simple=False))
            except Exception:
                pass
            doc.save(output)
    return output


PAGE_MEMO = {}


def paginate(src, work, page, raw, cfg, probe=True, memo=None):
    expanded, pages_file = work / "essay.html", work / "pages.json"
    bands = [(int(a), [int(n) for n in b.split()]) for a, b in BAND.findall(src)]
    text, pages = src, {}

    def probe_pass(body):
        expanded.write_text(body, encoding="utf-8")
        render(expanded, page, "probe", pages_file)
        print_pdf(page, raw)

    if bands:
        import pymupdf

        sizes, keep = {}, set()
        probe_pass(fill_bands(src, sizes, keep, 1))
        with pymupdf.open(raw) as doc:
            sizes = {n: r.height for n, (_, r) in enumerate(marked_rects(doc, NOTE_BLUE), 1)}
        for _ in range(6):
            text = fill_bands(src, sizes, keep, zoom_of(cfg))
            probe_pass(text)
            late = stray_bands(raw, bands) - keep
            if not late:
                break
            keep |= late
        else:
            print("warning: a footnote may sit on the page before its mark")
        pages = find_pages(raw)
    elif probe and memo and memo in PAGE_MEMO:
        pages = PAGE_MEMO[memo]
        for _ in range(3):
            pages_file.write_text(json.dumps(pages))
            expanded.write_text(src, encoding="utf-8")
            render(expanded, page, "both", pages_file)
            print_pdf(page, raw)
            found = find_pages(raw)
            if found == pages:
                break
            pages = found
        PAGE_MEMO[memo] = pages
        return pages, Path(raw)
    elif probe:
        probe_pass(src)
        pages = find_pages(raw)
        if memo:
            PAGE_MEMO[memo] = pages
    pages_file.write_text(json.dumps(pages))
    expanded.write_text(text, encoding="utf-8")
    render(expanded, page, "final", pages_file)
    print_pdf(page, raw)
    if bands:
        raw = place_footnotes(raw, work / "placed.pdf", cfg, bands)
    return pages, Path(raw)


def section_list(src, pages):
    found = []
    for match in re.finditer(r'<h1 id="([^"]+)"[^>]*>([\s\S]*?)</h1>', src):
        if match.group(1) in pages and match.group(1) != "contents":
            text = re.sub(r'<span class="num">[^<]*</span>|<[^>]+>', "", match.group(2))
            found.append((pages[match.group(1)] - 1, html.unescape(text).strip()))
    return sorted(found)


def to_roman(n):
    out = ""
    for value, letters in ROMAN:
        while n >= value:
            out += letters
            n -= value
    return out


def to_letters(n):
    out = ""
    while n > 0:
        n, rest = divmod(n - 1, 26)
        out = chr(97 + rest) + out
    return out


STYLES = {"arabic": ("D", str), "roman": ("r", to_roman), "letter": ("a", to_letters)}


def page_format(value):
    text = (value or "").strip() or "arabic"
    if "{n}" in text:
        return (text, *STYLES["arabic"])
    style, convert = STYLES.get(text.lower(), STYLES["arabic"])
    if text.lower() in {"roman", "letter"} and text != text.lower():
        return "{n}", style.upper(), lambda n: convert(n).upper()
    return "{n}", style, convert


def fill_tokens(text, values):
    return re.sub(r"\{(\w+)\}", lambda m: values.get(m.group(1), m.group(0)), text)


def parts_of(value):
    parts = [part.strip() for part in value.split("|")]
    if len(parts) == 1:
        return ["", parts[0], ""]
    if len(parts) == 2:
        return [parts[0], "", parts[1]]
    return parts[:3]


def stamp(page, text, side, y, margin, font, font_file, size, color):
    if not text:
        return
    width = font.text_length(text, fontsize=size)
    edge = {"left": margin, "right": page.rect.width - margin - width}
    page.insert_text(
        (edge.get(side, (page.rect.width - width) / 2), y),
        text,
        fontname="PageNo",
        fontfile=str(font_file),
        fontsize=size,
        color=color,
    )


def watermark(page, text, font, font_file):
    import math

    import pymupdf

    width, height = page.rect.width, page.rect.height
    unit = max(font.text_length(text, fontsize=1), 0.1)
    size = min(0.62 * math.hypot(width, height) / unit, 150)
    length = unit * size
    centre = pymupdf.Point(width / 2, height / 2)
    page.insert_text(
        pymupdf.Point(centre.x - length / 2, centre.y + size * 0.3),
        text,
        fontname="PageNo",
        fontfile=str(font_file),
        fontsize=size,
        color=(0.5, 0.5, 0.5),
        fill_opacity=0.12,
        morph=(centre, pymupdf.Matrix(-45)),
    )


def date_text(cfg):
    value = cfg.get("date", "").strip()
    if value and value.lower() != "today":
        return value
    now = date.today()
    return f"{now.day} {now.strftime('%B %Y')}"


def number_pages(
    pdf, output, first, font_file, title, numbered=True, continuous=False, cover=True,
    cfg=None, sections=(), fast=False,
):
    import pymupdf

    cfg = cfg or {}
    font = pymupdf.Font(fontfile=str(font_file))
    pattern, style, convert = page_format(cfg.get("page-number-format"))
    header, footer = cfg.get("header", "").strip(), cfg.get("footer", "").strip()
    margin, grey = margin_of(cfg), (0.38, 0.38, 0.38)
    with pymupdf.open(pdf) as doc:
        total = len(doc)
        begin = (1 if cover else 0) if continuous else first
        base = 0 if continuous else first
        values = {
            "title": title,
            "author": cfg.get("author", "").strip(),
            "date": date_text(cfg),
            "pages": convert(max(total - base, 1)),
        }
        for i in range(begin, total):
            page = doc[i]
            n = i - base + 1
            values["page"] = convert(n)
            values["section"] = next((t for p, t in reversed(sections) if p <= i), "")
            for text, kind, y in (
                (header, "header", min(40, margin * 0.55)),
                (footer, "footer", page.rect.height - 34),
            ):
                skip = i == begin and cfg.get(f"{kind}-on-first", "yes").lower() in OFF
                if text and not skip:
                    for side, part in zip(("left", "centre", "right"), parts_of(text)):
                        shown = fill_tokens(part, values)
                        stamp(page, shown, side, y, margin, font, font_file, 9.5, grey)
            if numbered and not footer:
                shown = fill_tokens(pattern, {"n": convert(n), "pages": values["pages"]})
                stamp(page, shown, "centre", page.rect.height - 34, margin, font, font_file, 10.5, (0.27, 0.27, 0.27))
        if cfg.get("watermark", "").strip():
            for page in doc:
                watermark(page, cfg["watermark"].strip(), font, font_file)
        labels = [{"startpage": base, "prefix": "", "style": style, "firstpagenum": 1}]
        if first and not continuous:
            labels.insert(0, {"startpage": 0, "prefix": "", "style": "r", "firstpagenum": 1})
        doc.set_page_labels(labels)
        doc.set_metadata({"title": title, "author": "", "creator": "", "producer": ""})
        if fast:
            doc.save(output)
            return len(doc)
        doc.subset_fonts()
        doc.save(output, garbage=3, deflate=True)
        return len(doc)


def compile_essay(essay):
    from lib.parse import compile_text

    compiler, head, body, title, report = compile_text(essay)
    wanted = [compiler.cfg.get("font", ""), compiler.cfg.get("heading-font", ""), compiler.cfg.get("code-font", "")]
    wanted = [fonts.parse_family(f)[0] for f in wanted] + sorted(compiler.text_fonts)
    font_css = fonts.prepare(wanted, lambda message: report.warn(essay.name, message))
    page = f'<!doctype html>\n<html lang="en">\n{head}\n<body>\n{body}\n</body>\n</html>\n'
    page = compiler.run_jobs(page, fonts.parse_family(compiler.cfg["font"])[0], font_css)
    return compiler.cfg, page, title, report, font_css


def embed_project(output, essay):
    import io
    import zipfile

    import pymupdf

    from lib import util

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as bundle:
        bundle.write(essay, essay.name)
        for used in sorted(util.USED):
            try:
                relative = used.relative_to(essay.parent)
            except ValueError:
                continue
            if used != essay and used.suffix.lower() != ".pdf" and used.stat().st_size < 60_000_000:
                bundle.write(used, relative.as_posix())
    with pymupdf.open(output) as doc:
        doc.embfile_add("essay-project.zip", buffer.getvalue(), filename="essay-project.zip", desc="Essay Builder project")
        doc.saveIncr()


def build(essay, output=None, check=False, keep=False):
    essay = Path(essay).resolve()
    if not essay.is_file():
        sys.exit(f"File not found: {essay}")
    from lib import util

    util.USED.clear()

    if essay.suffix.lower() in {".html", ".htm"}:
        cfg, source, report = {}, essay.read_text(encoding="utf-8"), None
        font_css = fonts.prepare([meta(source, "font", "Cambria")], print)
        match = re.search(r"<title>([\s\S]*?)</title>", source)
        title = html.unescape(match.group(1).strip()) if match else essay.stem
    else:
        cfg, source, title, report, font_css = compile_essay(essay)
        report.show()
        if report.errors:
            sys.exit(f"\n{len(report.errors)} error(s) in {essay.name}. Fix them and run again; nothing was built.")

    src, words, latex, font = prepare(source, cfg, essay.parent, font_css)
    limit = cfg.get("word-limit")
    if limit and limit.replace(".", "").isdigit() and words > float(limit):
        print(f"warning: {words} words is over the limit of {limit}")
    if check:
        print(f"OK: {essay.name} has no errors ({words} words counted, {len(report.warnings) if report else 0} warning(s))")
        return

    if output is None:
        output = essay.with_name(re.sub(r"[^\w-]+", "_", title).strip("_") + ".pdf")
    output = Path(output).resolve()

    work = Path(tempfile.mkdtemp())
    page = essay.with_name(f".{essay.stem}.print.html")
    raw = work / "raw.pdf"

    try:
        pages, raw = paginate(src, work, page, raw, cfg)
        if keep:
            shutil.copy(page, essay.with_name(f"{essay.stem}.built.html"))
        body = [number for key, number in pages.items() if key != "contents" and not key.startswith(("fig-", "tbl-"))]
        first = min(body) - 1 if body else 0
        font_file = KATEX_FONT if latex else (fonts.find_system(font) or KATEX_FONT)
        numbered = cfg.get("page-numbers", "yes").lower() not in OFF
        continuous = cfg.get("page-numbering", "body").lower() == "continuous"
        has_cover = cfg.get("cover", "yes").lower() not in OFF
        count = number_pages(
            raw, output, first, font_file, title, numbered, continuous, has_cover,
            cfg, section_list(src, pages),
        )
        if essay.suffix.lower() not in {".html", ".htm"} and cfg.get("embed-project", "yes").lower() not in OFF:
            embed_project(output, essay)
    finally:
        page.unlink(missing_ok=True)
        shutil.rmtree(work, ignore_errors=True)

    print(f"{count} pages, {words} words -> {output}")


def scan_page(page):
    digest = page_digest(page)
    if digest in SCANNED:
        return SCANNED[digest]
    marks, spots, panels = [], [], []
    for x0, y0, x1, y1, word, *_ in page.get_text("words"):
        match = re.fullmatch(r"@@B(\d+)@@", word)
        if match:
            marks.append((int(match.group(1)), y0))
        elif y0 < page.rect.height - 48:
            spots.append((y0, y1))
    for info in page.get_image_info():
        spots.append((info["bbox"][1], info["bbox"][3]))
    for drawing in page.get_drawings():
        rect = drawing["rect"]
        if rect.height < page.rect.height * 0.7 and rect.y0 < page.rect.height - 48:
            spots.append((rect.y0, rect.y1))
            if drawing.get("fill") is not None and rect.height >= 6 and rect.width > 30:
                panels.append((rect.y0, rect.y1))
    if len(SCANNED) > 400:
        SCANNED.clear()
    SCANNED[digest] = (marks, spots, panels)
    return SCANNED[digest]


def studio_regions(pdf):
    import pymupdf

    found = []
    boxes = []
    panels = []
    with pymupdf.open(pdf) as doc:
        sizes = [(page.rect.width, page.rect.height) for page in doc]
        for number, page in enumerate(doc):
            marks, spots, backs = scan_page(page)
            found.extend((ident, number, y0) for ident, y0 in marks)
            boxes.append(spots)
            panels.append(backs)
    found.sort(key=lambda item: (item[1], item[2]))

    def top_of(number, y0):
        tops = [p[0] for p in panels[number] if p[0] <= y0 + 1 and p[1] > y0 + 1]
        return min([y0, *tops])

    regions = {}
    for index, (ident, number, text_top) in enumerate(found):
        y0 = top_of(number, text_top)
        spans = []
        following = found[index + 1] if index + 1 < len(found) else None
        next_top = top_of(following[1], following[2]) if following else None
        if following is None:
            spans.append({"page": number, "y0": y0, "y1": sizes[number][1]})
        elif following[1] == number:
            spans.append({"page": number, "y0": y0, "y1": next_top})
        else:
            spans.append({"page": number, "y0": y0, "y1": sizes[number][1]})
            for between in range(number + 1, following[1]):
                spans.append({"page": between, "y0": 0, "y1": sizes[between][1]})
            spans.append({"page": following[1], "y0": 0, "y1": next_top})
        spans[0]["t"] = text_top
        for position, span in enumerate(spans):
            reaches_bottom = span["y1"] >= sizes[span["page"]][1] - 1
            starts_top = span["y0"] == 0
            if not (reaches_bottom or starts_top):
                continue
            inside = [b for b in boxes[span["page"]] if b[1] >= span["y0"] - 1 and b[0] <= span["y1"] + 1]
            if not inside:
                span["y1"] = span["y0"] if starts_top else span["y0"] + 8
                continue
            if starts_top:
                span["y0"] = max(0, min(b[0] for b in inside) - 3)
            if reaches_bottom:
                span["y1"] = min(span["y1"], max(b[1] for b in inside) + 3)
        for span in spans:
            if span["y1"] < sizes[span["page"]][1] - 1 and span["y1"] - span["y0"] > 4:
                own = [b for b in boxes[span["page"]] if b[0] >= span["y0"] - 1 and b[0] < span["y1"] - 0.5]
                if own:
                    span["y1"] = min(span["y1"], max(b[1] for b in own) + 2)
        regions[ident] = [span for span in spans if span["y1"] - span["y0"] > 4]
    return sizes, regions


def source_labels(compiler):
    labels = {}
    for key, entry in getattr(compiler, "bib_entries", {}).items():
        who = entry.authors[0] if entry.authors else None
        name = (who.org or who.family) if who else entry.get("title")[:30]
        labels[key] = f"{name} {entry.year}".strip()
    return labels


def studio_build(essay, source, output):
    from lib.parse import compile_text

    essay = Path(essay).resolve()
    compiler, head, body, title, report = compile_text(essay, source, True)
    wanted = [compiler.cfg.get("font", ""), compiler.cfg.get("heading-font", ""), compiler.cfg.get("code-font", "")]
    wanted = [fonts.parse_family(f)[0] for f in wanted] + sorted(compiler.text_fonts)
    font_css = fonts.prepare(wanted, lambda message: report.warn(essay.name, message))
    page = f'<!doctype html>\n<html lang="en">\n{head}\n<body>\n{body}\n</body>\n</html>\n'
    page = compiler.run_jobs(page, fonts.parse_family(compiler.cfg["font"])[0], font_css)
    result = {
        "errors": list(report.errors),
        "warnings": list(report.warnings),
        "ranges": compiler.ranges,
        "front": compiler.front,
        "title": title,
        "labels": {f"{kind}:{ident}": value[0] for (kind, ident), value in compiler.registry.items()},
        "cites": dict(getattr(compiler, "cite_map", {})),
        "sources": source_labels(compiler),
        "settings": {
            key: compiler.cfg.get(key, "")
            for key in (
                "font", "font-size", "paper", "margins", "accent", "cover", "contents",
                "line-spacing", "paragraph-indent", "paragraph-spacing", "justify",
            )
        },
        "fontCss": font_css,
    }
    if report.errors:
        return result
    src, words, latex, font = prepare(page, compiler.cfg, essay.parent, font_css)
    work = Path(tempfile.mkdtemp())
    printable = work / "print.html"
    raw = work / "raw.pdf"
    try:
        needs_pages = "<!--TOC-->" in src or "@PG:" in src
        cfg = compiler.cfg
        pages, raw = paginate(src, work, printable, raw, cfg, needs_pages, str(essay))
        pages = {k: v for k, v in pages.items() if not re.fullmatch(r"B\d+", k)}
        body_pages = [n for key, n in pages.items() if key != "contents" and not key.startswith(("fig-", "tbl-"))]
        has_cover = cfg.get("cover", "yes").lower() not in OFF
        first = (min(body_pages) - 1 if body_pages else 0) if needs_pages else (1 if has_cover else 0)
        font_file = KATEX_FONT if latex else (fonts.find_system(font) or KATEX_FONT)
        numbered = cfg.get("page-numbers", "yes").lower() not in OFF
        continuous = cfg.get("page-numbering", "body").lower() == "continuous"
        count = number_pages(
            raw, output, first, font_file, title, numbered, continuous, has_cover,
            cfg, section_list(src, pages), True,
        )
        sizes, regions = studio_regions(output)
    finally:
        shutil.rmtree(work, ignore_errors=True)
    result.update({"pdf": str(output), "pages": count, "words": words, "sizes": sizes, "regions": regions})
    return result


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description="Turn a plain-text essay (or an HTML essay) into a print-ready PDF.")
    parser.add_argument("essay", nargs="?", help="path to the essay .txt (or .html) file")
    parser.add_argument("output", nargs="?", help="where to save the PDF (default: next to the essay)")
    parser.add_argument("--check", action="store_true", help="only check the essay for mistakes; do not make the PDF")
    parser.add_argument("--keep-html", action="store_true", help="also save the generated HTML (for debugging)")
    parser.add_argument("--samples", action="store_true", help="make a PDF with the first page of the essay in four different looks")
    parser.add_argument("--fonts", nargs="?", const="", metavar="WORD",
                        help="list the available fonts (2,000+ Google Fonts); add a word or a category to narrow it")
    parser.add_argument("--install-font", metavar="NAME", help="download a font now instead of on first use")
    args = parser.parse_args()
    if args.fonts is not None:
        fonts.search(args.fonts)
        return
    if args.install_font:
        setup.ensure()
        css = fonts.prepare([args.install_font], lambda message: print(f"warning: {message}"))
        print(f"'{args.install_font}' is ready." if css or fonts.find_system(args.install_font) else "Not installed.")
        return
    if not args.essay:
        parser.error("give the path of the essay .txt file")
    setup.ensure()
    if args.samples:
        from lib import samples

        print(f"style samples -> {samples.make(args.essay, lambda src, out: build(src, out))}")
        return
    build(args.essay, args.output, args.check, args.keep_html)


if __name__ == "__main__":
    main()
