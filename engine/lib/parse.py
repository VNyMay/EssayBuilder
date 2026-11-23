import html
import json
import math
import re
from datetime import date
from collections import defaultdict
from pathlib import Path
from typing import NamedTuple

from . import diagrams, geo, science
from .styling import KEYS as STYLE_KEYS, style_css
from .kits import FIGURE_KEYS, KIT_DIRECTIVES, KITS
from .fonts import parse_family
from .inline import HARD_BREAK, attr, clean_math, escape, is_plain, plain, plain_math, render_inline
from .labels import latex_to_text
from .tables import (
    decimals_map, format_cell, is_number, merge_spans, parse_pipe, pick_columns, pick_rows,
    read_delimited, read_file, sort_rows,
)
from .util import (
    MM_PX, OPTION, PAPERS, Options, Report, css_length, length_px, parse_range, resolve, slug, split_attrs, suggest,
)

SETTINGS = {
    "title", "subject", "question", "font", "numbers", "heading-numbers", "font-size", "line-spacing", "paper",
    "margins", "cover", "contents", "cover-line", "word-count", "word-count-label", "word-limit", "page-numbers",
    "equation-numbers", "justify", "section-breaks", "image-width", "list-of-figures", "list-of-tables", "assets",
    "caption-size", "code-size", "table-size", "accent", "heading-style", "paragraph-indent", "paragraph-spacing",
    "look", "heading-font", "code-font", "page-numbering", "heading-size", "caption-style",
    "cover-style", "subtitle", "author", "school", "date", "candidate", "supervisor", "session", "course",
    "cover-box", "category", "cover-image", "cover-logo", "cover-color", "cover-text", "cover-align", "math-input", "citations", "sources", "embed-project",
    "notes", "header", "footer", "header-on-first", "footer-on-first", "page-number-format", "watermark",
}
# A look is a bundle of settings. Anything the essay sets itself wins over the look.
LOOKS = {
    "essay": {},
    "document": {
        "font-size": "12", "heading-style": "underline", "paragraph-indent": "1.3em", "justify": "no", "line-spacing": "1.25",
        "paragraph-spacing": "14", "heading-numbers": "no", "cover": "no", "contents": "no",
    },
    "compact": {
        "font-size": "11", "line-spacing": "1.4", "paragraph-spacing": "7", "section-breaks": "no",
        "heading-numbers": "yes", "heading-style": "accent", "heading-size": "15", "justify": "no",
        "table-size": "10.5", "caption-size": "10", "caption-style": "italic", "cover": "no", "contents": "no",
    },
}
DEFAULTS = {
    "font": "Cambria", "numbers": "text", "heading-numbers": "yes", "font-size": "11", "line-spacing": "1.8",
    "paper": "A4", "margins": "25", "cover": "yes", "contents": "yes", "word-count": "auto", "math-input": "auto",
    "word-count-label": "Word count", "page-numbers": "yes", "page-numbering": "body", "equation-numbers": "labeled", "justify": "yes",
    "section-breaks": "yes", "image-width": "86%",
    "accent": "#1f4e79",
}
COVER_STYLES = ("classic", "formal", "modern", "minimal", "banner", "split", "image", "free")
COVER_ITEMS = (
    ("author", "Author"), ("candidate", "Candidate number"), ("school", "School"), ("supervisor", "Supervisor"),
    ("session", "Session"), ("course", "Course"), ("date", "Date"),
)
COLOR = re.compile(r"^(#[0-9a-fA-F]{3,8}|[a-zA-Z]+)$")
END_WORDS = ("references", "bibliography", "works cited", "sources", "appendix", "appendices")
FRONT_WORDS = {"abstract", "acknowledgements", "acknowledgments", "preface", "declaration", "foreword", "contents"}
CALLOUTS = {
    "definition": ("def", "Definition"), "theorem": ("thm", "Theorem"), "lemma": ("lem", "Lemma"),
    "proposition": ("prop", "Proposition"), "corollary": ("cor", "Corollary"), "example": ("ex", "Example"),
    "remark": ("rem", "Remark"),
}
LABELS = {"fig": "Figure", "tbl": "Table", "code": "Listing"}
MERMAID_BLOCKS = {
    "sequence": "sequenceDiagram", "er": "erDiagram", "class": "classDiagram", "state": "stateDiagram-v2",
    "gantt": "gantt", "journey": "journey", "quadrant": "quadrantChart", "sankey": "sankey-beta",
    "radar": "radar-beta", "requirement": "requirementDiagram", "packet": "packet-beta", "gitgraph": "gitGraph",
}
TABLE_STYLES = {"classic", "grid", "striped", "minimal"}
SCIENCE_KEYS = {"src", "smiles", "width", "caption", "id", "source", "align", "wrap", "color", "stereo"}
NO_BODY = {"pagebreak", "blank", "numbering", "spacer", "wc-start", "wc-end", "list-of-figures", "list-of-tables", "contents"}
DIRECTIVES = (
    {"figure", "figures", "table", "code", "run", "eq-pair", "box", "question", "note", "proof", "text", "chart",
     "diagram", "flow", "mindmap", "tree", "timeline", "grid", "swot", "references", "map", "music", "molecule"}
    | NO_BODY | set(CALLOUTS) | set(MERMAID_BLOCKS) | KIT_DIRECTIVES
)

TABLE_KEYS = {"sci", "group-digits", "src", "file", "csv", "data", "path", "sheet", "cols", "rows", "sort", "decimals", "thousands", "align",
              "group", "total", "size", "width", "caption", "id", "source", "note", "header", "header-rows", "split", "style", "transpose", "place", "wrap"}
CHART_KEYS = {"type", "src", "file", "csv", "data", "path", "sheet", "x", "y", "width", "ratio", "xlabel", "ylabel", "xlog",
              "ylog", "legend", "grid", "lines", "markers", "labels", "bins", "xmin", "xmax", "ymin", "ymax", "hline",
              "vline", "f", "function", "domain", "caption", "id", "source", "align", "wrap"}
DIAGRAM_KEYS = {"direction", "width", "caption", "id", "source", "title", "align", "wrap"}
GRID_KEYS = {"cols", "width", "caption", "id", "source", "align", "wrap"}
FIGURES_KEYS = {"cols", "width", "caption", "id", "source", "align", "wrap"}
NUMBER_WORDS = {"hide", "skip", "start", "restart", "numbers", "roman", "Roman", "letters", "Letters"}
TEXT_KEYS = {"page", "size", "align", "style", "indent", "font", "color", "bg", "spacing", "line", "weight"}
DIRECTIVE = re.compile(r"^:::\s*([A-Za-z][\w-]*)\s*(.*?)\s*$")
HEADING = re.compile(r"^(#{1,3})\s+(.+?)\s*$")
LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d+[.)])\s+(.*)$")
NOTE_DEF = re.compile(r"^\[\^([\w-]+)\]:\s*(.*)$")
IMAGE = re.compile(r"^!\[([^\]]*)\]\(([^)]+)\)\s*(\{.*\})?\s*$")
COMMENT = re.compile(r"^\s*(%%|//(\s|$))")
PLACEHOLDER = re.compile(r"\{\{(?!WORDS\}\})[A-Z][A-Z0-9 _/.,'-]*\}\}")
SOURCE_PREFIX = re.compile(r"^(source|sources|own work|adapted|based on|image|photo|data)\b", re.I)


class Line(NamedTuple):
    file: Path
    no: int
    text: str

    @property
    def where(self):
        return f"{self.file.name}:{self.no}"


class Block(NamedTuple):
    kind: str
    line: Line
    data: dict


def to_float(text):
    text = text.strip().replace("−", "-").replace(" ", "")
    if re.fullmatch(r"-?\d{1,3}(,\d{3})+(\.\d+)?", text):
        text = text.replace(",", "")
    text = text.rstrip("%")
    try:
        return float(text)
    except ValueError:
        return None


def parse_number(text):
    match = re.fullmatch(r"\s*(-?[\d.]*)\s*\*?\s*(pi|π)?\s*", text)
    if not match or (not match.group(1) and not match.group(2)):
        return to_float(text)
    factor = float(match.group(1)) if match.group(1) not in ("", "-") else (-1.0 if match.group(1) == "-" else 1.0)
    return factor * (math.pi if match.group(2) else 1.0)


class Compiler(*KITS):
    def __init__(self, path, report, source_text=None, studio=False):
        self.path = Path(path).resolve()
        self.source_text = source_text
        self.studio = studio
        self.pending_numbers = []
        self.ranges = []
        self.front = None
        self.main_lines = []
        self.report = report
        self.cfg = dict(DEFAULTS)
        self.bases = [self.path.parent]
        self.refs, self.registry = [], {}
        self.counters = defaultdict(int)
        self.cited = set()
        self.out = []
        self.jobs = []
        self.ids = set()
        self.lists = {"fig": [], "tbl": []}
        self.h1 = self.h2 = 0
        self.seen_heading = self.implicit_front = False
        self.plain_figures = 0
        self.appendix = ""
        self.text_fonts = set()
        self.section_open = False
        self.role = "body"
        self.numbered_h1 = False
        self.wc_started = self.wc_ended = self.manual_wc = False
        self.cover_lines = []
        self.cover_boxes = []
        self.notes_reset()

    # ---- loading ---------------------------------------------------------------------
    def load(self, path, stack=()):
        if path in stack:
            self.report.error(path.name, "files include each other in a loop")
            return []
        lines = []
        if not stack and self.source_text is not None:
            raw = self.source_text.removeprefix("\ufeff").splitlines()
        else:
            raw = path.read_text(encoding="utf-8-sig").splitlines()
        if not stack:
            self.main_lines = raw
        i = 0
        while i < len(raw):
            match = re.match(r"^:::\s*include\s+(.+?)\s*$", raw[i])
            if match:
                target = resolve(match.group(1), [path.parent] + self.bases)
                if target is None:
                    self.report.error(f"{path.name}:{i + 1}", f"include file not found: {match.group(1)}")
                else:
                    lines.extend(self.load(target, stack + (path,)))
                if i + 1 < len(raw) and raw[i + 1].strip() == ":::":
                    i += 1
            else:
                left = PLACEHOLDER.search(raw[i])
                if left and not COMMENT.match(raw[i]):
                    self.report.error(f"{path.name}:{i + 1}", f"template placeholder not replaced: {left.group(0)} "
                                      "(write the student's own text there, or delete the block)")
                lines.append(Line(path, i + 1, raw[i]))
            i += 1
        return lines

    def front_matter(self, lines):
        i = 0
        while i < len(lines) and (not lines[i].text.strip() or COMMENT.match(lines[i].text)):
            i += 1
        match = re.match(r"^([A-Za-z][\w-]*)\s*:", lines[i].text) if i < len(lines) else None
        if not match or match.group(1).lower().replace("_", "-") not in SETTINGS:
            return lines
        end = next((j for j in range(i, len(lines)) if lines[j].text.strip() == "---"), None)
        if end is None:
            end = i
            while end < len(lines) and re.match(r"^([A-Za-z][\w-]*\s*:|\s+\S)", lines[end].text):
                end += 1
            self.report.warn(lines[i].where, "end the settings at the top of the file with a line containing only ---")
            block, rest = lines[i:end], lines[end:]
        else:
            block, rest = lines[i:end], lines[end + 1:]
        if lines[i].file == self.path:
            self.front = (lines[i].no, lines[end].no if end < len(lines) and lines[end].text.strip() == "---" else lines[end - 1].no)
        block = [ln for ln in block if not COMMENT.match(ln.text)]
        opts = Options.parse([ln.text for ln in block], self.report, lines[i].where)
        opts.finish(SETTINGS)
        for key, value in opts.pairs:
            if key == "cover-line":
                self.cover_lines.append(value)
            elif key == "cover-box":
                self.cover_boxes.append(value)
            elif key in SETTINGS:
                self.cfg[key] = value
        numbering = self.cfg.get("page-numbering", "body").strip().lower()
        if numbering not in {"body", "continuous"}:
            self.report.error(lines[i].where, f"page-numbering must be 'body' or 'continuous'{suggest(numbering, ['body', 'continuous'])}")
        look = self.cfg.get("look", "").strip().lower()
        if look in LOOKS:
            given = {key for key, _ in opts.pairs}
            for key, value in LOOKS[look].items():
                if key not in given:
                    self.cfg[key] = value
        elif look:
            self.report.error(lines[i].where, f"look must be one of: {', '.join(LOOKS)}{suggest(look, list(LOOKS))}")
        return rest

    # ---- block parser ----------------------------------------------------------------
    def parse_blocks(self, lines, top=True):
        blocks, para, i = [], [], 0
        pending_caption = None

        def flush():
            nonlocal para
            if para:
                text = ""
                for ln in para:
                    piece = ln.text.strip()
                    if piece.endswith("\\\\"):
                        text += piece[:-2].rstrip() + HARD_BREAK
                    else:
                        text += piece + " "
                alone = re.fullmatch(r"\$(?!\$)([^$]+?)\$(\s*\{[^{}]*\})?", text.strip())
                if alone and HARD_BREAK not in text:
                    attrs = split_attrs(alone.group(2))[1] if alone.group(2) else {}
                    blocks.append(Block("math", para[0], {"body": [alone.group(1)], "attrs": attrs}))
                else:
                    blocks.append(Block("para", para[0], {"text": text.strip()}))
                para = []

        while i < len(lines):
            line = lines[i]
            text = line.text
            stripped = text.strip()

            if not stripped:
                flush()
                i += 1
                continue
            if COMMENT.match(text):
                i += 1
                continue
            if stripped == ":::":
                flush()
                self.report.warn(line.where, "stray ::: with no block to close (ignored)")
                i += 1
                continue

            definition = NOTE_DEF.match(stripped)
            if definition:
                flush()
                piece = [definition.group(2).strip()]
                i += 1
                while i < len(lines) and lines[i].text.strip() and lines[i].text[0].isspace():
                    piece.append(lines[i].text.strip())
                    i += 1
                self.note_defs[definition.group(1)] = (" ".join(piece), line.where)
                continue

            directive = DIRECTIVE.match(stripped)
            if directive:
                flush()
                name = directive.group(1).lower()
                args = directive.group(2)
                if name not in DIRECTIVES:
                    self.report.error(line.where, f"unknown block ':::{name}'{suggest(name, DIRECTIVES)}")
                if name in NO_BODY:
                    i += 1
                    if i < len(lines) and lines[i].text.strip() == ":::":
                        i += 1
                    blocks.append(Block("dir", line, {"name": name, "args": args, "body": []}))
                    continue
                j = i + 1
                while j < len(lines) and lines[j].text.strip() != ":::":
                    j += 1
                if j >= len(lines):
                    self.report.error(line.where, f"block ':::{name}' is never closed (end it with a line containing only :::)")
                body = lines[i + 1: j]
                blocks.append(Block("dir", line, {"name": name, "args": args, "body": body}))
                i = j + 1
                continue

            if stripped.startswith("```"):
                flush()
                info = stripped[3:].strip()
                j = i + 1
                while j < len(lines) and not lines[j].text.strip().startswith("```"):
                    j += 1
                if j >= len(lines):
                    self.report.error(line.where, "code fence ``` is never closed")
                info, attrs = split_attrs(info)
                blocks.append(Block("fence", line, {"lang": info.strip(), "attrs": attrs, "body": lines[i + 1: j]}))
                i = j + 1
                continue

            if stripped.startswith("$$"):
                flush()
                body_lines, attrs, j = [], {}, i
                single = re.match(r"^\$\$(.+?)\$\$\s*(\{[^{}]*\})?$", stripped)
                if single:
                    body_lines = [single.group(1)]
                    if single.group(2):
                        _, attrs = split_attrs(single.group(2))
                elif stripped == "$$" or not re.search(r"\$\$", stripped[2:]):
                    first = stripped[2:].strip()
                    if first:
                        body_lines.append(first)
                    j = i + 1
                    while j < len(lines):
                        current = lines[j].text.strip()
                        if not current:
                            self.report.error(line.where, "display maths $$ is never closed (found a blank line before the closing $$)")
                            j -= 1
                            break
                        closing = re.match(r"^(.*?)\$\$\s*(\{[^{}]*\})?$", current)
                        if closing:
                            if closing.group(1).strip():
                                body_lines.append(closing.group(1).strip())
                            if closing.group(2):
                                _, attrs = split_attrs(closing.group(2))
                            break
                        body_lines.append(current)
                        j += 1
                    else:
                        self.report.error(line.where, "display maths $$ is never closed (reached the end of the file)")
                else:
                    para.append(line)
                    i += 1
                    continue
                blocks.append(Block("math", line, {"body": body_lines, "attrs": attrs}))
                i = j + 1
                continue

            heading = HEADING.match(stripped)
            if heading:
                flush()
                title, attrs = split_attrs(heading.group(2))
                blocks.append(Block("heading", line, {"level": len(heading.group(1)), "text": title, "attrs": attrs}))
                i += 1
                continue

            image = IMAGE.match(stripped)
            if image:
                flush()
                _, attrs = split_attrs(image.group(3) or "")
                blocks.append(Block("image", line, {"alt": image.group(1), "src": image.group(2).strip(), "attrs": attrs}))
                i += 1
                continue

            if stripped.startswith("|"):
                flush()
                j = i
                while j < len(lines) and lines[j].text.strip().startswith("|"):
                    j += 1
                caption = pending_caption
                pending_caption = None
                blocks.append(Block("pipetable", line, {"lines": [ln.text for ln in lines[i:j]], "caption": caption}))
                i = j
                continue

            cap = re.match(r"^Table:\s*(.+)$", stripped)
            if cap:
                ahead = i + 1
                while ahead < len(lines) and not lines[ahead].text.strip():
                    ahead += 1
                if ahead < len(lines) and lines[ahead].text.strip().startswith("|"):
                    flush()
                    pending_caption = split_attrs(cap.group(1))
                    i += 1
                    continue

            if stripped.startswith(">"):
                flush()
                j, paragraphs, current = i, [], []
                while j < len(lines) and lines[j].text.strip().startswith(">"):
                    piece = lines[j].text.strip()[1:].strip()
                    if piece:
                        current.append(piece)
                    elif current:
                        paragraphs.append(" ".join(current))
                        current = []
                    j += 1
                if current:
                    paragraphs.append(" ".join(current))
                blocks.append(Block("quote", line, {"paragraphs": paragraphs}))
                i = j
                continue

            item = LIST_ITEM.match(text.expandtabs(4))
            if item:
                flush()
                items, widths, j = [], [], i
                while j < len(lines):
                    raw = lines[j].text.expandtabs(4)
                    match = LIST_ITEM.match(raw)
                    if match:
                        indent = len(match.group(1))
                        while widths and indent < widths[-1]:
                            widths.pop()
                        if not widths or indent > widths[-1]:
                            widths.append(indent)
                        marker = match.group(2)
                        items.append({
                            "depth": len(widths) - 1, "ordered": marker[0].isdigit(),
                            "number": int(marker[:-1]) if marker[0].isdigit() else 1, "text": match.group(3).strip(),
                        })
                    elif raw.strip() and raw[0].isspace() and items:
                        items[-1]["text"] += " " + raw.strip()
                    else:
                        break
                    j += 1
                blocks.append(Block("list", line, {"items": items}))
                i = j
                continue

            if top and stripped in {"---", "***", "___"}:
                self.report.warn(line.where, "a line of --- does nothing here; use :::pagebreak to start a new page")
                i += 1
                continue

            para.append(line)
            i += 1

        flush()
        return blocks

    # ---- output helpers --------------------------------------------------------------
    def emit(self, html_text):
        self.out.append(html_text)

    def inline(self, text, line):
        return render_inline(text, self, line.where)

    def unique(self, ident):
        base, n = ident, 2
        while ident in self.ids:
            ident = f"{base}-{n}"
            n += 1
        self.ids.add(ident)
        return ident

    def register(self, kind, ident, label, anchor, line):
        if ident:
            if (kind, ident) in self.registry:
                self.report.error(line.where, f"the id '{ident}' is used twice for {kind}")
            self.registry[(kind, ident)] = (label, anchor)

    def sub_html(self, lines, line):
        saved, self.out = self.out, []
        self.emit_blocks(self.parse_blocks(lines, top=False))
        text = "".join(self.out)
        self.out = saved
        return text

    def ensure_section(self, line):
        if not self.section_open:
            if not self.wc_started and not self.manual_wc:
                self.emit("<!--WC-START-->")
                self.wc_started = True
            self.emit('<section class="sec">')
            self.section_open = True
            # text above the first heading (e.g. a title block) shares its page with that heading
            self.implicit_front = not self.seen_heading

    # ---- document frame --------------------------------------------------------------
    def cover_file(self, key):
        value = self.cfg.get(key, "").strip()
        if not value:
            return None
        found = resolve(value, self.bases)
        if found is None:
            self.report.error(self.path.name, f"{key} file not found: {value}")
        return found

    def cover(self):
        if self.cfg["cover"].lower() in {"no", "off", "false"}:
            return
        name = self.path.name
        style = self.cfg.get("cover-style", "classic").strip().lower()
        if style not in COVER_STYLES:
            self.report.error(name, f"cover-style must be one of: {', '.join(COVER_STYLES)}{suggest(style, COVER_STYLES)}")
            style = "classic"
        subject = render_inline(self.cfg.get("subject", ""), self)
        question = render_inline(self.cfg.get("question") or self.cfg.get("title", ""), self)
        extra = "".join(f"{render_inline(text, self)}<br>" for text in self.cover_lines)
        if style == "classic":
            extra = "".join(
                f"{render_inline(text, self)}<br>"
                for text in self.cover_lines
                if not re.search(r"\b(candidate|name|school|author)\b", text, re.I)
            )
        count = self.cfg["word-count"].lower()
        if count in {"off", "no", "none", "false"}:
            foot = extra.removesuffix("<br>")
        else:
            number = "{{WORDS}}" if count == "auto" else self.cfg["word-count"]
            foot = f"{extra}{escape(self.cfg['word-count-label'])}: {number}"
        if style == "free":
            self.cover_free()
            return
        if style == "classic":
            title = render_inline(self.cfg.get("title", ""), self)
            asked = self.cfg.get("question", "").strip()
            category = self.cfg.get("category", "").strip()
            heading = subject + (f'<span class="ib-category">{render_inline(category, self)}</span>' if category else "")
            question_block = ""
            if asked and title:
                question_block = (
                    f'<div class="ib-label">Research question</div>'
                    f'<p class="ib-question">{render_inline(asked, self)}</p>'
                )
            main = title or render_inline(asked, self)
            self.emit(
                f'<section class="cover cover-ib"><div class="ib-subject">{heading}</div>'
                f'<div class="ib-mid"><div class="ib-title">{main}</div>{question_block}</div>'
                f'<div class="ib-foot">{foot}</div></section>'
            )
            return
        colors = []
        for key, variable in (("cover-color", "--cv-bg"), ("cover-text", "--cv-fg")):
            value = self.cfg.get(key, "").strip()
            if value and not COLOR.match(value):
                self.report.error(name, f"{key} must be a colour such as #1f4e79 or navy (got '{value}')")
            elif value:
                colors.append(f"{variable}:{value}")
        align = self.cfg.get("cover-align", "").strip().lower()
        if align and align not in {"left", "center", "right"}:
            self.report.error(name, f"cover-align must be left, center or right (got '{align}')")
            align = ""
        if self.cfg.get("date", "").strip().lower() == "today":
            now = date.today()
            self.cfg["date"] = f"{now.day} {now.strftime('%B %Y')}"
        items = "".join(
            f'<div class="cv-item"><b>{label}</b><span>{render_inline(self.cfg[key], self)}</span></div>'
            for key, label in COVER_ITEMS
            if self.cfg.get(key, "").strip()
        )
        subtitle = self.cfg.get("subtitle", "").strip()
        subtitle = f'<p class="cv-subtitle">{render_inline(subtitle, self)}</p>' if subtitle else ""
        logo = self.cover_file("cover-logo")
        logo = f'<img class="cv-logo" src="{logo.as_uri()}" alt="">' if logo else ""
        art = ""
        if style == "image":
            picture = self.cover_file("cover-image")
            if picture:
                art = f'<div class="cv-art" style="background-image:url(&quot;{picture.as_uri()}&quot;)"></div>'
            elif not self.cfg.get("cover-image", "").strip():
                self.report.warn(name, "cover-style image needs 'cover-image: path/to/picture.jpg' (a plain colour is used instead)")
        elif self.cfg.get("cover-image", "").strip():
            picture = self.cover_file("cover-image")
            if picture:
                art = f'<div class="cv-photo"><img src="{picture.as_uri()}" alt=""></div>'
        classes = f"cover cv cv-{style}" + (f" cv-{align}" if align else "")
        self.emit(
            f'<section class="{classes}" style="{";".join(colors)}">{art}'
            f'<div class="cv-top"><div class="cv-head">{logo}<div class="cv-kicker">{subject}</div></div>'
            f'<div class="cv-mid"><div class="cv-title">{question}</div>{subtitle}</div></div>'
            f'<div class="cv-bottom">{f"<div class={chr(34)}cv-meta{chr(34)}>{items}</div>" if items else ""}'
            f'<div class="cv-foot">{foot}</div></div></section>'
        )

    def cover_free(self):
        name = self.path.name
        if self.cfg.get("date", "").strip().lower() == "today":
            now = date.today()
            self.cfg["date"] = f"{now.day} {now.strftime('%B %Y')}"
        fields = {
            key: self.cfg.get(key, "").strip()
            for key in ("title", "subject", "subtitle", "author", "candidate", "school", "supervisor", "session", "course", "date")
        }
        fields["question"] = self.cfg.get("question", "").strip() or fields["title"]
        count = self.cfg.get("word-count", "auto").lower()
        fields["words"] = "{{WORDS}}" if count == "auto" else self.cfg.get("word-count", "")

        def fill(text):
            return re.sub(r"\{(\w+)\}", lambda m: fields.get(m.group(1), m.group(0)), text)

        number = re.compile(r"^-?\d+(?:\.\d+)?$")
        pair = re.compile(r'(\w+)=("[^"]*"|\S+)')
        parts = []
        background = self.cfg.get("cover-color", "").strip()
        if background and not COLOR.match(background):
            self.report.error(name, f"cover-color must be a colour such as #1f4e79 or navy (got '{background}')")
            background = ""
        for raw in self.cover_boxes:
            kind, _, rest = raw.partition("|")
            attrs, _, content = rest.partition("|")
            kind = kind.strip().lower()
            if kind not in {"text", "rect", "ellipse", "line", "image"}:
                self.report.error(name, f"cover-box kind must be text, rect, ellipse, line or image (got '{kind}')")
                continue
            opts = {key.lower(): value.strip('"') for key, value in pair.findall(attrs)}
            for flag in ("bold", "italic", "underline", "upper"):
                if re.search(rf"(?:^|\s){flag}(?:\s|$)", pair.sub("", attrs)):
                    opts[flag] = "1"
            style = []
            for key, css in (("x", "left"), ("y", "top"), ("w", "width"), ("h", "height")):
                if number.match(opts.get(key, "")):
                    style.append(f"{css}:{float(opts[key]):g}%")
            for key, css, unit in (("size", "font-size", "pt"), ("spacing", "letter-spacing", "pt"), ("bw", "border-width", "pt"), ("radius", "border-radius", "pt")):
                if number.match(opts.get(key, "")):
                    style.append(f"{css}:{float(opts[key]):g}{unit}")
            if number.match(opts.get("line", "")):
                style.append(f"line-height:{float(opts['line']):g}")
            if number.match(opts.get("weight", "")):
                style.append(f"font-weight:{int(float(opts['weight']))}")
            if number.match(opts.get("opacity", "")):
                style.append(f"opacity:{float(opts['opacity']):g}")
            if number.match(opts.get("rot", "")):
                style.append(f"transform:rotate({float(opts['rot']):g}deg)")
            for key, css in (("color", "color"), ("bg", "background"), ("border", "border-color")):
                value = opts.get(key, "")
                if value and COLOR.match(value):
                    style.append(f"{css}:{value}")
                elif value:
                    self.report.error(name, f"cover-box {key} must be a colour (got '{value}')")
            if opts.get("font"):
                family = opts["font"].replace("'", "")
                style.append(f"font-family:'{family}',var(--font),Cambria,Georgia,serif")
                self.text_fonts.add(family)
            if opts.get("bold"):
                style.append("font-weight:700")
            if opts.get("italic"):
                style.append("font-style:italic")
            if opts.get("underline"):
                style.append("text-decoration:underline")
            if opts.get("upper"):
                style.append("text-transform:uppercase")
            if opts.get("align") in {"left", "center", "right", "justify"}:
                style.append(f"text-align:{opts['align']}")
            valign = {"top": "flex-start", "middle": "center", "bottom": "flex-end"}.get(opts.get("valign", ""), "")
            if valign:
                style.append(f"justify-content:{valign}")
            if opts.get("border") or opts.get("bw"):
                style.append("border-style:solid")
            inner = ""
            if kind == "text":
                body = fill(content.strip()).replace("\\n", "\n")
                inner = "<br>".join(render_inline(piece, self) for piece in body.split("\n"))
            elif kind == "image":
                found = resolve(content.strip(), self.bases) if content.strip() else None
                if found is None:
                    self.report.warn(name, f"cover picture not found: {content.strip() or '(none)'}")
                    continue
                fit = opts.get("fit") if opts.get("fit") in {"cover", "contain", "fill"} else "cover"
                inner = f'<img src="{found.as_uri()}" alt="" style="object-fit:{fit}">'
            parts.append(f'<div class="cvx cvx-{kind}" style="{";".join(style)}">{inner}</div>')
        paint = f' style="--cv-bg:{background}"' if background else ""
        wash = '<div class="cvx-wash"></div>' if background else ""
        self.emit(f'<section class="cover cv cv-free"{paint}>{wash}{"".join(parts)}</section>')

    def contents(self):
        if self.cfg["contents"].lower() in {"no", "off", "false"}:
            return
        lists = ""
        if self.cfg.get("list-of-figures", "no").lower() in {"yes", "on", "true"}:
            lists += '<div class="lo-title">List of Figures</div><!--LOF-->'
        if self.cfg.get("list-of-tables", "no").lower() in {"yes", "on", "true"}:
            lists += '<div class="lo-title">List of Tables</div><!--LOT-->'
        self.emit(f'<section class="sec"><h1 id="contents">Contents</h1><!--TOC-->{lists}</section>')
        self.ids.add("contents")

    def close_section(self):
        if self.section_open:
            self.emit("</section>")
            self.section_open = False

    # ---- blocks ----------------------------------------------------------------------
    def emit_top(self, blocks):
        for k, block in enumerate(blocks):
            start = len(self.out)
            getattr(self, f"do_{block.kind}")(block)
            if self.pending_numbers and not (block.kind == "dir" and block.data.get("name") in {"numbering", "pagebreak"}):
                self.attach_numbers(start)
            if self.studio and block.line.file == self.path:
                self.mark_block(blocks, k, start)
            self.band_notes(block, start)

    def attach_numbers(self, start):
        for index in range(start, len(self.out)):
            chunk = self.out[index]
            if re.match(r"<(?:h[1-6]|p|figure|div|ul|ol|blockquote|table|pre)\b", chunk):
                cut = chunk.index(">") + 1
                spans = "".join(f'<span class="pn" id="{ident}"></span>' for ident in self.pending_numbers)
                self.out[index] = chunk[:cut] + spans + chunk[cut:]
                self.pending_numbers = []
                return

    def mark_block(self, blocks, k, start):
        block = blocks[k]
        total = len(self.main_lines)
        following = blocks[k + 1].line if k + 1 < len(blocks) and blocks[k + 1].line.file == self.path else None
        last = following.no - 1 if following else total
        while last > block.line.no and not self.main_lines[last - 1].strip():
            last -= 1
        self.ranges.append({"id": block.line.no, "start": block.line.no, "end": last, "kind": block.data.get("name", block.kind)})
        for index in range(start, len(self.out)):
            chunk = self.out[index]
            mark = f'<span class="mk">@@B{block.line.no}@@</span>'
            if re.match(r"<h[1-6]\b", chunk):
                self.out.insert(index, mark)
                break
            if re.match(r"<(?:p|figure|div|ul|ol|blockquote|table|pre)\b", chunk):
                cut = chunk.index(">") + 1
                self.out[index] = chunk[:cut] + mark + chunk[cut:]
                break

    def emit_blocks(self, blocks):
        for block in blocks:
            handler = getattr(self, f"do_{block.kind}")
            handler(block)

    def do_heading(self, block):
        level, text, attrs, line = block.data["level"], block.data["text"], block.data["attrs"], block.line
        title = plain(text)
        low = title.lower()
        flags = attrs.get("flags", set())
        if low == "contents":
            self.report.warn(line.where, "'Contents' is generated automatically; this heading was skipped")
            return
        if level == 1:
            role = "end" if low.startswith(END_WORDS) else "front" if low in FRONT_WORDS else "body"
            self.flush_notes(role == "end", line)
            self.close_section()
            if role == "end" and self.wc_started and not self.wc_ended and not self.manual_wc:
                self.emit("<!--WC-END-->")
                self.wc_ended = True
            first_body = role == "body" and not self.wc_started and not self.manual_wc
            if first_body:
                self.emit("<!--WC-START-->")
                self.wc_started = True
            flow = "" if first_body or self.cfg["section-breaks"].lower() not in {"no", "off", "false"} else " flow"
            if self.implicit_front and role == "body":
                flow = " flow"
            self.implicit_front, self.seen_heading = False, True
            appendix = re.match(r"(?i)appendix\s+([A-Z])(?![A-Za-z])", title)
            self.appendix = appendix.group(1).upper() if appendix else ""
            if appendix:  # numbering restarts in each appendix: Table B1, Figure B1, ...
                for kind in ("fig", "tbl", "code"):
                    self.counters[kind] = 0
            self.emit(f'<section class="sec{flow}">')
            self.section_open, self.role = True, role
            self.numbered_h1 = (
                role == "body" and self.cfg["heading-numbers"].lower() not in {"no", "off", "false"}
                and "nonumber" not in flags and "unnumbered" not in flags
            )
            number = ""
            if self.numbered_h1:
                self.h1 += 1
                self.h2 = 0
                number = str(self.h1)
        elif level == 2:
            self.seen_heading = True
            self.ensure_section(block.line)
            number = ""
            if self.numbered_h1 and "nonumber" not in flags and "unnumbered" not in flags:
                self.h2 += 1
                number = f"{self.h1}.{self.h2}"
        else:
            self.ensure_section(block.line)
            self.emit(f"<h3>{self.inline(text, line)}</h3>")
            return

        ident = self.unique(attrs.get("id") or slug(title))
        label = f"Section {number}" if number else title
        self.registry[("sec", ident)] = (label, ident)
        num = f'<span class="num">{number}</span>' if number else ""
        look = style_css(" ".join(f'{key}="{value}"' for key, value in attrs.items() if key in STYLE_KEYS and key != "id"), self, line.where)
        look = f' style="{look}"' if look else ""
        self.emit(f'<h{level} id="{ident}"{look}>{num}{self.inline(text, line)}</h{level}>')

    def do_para(self, block):
        self.ensure_section(block.line)
        cls = ' class="ref"' if self.role == "end" and self.section_open and self.in_references() else ""
        self.emit(f"<p{cls}>{self.inline(block.data['text'], block.line)}</p>")

    def in_references(self):
        for chunk in reversed(self.out):
            match = re.match(r'<h1 id="([^"]+)"', chunk)
            if match:
                return match.group(1).startswith(("references", "bibliography", "works-cited", "sources"))
        return False

    def do_list(self, block):
        self.ensure_section(block.line)
        out, stack = [], []
        for item in block.data["items"]:
            tag = "ol" if item["ordered"] else "ul"
            while stack and stack[-1][1] > item["depth"]:
                out.append(f"</li></{stack.pop()[0]}>")
            if stack and stack[-1][1] == item["depth"]:
                if stack[-1][0] != tag:
                    out.append(f"</li></{stack.pop()[0]}>")
                else:
                    out.append("</li>")
            if not stack or stack[-1][1] < item["depth"]:
                start = f' start="{item["number"]}"' if tag == "ol" and item["number"] != 1 else ""
                out.append(f"<{tag}{start}>")
                stack.append((tag, item["depth"]))
            out.append(f"<li>{self.inline(item['text'], block.line)}")
        while stack:
            out.append(f"</li></{stack.pop()[0]}>")
        self.emit("".join(out))

    def do_quote(self, block):
        self.ensure_section(block.line)
        paragraphs = "".join(f"<p>{self.inline(p, block.line)}</p>" for p in block.data["paragraphs"])
        self.emit(f"<blockquote>{paragraphs}</blockquote>")

    # ---- equations -------------------------------------------------------------------
    def align_math(self, lines):
        rows = []
        pattern = re.compile(r"(?<![\\])(=|\\approx|\\neq|\\leq|\\geq|\\lt|\\gt|\\equiv|\\sim|\\to|\\Rightarrow|\\in)(?![A-Za-z])")
        for text in lines:
            depth, cut = 0, None
            for m in pattern.finditer(text):
                depth = text[: m.start()].count("{") - text[: m.start()].count("}") - text[: m.start()].count("\\{") + text[: m.start()].count("\\}")
                if depth <= 0:
                    cut = m.start()
                    break
            rows.append(("&" + text) if cut is None or cut == 0 else text[:cut] + "&" + text[cut:])
        return "\\begin{aligned}" + " \\\\[3pt] ".join(rows) + "\\end{aligned}"

    def math_source(self, body):
        mode = self.cfg.get("math-input", "auto")
        raw = [ln for ln in body if ln.strip()]
        if raw and all(is_plain(ln, mode) for ln in raw):
            return plain_math("\n".join(ln.strip() for ln in raw))
        lines = [clean_math(ln, "latex") for ln in raw]
        joined = "\n".join(lines)
        if len(lines) > 1 and not re.search(r"\\begin|\\\\|&", joined):
            return self.align_math([ln.strip() for ln in lines])
        return joined

    def do_math(self, block):
        self.ensure_section(block.line)
        attrs = block.data["attrs"]
        flags = attrs.get("flags", set())
        mode = self.cfg["equation-numbers"].lower()
        numbered = ("id" in attrs or "n" in flags or "numbered" in flags or mode == "all") and "nonumber" not in flags and mode != "none"
        tag = attrs.get("tag") or attrs.get("cite")
        ident = attrs.get("id", "")
        anchor = ""
        cite = ""
        if numbered and not tag:
            self.counters["eq"] += 1
            n = self.counters["eq"]
            cite = f"({n})"
            anchor = f"eq-{ident or 'n' + str(n)}"
            self.register("eq", ident, f"Equation ({n})", anchor, block.line)
        elif tag:
            cite = escape(tag)
            if ident:
                anchor = f"eq-{ident}"
                self.register("eq", ident, f"Equation {tag}", anchor, block.line)
        idattr = f' id="{anchor}"' if anchor else ""
        cite_html = f'<span class="eq-cite">{cite}</span>' if cite else ""
        self.emit(f'<div class="eq"{idattr}>$${self.math_source(block.data["body"])}$${cite_html}</div>')

    def eq_pair(self, block):
        items = [ln.text for ln in block.data["body"] if ln.text.strip()]
        if len(items) not in (2, 3):
            self.report.error(block.line.where, "eq-pair needs 2 or 3 equations, one per line")
        cells = "".join(f'<div class="eq">$${self.math_source([text.strip()])}$$</div>' for text in items)
        self.emit(f'<div class="eq-pair">{cells}</div>')

    # ---- generic blocks --------------------------------------------------------------
    def do_fence(self, block):
        data = block.data
        body = [ln.text for ln in data["body"]]
        self.code_block(Options([], self.report, block.line.where), body, block.line, data["lang"], data["attrs"])

    def do_image(self, block):
        attrs = block.data["attrs"]
        pairs = [["src", block.data["src"]], ["caption", block.data["alt"]]]
        for key, value in attrs.items():
            if key == "id":
                pairs.append(["id", value])
            elif key != "flags":
                pairs.append([key.replace("_", "-"), value])
        self.figure(Options(pairs, self.report, block.line.where), block.line)

    def do_pipetable(self, block):
        pairs = []
        if block.data["caption"]:
            text, attrs = block.data["caption"]
            pairs.append(["caption", text])
            if "id" in attrs:
                pairs.append(["id", attrs["id"]])
        opts = Options(pairs, self.report, block.line.where)
        body = [Line(block.line.file, block.line.no, text) for text in block.data["lines"]]
        self.table(opts, body, block.line)

    def split_options(self, body, known=None, src=False):
        """Options are the leading 'key: value' lines; a line of --- may end them, but is optional when keys are known."""
        texts = [ln.text for ln in body]
        for k, text in enumerate(texts):
            if text.strip() == "---":
                return texts[:k], body[k + 1:]
        if not (known or src):
            return [], body
        first = next((t.strip() for t in texts if t.strip()), "")
        if src and not re.match(r"^(src|file|path|csv|data)\s*:", first, re.I):
            return [], body
        base, j = None, 0
        while j < len(texts):
            text = texts[j]
            if not text.strip():
                j += 1
                continue
            indent = len(text) - len(text.lstrip())
            base = indent if base is None else base
            match = OPTION.match(text.strip())
            key = match.group(1).lower().replace("_", "-") if match else None
            if indent > base:
                j += 1
            elif match and (src or key in known):
                j += 1
            else:
                break
        return texts[:j], body[j:]

    def do_dir(self, block):
        name, args, body, line = block.data["name"], block.data["args"], block.data["body"], block.line
        handler = getattr(self, f"dir_{name.replace('-', '_')}", None)
        if handler is None:
            if name in MERMAID_BLOCKS:
                self.mermaid_block(name, body, line)
            elif name in CALLOUTS or name in {"box", "question", "note", "proof"}:
                self.callout(name, args, body, line)
            return
        handler(args, body, line)

    def dir_pagebreak(self, args, body, line):
        self.ensure_section(line)
        self.emit('<div class="pb"></div>')

    def dir_numbering(self, args, body, line):
        words = []
        for word in (args or "").replace(",", " ").split():
            plain_word = word if word in NUMBER_WORDS else word.lower()
            if word.isdigit() or plain_word in NUMBER_WORDS:
                words.append(word if word.isdigit() else plain_word)
            else:
                self.report.warn(line.where, f"numbering: '{word}' is not known (use hide, skip, start, restart, a number, numbers, roman, Roman or letters)")
        if words:
            self.pending_numbers.append(f"pn-{line.no}-{'-'.join(words)}")

    def dir_blank(self, args, body, line):
        self.ensure_section(line)
        self.emit('<div class="blank-page"></div>')

    def dir_spacer(self, args, body, line):
        self.ensure_section(line)
        size = css_length(args or "10mm", self.report, line.where) or "10mm"
        self.emit(f'<div style="height:{size}"></div>')

    def dir_wc_start(self, args, body, line):
        self.manual_wc = True
        self.close_section()
        self.emit("<!--WC-START-->")
        self.wc_started = True

    def dir_wc_end(self, args, body, line):
        self.manual_wc = True
        self.emit("<!--WC-END-->")
        self.wc_ended = True

    def dir_contents(self, args, body, line):
        pass

    def dir_list_of_figures(self, args, body, line):
        self.cfg["list-of-figures"] = "yes"

    def dir_list_of_tables(self, args, body, line):
        self.cfg["list-of-tables"] = "yes"

    def callout(self, name, args, body, line):
        self.ensure_section(line)
        title, attrs = split_attrs(args)
        ident = attrs.get("id", "")
        inner = self.sub_html(body, line)
        if name in {"box", "question"}:
            self.emit(f'<div class="box">{inner}</div>')
            return
        if name == "note":
            label = '<b class="lab">Note.</b> '
            anchor = ""
        elif name == "proof":
            label = '<b class="lab">Proof.</b> '
            anchor = ""
            inner = re.sub(r"</p>(?![\s\S]*</p>)", '<span class="qed">&#8718;</span></p>', inner)
        else:
            key, word = CALLOUTS[name]
            self.counters[key] += 1
            n = self.counters[key]
            anchor = f"{key}-{ident or 'n' + str(n)}"
            self.register(key, ident, f"{word} {n}", anchor, line)
            heading = f"{word} {n}"
            label = f'<b class="lab">{heading}</b>' + (f' <span class="ttl">({self.inline(title, line)})</span>' if title else "") + ". "
        if inner.startswith("<p>"):
            inner = "<p>" + label + inner[3:]
        else:
            inner = f"<p>{label}</p>" + inner
        idattr = f' id="{anchor}"' if anchor else ""
        self.emit(f'<div class="thm {name}"{idattr}>{inner}</div>')

    dir_box = lambda self, a, b, l: self.callout("box", a, b, l)  # noqa: E731
    dir_question = lambda self, a, b, l: self.callout("question", a, b, l)  # noqa: E731
    dir_note = lambda self, a, b, l: self.callout("note", a, b, l)  # noqa: E731
    dir_proof = lambda self, a, b, l: self.callout("proof", a, b, l)  # noqa: E731

    def dir_text(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known=TEXT_KEYS)
        opts = Options.parse(head, self.report, line.where)
        style = ["break-before:page"] if opts.flag("page") else []
        size = opts.get("size")
        if size:
            style.append(f"font-size:{size}pt" if re.fullmatch(r"[\d.]+", size) else f"font-size:{size}")
        align = opts.get("align")
        if align:
            style.append(f"text-align:{align}")
        looks = (opts.get("style") or "").lower()
        if "bold" in looks:
            style.append("font-weight:700")
        if "italic" in looks:
            style.append("font-style:italic")
        if opts.get("indent"):
            style.append(f"padding-left:{css_length(opts.get('indent'), self.report, line.where)}")
        if opts.get("font"):
            name = parse_family(opts.get("font"))[0]
            self.text_fonts.add(name)
            style.append(f"font-family:'{name}',var(--font)")
        extra = " ".join(f"{key}={opts.get(key)}" for key in ("color", "bg", "spacing", "line", "weight") if opts.get(key))
        if extra:
            style.append(style_css(extra, self, line.where))
        opts.finish(TEXT_KEYS)
        self.emit(f'<div class="txt" style="{";".join(part for part in style if part)}">{self.sub_html(rest, line)}</div>')

    def dir_eq_pair(self, args, body, line):
        self.ensure_section(line)
        self.eq_pair(Block("dir", line, {"body": body}))

    def dir_references(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known={"sort"})
        opts = Options.parse(head, self.report, line.where)
        sort = opts.flag("sort")
        opts.finish({"sort"})
        texts = [ln.text.strip() for ln in rest]
        entries, current = [], []
        has_blank = any(not t for t in texts)
        for text in texts:
            if text and not COMMENT.match(text):
                current.append(text)
                if not has_blank:
                    entries.append(" ".join(current))
                    current = []
            elif current and has_blank:
                entries.append(" ".join(current))
                current = []
        if current:
            entries.append(" ".join(current))
        if sort:
            entries.sort(key=lambda e: re.sub(r"[^a-z0-9 ]", "", plain(e).lower()))
        for entry in entries:
            self.emit(f'<p class="ref">{self.inline(entry, line)}</p>')

    # ---- numbered floats -------------------------------------------------------------
    def caption(self, kind, opts, line, extra_class=""):
        text = opts.get("caption")
        ident = opts.get("id", "")
        self.counters[kind] += 1
        n = self.counters[kind]
        anchor = f"{kind}-{ident or 'n' + str(n)}"
        label = f"{LABELS[kind]} {self.appendix}{n}"
        if ident:
            self.register(kind, ident, label, anchor, line)
        if text:
            cap = self.inline(text, line)
            if kind in self.lists:
                self.lists[kind].append((label, anchor, cap))
            return anchor, f'<figcaption class="cap"><b class="lab">{label}:</b> {cap}</figcaption>', label
        self.report.warn(line.where, f"{label.lower()} has no caption (add 'caption: ...')")
        if kind in self.lists:
            self.lists[kind].append((label, anchor, ""))
        return anchor, f'<figcaption class="cap"><b class="lab">{label}</b></figcaption>', label

    def source_line(self, opts, line):
        source = opts.get("source")
        if not source:
            return ""
        text = self.inline(source, line)
        prefix = "" if SOURCE_PREFIX.match(source.strip()) else "<i>Source:</i> "
        return f'<div class="src">{prefix}{text}</div>'

    def image_file(self, text, line):
        path = resolve(text, self.bases)
        if path is None:
            folder = (self.bases[0] / Path(text.strip().strip("\"'").replace("\\", "/"))).parent
            near = ""
            if folder.is_dir():
                names = [p.name for p in folder.iterdir() if p.is_file()]
                near = suggest(Path(text).name, names)
            self.report.error(line.where, f"image not found: {text}{near}")
        return path

    def text_width_px(self):
        paper = PAPERS.get(self.cfg["paper"].lower(), PAPERS["a4"])
        return (paper[0] - 2 * float(self.cfg["margins"])) * MM_PX

    def check_resolution(self, path, shown_px, line):
        if path.suffix.lower() == ".svg":
            return
        try:
            import pymupdf
            pix = pymupdf.Pixmap(str(path))
            dpi = pix.width / (shown_px / 96)
            if dpi < 110:
                self.report.warn(line.where, f"{path.name} is only {round(dpi)} dpi at this size ({pix.width}px wide); it will look blurry in print")
        except Exception:
            pass

    def figure(self, opts, line):
        self.ensure_section(line)
        src = opts.get("src") or opts.get("file") or opts.get("path")
        if not src:
            self.report.error(line.where, "figure needs 'src: path/to/image.png'")
            return
        wrap = (opts.get("wrap") or opts.get("float") or "").lower()
        if wrap not in {"", "left", "right", "no"}:
            self.report.error(line.where, f"wrap must be 'left' or 'right' (text flows around the image), not '{wrap}'")
            wrap = ""
        wrap = "" if wrap == "no" else wrap
        default_width = "36%" if wrap else self.cfg["image-width"]
        width = css_length(opts.get("width") or opts.get("size") or default_width, self.report, line.where) or "86%"
        height = css_length(opts.get("height"), self.report, line.where) if opts.get("height") else None
        align = (opts.get("align") or "center").lower()
        path = self.image_file(src, line)
        alt = attr(opts.get("alt") or plain(opts.get("caption", "")))
        style = f"width:{'100%' if wrap else width};" + (f"max-height:{height};object-fit:contain;" if height else "")
        style += {"left": "margin:0 auto 0 0;", "right": "margin:0 0 0 auto;"}.get("" if wrap else align, "")
        border = " border" if opts.flag("border") else ""
        if opts.get("caption"):
            anchor, cap, label = self.caption("fig", opts, line)
        else:  # an image without a caption is just a picture: no label, no number
            self.plain_figures += 1
            anchor, cap = f"fig-plain{self.plain_figures}", ""
        source = self.source_line(opts, line)
        opts.finish({"src", "file", "path", "caption", "id", "width", "size", "height", "align", "source", "alt", "border",
                     "wrap", "float"})
        if path is None:
            return
        self.check_resolution(path, length_px(width, self.text_width_px()), line)
        classes = "fig" + (f" wrap wrap-{wrap}" if wrap else "")
        box = f' style="width:{width}"' if wrap else ""
        self.emit(
            f'<figure class="{classes}" id="{anchor}"{box}><img class="{border.strip()}" src="{path.as_uri()}" alt="{alt}" style="{style}">'
            f"{cap}{source}</figure>"
        )

    def dir_figure(self, args, body, line):
        self.figure(Options.parse([ln.text for ln in body], self.report, line.where), line)

    def dir_figures(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known=FIGURES_KEYS)
        opts = Options.parse(head, self.report, line.where)
        entries = [ln.text.strip() for ln in rest if ln.text.strip() and not COMMENT.match(ln.text)]
        cols = int(opts.number("cols", min(max(len(entries), 1), 3)))
        wrap, classes, margin = self.layout(opts, line)
        width = css_length(opts.get("width") or ("40%" if wrap else self.cfg["image-width"]), self.report, line.where) or "86%"
        cells = []
        for k, entry in enumerate(entries):
            parts = [p.strip() for p in entry.split("|")]
            path = self.image_file(parts[0], line)
            sub = self.inline(parts[1], line) if len(parts) > 1 and parts[1] else ""
            letter = f"({chr(97 + k)})"
            label = f'<div class="sub"><b>{letter}</b> {sub}</div>' if sub else f'<div class="sub"><b>{letter}</b></div>'
            if path:
                cells.append(f'<div class="fi"><img src="{path.as_uri()}" alt="">{label}</div>')
        anchor, cap, _ = self.caption("fig", opts, line)
        source = self.source_line(opts, line)
        opts.finish(FIGURES_KEYS)
        self.emit(
            f'<figure class="fig group{classes}" id="{anchor}" style="width:{width};{margin}"><div class="fg" style="--cols:{cols}">'
            f'{"".join(cells)}</div>{cap}{source}</figure>'
        )

    # ---- tables ----------------------------------------------------------------------
    def dir_table(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known=TABLE_KEYS)
        self.table(Options.parse(head, self.report, line.where), rest, line)

    def table(self, opts, body, line):
        self.ensure_section(line)
        where = line.where
        src, sheet = opts.get("src") or opts.get("file") or opts.get("csv") or opts.get("data") or opts.get("path"), opts.get("sheet")
        aligns = None
        sizes, covered = {}, set()
        if src:
            path = resolve(src, self.bases)
            if path is None:
                self.report.error(where, f"table file not found: {src}")
                return
            try:
                rows = read_file(path, sheet)
            except Exception as error:
                self.report.error(where, f"cannot read {path.name}: {error}")
                return
        else:
            texts = [ln.text for ln in body]
            if any(t.strip().startswith("|") for t in texts):
                rows, aligns = parse_pipe(texts)
                rows, sizes, covered = merge_spans(rows, self.report, where)
            else:
                rows = read_delimited("\n".join(texts), "inline.csv")
        if not rows:
            self.report.error(where, "table is empty")
            return

        if sizes and any(opts.get(k) for k in ("transpose", "cols", "sort", "rows", "group")):
            self.report.error(where, "merged cells cannot be combined with transpose, cols, sort, rows or group")
            sizes, covered = {}, set()
        if opts.flag("transpose"):
            rows = [list(column) for column in zip(*rows)]
            aligns = None
        if opts.get("cols"):
            rows = pick_columns(rows, opts.get("cols"), self.report, where)
            aligns = None
        if opts.get("sort"):
            rows = sort_rows(rows, opts.get("sort"), self.report, where)
        if opts.get("rows"):
            rows = pick_rows(rows, opts.get("rows"), self.report, where)
        width_cols = max(len(r) for r in rows)
        rows = [r + [""] * (width_cols - len(r)) for r in rows]

        header_on = opts.flag("header", True)
        head_rows = max(1, int(opts.number("header-rows", 1))) if header_on else 0
        digits = decimals_map(opts.get("decimals"), rows[0], self.report, where)
        thousands = opts.flag("thousands")
        sci = decimals_map(opts.get("sci"), rows[0], self.report, where)
        grouped = int(opts.number("group-digits", 0))
        for r in range(head_rows, len(rows)):
            rows[r] = [format_cell(c, digits.get(i), thousands, sci.get(i), grouped) for i, c in enumerate(rows[r])]

        spec = (opts.get("align") or "").lower().replace(",", " ").split()
        names = {"l": "", "left": "", "c": "c", "center": "c", "r": "r", "right": "r"}
        if spec and len(spec) == 1:
            spec = spec * width_cols
        if spec and len(spec) != width_cols:
            self.report.error(where, f"align lists {len(spec)} columns but the table has {width_cols}")
            spec = []
        if spec:
            classes = [names.get(s, "") for s in spec]
        else:
            classes = []
            for i in range(width_cols):
                cells = [r[i] for r in rows[head_rows:] if r[i].strip()]
                numeric = cells and sum(is_number(c) for c in cells) >= 0.8 * len(cells)
                given = aligns[i] if aligns and i < len(aligns) and aligns[i] else None
                classes.append(names[given] if given else "r" if numeric else "")

        group = None
        if opts.get("group"):
            wanted = opts.get("group").strip().lower()
            heads = [h.strip().lower() for h in rows[0]]
            if wanted in heads:
                group = heads.index(wanted)
            else:
                self.report.error(where, f"group column '{opts.get('group')}' not found{suggest(wanted, heads)}")

        total = opts.flag("total")
        start = head_rows
        out = []

        def merged(r, i, tag, cls=""):
            if (r, i) in covered:
                return None
            rowspan, colspan = sizes.get((r, i), (1, 1))
            extra = ""
            if rowspan > 1:
                extra += f' rowspan="{rowspan}"'
                cls += " vm"
            if colspan > 1:
                extra += f' colspan="{colspan}"'
                cls += " sp"
            cls = cls.strip()
            return f'<{tag}{f" class={chr(34)}{cls}{chr(34)}" if cls else ""}{extra}>'

        if header_on:
            out.append("<thead>")
            for r in range(head_rows):
                tags = [merged(r, i, "th") for i in range(width_cols)]
                out.append("<tr>" + "".join(f"{t}{self.inline(rows[r][i], line)}</th>" for i, t in enumerate(tags) if t) + "</tr>")
            out.append("</thead>")
        out.append("<tbody>")
        previous = None
        runs = {}  # first row of each group -> how many rows the group spans
        if group is not None:
            r = start
            while r < len(rows):
                e = r
                while e + 1 < len(rows) and rows[e + 1][group] == rows[r][group]:
                    e += 1
                runs[r] = e - r + 1
                r = e + 1
        for r in range(start, len(rows)):
            row = rows[r]
            first = group is not None and (previous is None or row[group] != previous)
            cells = []
            for i, cell in enumerate(row):
                cls = classes[i]
                if group is not None and i == group:
                    if first:  # one merged cell per group, centred vertically
                        cells.append(f'<td class="k" rowspan="{runs[r]}">{self.inline(cell, line)}</td>')
                else:
                    opening = merged(r, i, "td", cls)
                    if opening:
                        cells.append(f"{opening}{self.inline(cell, line)}</td>")
            row_class = " ".join(c for c in ["first" if first else "", "total" if total and r == len(rows) - 1 else ""] if c)
            out.append(f'<tr{f" class={chr(34)}{row_class}{chr(34)}" if row_class else ""}>{"".join(cells)}</tr>')
            previous = row[group] if group is not None else None
        out.append("</tbody>")

        size = (opts.get("size") or "normal").lower()
        size_class = {"small": " sm", "tiny": " xs"}.get(size, "")
        width = opts.get("width")
        wrap, classes, _ = self.layout(opts, line, "place")
        edge = {"left": "0 auto 0 0", "right": "0 0 0 auto"}.get((opts.get("place") or "center").lower(), "0 auto")
        box = ""
        if wrap:
            style = "width:100%"
            box = f' style="width:{css_length(width, self.report, where) if width and width.lower() != "auto" else "40%"}"'
        elif width and width.lower() == "auto":
            style = f"width:auto;margin:{edge}"
        elif width:
            style = f"width:{css_length(width, self.report, where)};margin:{edge}"
        else:
            style = f"width:auto;min-width:62%;margin:{edge}" if width_cols <= 3 else ""
        breakable = " breakable" if opts.flag("split", len(rows) > 24) else ""
        anchor, cap, _ = self.caption("tbl", opts, line)
        source = self.source_line(opts, line)
        note = f'<div class="src">{self.inline(opts.get("note"), line)}</div>' if opts.get("note") else ""
        table_style = (opts.get("style") or "classic").lower()
        if table_style not in TABLE_STYLES:
            self.report.error(where, f"table style must be one of: {', '.join(sorted(TABLE_STYLES))}")
            table_style = "classic"
        opts.finish(TABLE_KEYS)
        self.emit(
            f'<figure class="tbl{breakable}{classes}" id="{anchor}"{box}>{cap}<table class="data{size_class} table-{table_style}"'
            f'{f" style={chr(34)}{style}{chr(34)}" if style else ""}>{"".join(out)}</table>{source}{note}</figure>'
        )

    # ---- code ------------------------------------------------------------------------
    def dir_code(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, src=True)
        opts = Options.parse(head, self.report, line.where)
        language = args.split()[0] if args.split() else ""
        self.code_block(opts, [ln.text for ln in rest], line, language, {})

    def code_block(self, opts, body, line, language, attrs):
        from . import code as codemod

        self.ensure_section(line)
        where = line.where
        src = opts.get("src") or opts.get("file") or opts.get("path")
        language = opts.get("lang") or opts.get("language") or language
        name = opts.get("name") or attrs.get("name") or attrs.get("file")
        start = 1
        highlight_spec = opts.get("highlight") or attrs.get("highlight")
        ident = opts.get("id") or attrs.get("id", "")
        if opts.get("caption") is None and attrs.get("caption"):
            opts.pairs.append(["caption", attrs["caption"]])
        if ident and not opts.get("id"):
            opts.pairs.append(["id", ident])

        if src:
            path = resolve(src, self.bases)
            if path is None:
                self.report.error(where, f"code file not found: {src}")
                return
            text = path.read_text(encoding="utf-8", errors="replace")
            name = name or path.name
            guess_name = path.name
        else:
            text = "\n".join(body)
            guess_name = name
            name = name or (language or "code")
        parts, label = codemod.highlight(text, guess_name if not language else None, language or None)
        total = len(parts)
        first, last = 1, total
        if opts.get("lines"):
            try:
                picked = sorted(parse_range(opts.get("lines"), total))
                first, last = picked[0], picked[-1]
            except (ValueError, IndexError):
                self.report.error(where, f"bad lines '{opts.get('lines')}' (use e.g. 10-40)")
        start = int(opts.number("start", 1)) if not src else first
        shown = parts[first - 1: last]
        marks = set()
        if highlight_spec:
            try:
                marks = parse_range(highlight_spec, last + start)
            except ValueError:
                self.report.error(where, f"bad highlight '{highlight_spec}' (use e.g. 3, 7-9)")
        offset = (first - 1) if src else (start - 1)
        rows = [(n + offset + (0 if src else 0), p, (n + offset) in marks) for n, p in enumerate(shown, 1)]
        label = f"{label} · {len(shown)} lines" if (first, last) == (1, total) else f"{label} · lines {first}–{last} of {total}"
        numbers = opts.flag("numbers", True)
        caption_html, anchor = "", ""
        if opts.get("caption") is not None or ident:
            anchor, cap, _ = self.caption("code", opts, line)
            caption_html = cap.replace("figcaption", "div")
        opts.finish({"src", "file", "path", "lang", "language", "name", "lines", "highlight", "numbers", "caption", "id", "start"})
        self.emit(codemod.card(name, label, rows, "", anchor, numbers, caption_html))

    def dir_run(self, args, body, line):
        from . import code as codemod

        self.ensure_section(line)
        head, rest = self.split_options(body, src=True)
        opts = Options.parse(head, self.report, line.where)
        title = args.strip() or opts.get("title") or "Terminal"
        src = opts.get("src") or opts.get("file")
        if src:
            path = resolve(src, self.bases)
            if path is None:
                self.report.error(line.where, f"file not found: {src}")
                return
            lines = path.read_text(encoding="utf-8", errors="replace").splitlines()
            rows = [("", [html.escape(t)], False) for t in lines]
        else:
            texts = [ln.text.rstrip() for ln in rest]
            while texts and not texts[-1]:
                texts.pop()
            rows = codemod.terminal_rows(texts)
        anchor, caption_html = "", ""
        if opts.get("caption") is not None:
            anchor, cap, _ = self.caption("code", opts, line)
            caption_html = cap.replace("figcaption", "div")
        opts.finish({"src", "file", "title", "caption", "id"})
        self.emit(codemod.card("Terminal", title, rows, " term", anchor, True, caption_html))

    # ---- diagrams and charts ---------------------------------------------------------
    def layout(self, opts, line, key="align"):
        where = line.where
        wrap = (opts.get("wrap") or "").lower()
        if wrap not in {"", "left", "right", "no"}:
            self.report.error(where, f"wrap must be 'left', 'right' or 'no' (text flows around the block), not '{wrap}'")
            wrap = ""
        place = (opts.get(key) or "center").lower()
        if place not in {"left", "center", "right"}:
            self.report.error(where, f"{key} must be 'left', 'center' or 'right', not '{place}'")
            place = "center"
        wrap = "" if wrap == "no" else wrap
        classes = f" wrap wrap-{wrap}" if wrap else (f" al-{place}" if place != "center" else "")
        margin = "" if wrap else {"left": "margin-left:0;margin-right:auto;", "right": "margin-left:auto;margin-right:0;"}.get(place, "")
        return wrap, classes, margin

    def emit_figure(self, opts, line, inner, kind="kit", default_width="86%", key="align"):
        wrap, classes, margin = self.layout(opts, line, key)
        width = css_length(opts.get("width") or ("40%" if wrap else default_width), self.report, line.where) or default_width
        anchor, cap, _ = self.caption("fig", opts, line)
        source = self.source_line(opts, line)
        self.emit(f'<figure class="fig {kind}{classes}" id="{anchor}" style="width:{width};{margin}">{inner}{cap}{source}</figure>')
        return anchor

    def float_block(self, opts, line, placeholder, extra_class, placed=None, box=None):
        anchor, cap, _ = self.caption("fig", opts, line)
        source = self.source_line(opts, line)
        wrap, classes, margin = placed or self.layout(opts, line)
        style = f' style="width:{box}"' if box else ""
        self.emit(f'<figure class="fig {extra_class}{classes}" id="{anchor}"{style}>{placeholder}{cap}{source}</figure>')

    def diagram(self, source, opts, line, extra):
        self.ensure_section(line)
        placed = self.layout(opts, line)
        width = css_length(opts.get("width"), self.report, line.where) if opts.get("width") else None
        if placed[0] and not width:
            width = "40%"
        index = len(self.jobs)
        self.jobs.append({"kind": "mmd", "source": source, "width": "100%" if placed[0] else width, "share": width if placed[0] else None, "line": line.where})
        self.float_block(opts, line, f"<!--@SVG:{index}@-->", "diagram", placed, width if placed[0] else None)
        opts.finish(DIAGRAM_KEYS | extra)

    def dir_diagram(self, args, body, line):
        head, rest = self.split_options(body, known=DIAGRAM_KEYS)
        opts = Options.parse(head, self.report, line.where)
        source = "\n".join(ln.text for ln in rest).strip()
        if not source:
            self.report.error(line.where, "diagram is empty (write Mermaid code after a line containing only ---)")
        self.diagram(source, opts, line, set())

    def mermaid_block(self, name, body, line):
        head, rest = self.split_options(body, known=DIAGRAM_KEYS)
        opts = Options.parse(head, self.report, line.where)
        source = "\n".join(ln.text for ln in rest).strip()
        if not source:
            self.report.error(line.where, f"{name} needs Mermaid notation after a line containing only ---")
            return
        keyword = MERMAID_BLOCKS[name]
        if source.splitlines()[0].strip() != keyword:
            source = f"{keyword}\n{source}"
        self.diagram(source, opts, line, set())

    def science(self, kind, body, line, default_width):
        self.ensure_section(line)
        head, rest = self.split_options(body, known=SCIENCE_KEYS)
        opts = Options.parse(head, self.report, line.where)
        content = "\n".join(ln.text for ln in rest).strip()
        if kind == "molecule":
            content = opts.get("smiles") or content
            if not content:
                self.report.error(line.where, "molecule needs 'smiles: ...' (for example smiles: CC(=O)Oc1ccccc1C(=O)O)")
                return
        elif opts.get("src"):
            found = resolve(opts.get("src"), self.bases)
            if found is None:
                self.report.error(line.where, f"music file not found: {opts.get('src')}")
                return
            content = found.read_text(encoding="utf-8-sig")
        if not content:
            self.report.error(line.where, "music needs ABC notation (or 'src: tune.abc')")
            return
        wrap, classes, margin = self.layout(opts, line)
        width = css_length(opts.get("width") or ("40%" if wrap else default_width), self.report, line.where) or default_width
        if kind == "molecule":
            content = json.dumps({
                "smiles": content,
                "color": (opts.get("color") or "yes").lower() not in {"no", "off", "false"},
                "stereo": (opts.get("stereo") or "no").lower() in {"yes", "on", "true"},
            })
        index = len(self.jobs)
        self.jobs.append({"kind": kind, "source": content, "width": width, "line": line.where})
        anchor, cap, _ = self.caption("fig", opts, line)
        source = self.source_line(opts, line)
        opts.finish(SCIENCE_KEYS)
        self.emit(f'<figure class="fig science{classes}" id="{anchor}" style="width:{width};{margin}"><!--@SVG:{index}@-->{cap}{source}</figure>')

    def dir_molecule(self, args, body, line):
        self.science("molecule", body, line, "45%")

    def dir_music(self, args, body, line):
        self.science("music", body, line, "100%")

    def dir_map(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known=geo.MAP_KEYS)
        opts = Options.parse(head, self.report, line.where)
        built = geo.build_spec(self, opts, rest, line)
        if built is None:
            return
        spec, width = built
        wrap, classes, margin = self.layout(opts, line)
        anchor, cap, _ = self.caption("fig", opts, line)
        source = self.source_line(opts, line)
        opts.finish(geo.MAP_KEYS)
        index = len(self.jobs)
        self.jobs.append({"kind": "map", "spec": spec, "line": line.where})
        self.emit(f'<figure class="fig chart map{classes}" id="{anchor}" style="width:{width};{margin}"><!--@SVG:{index}@-->{cap}{source}</figure>')

    def dir_flow(self, args, body, line):
        head, rest = self.split_options(body, known=DIAGRAM_KEYS)
        opts = Options.parse(head, self.report, line.where)
        direction = (opts.get("direction") or "TD").upper()
        source = diagrams.flow_source([ln.text for ln in rest], direction, self.report, line.where)
        self.diagram(source, opts, line, set())

    def dir_mindmap(self, args, body, line):
        head, rest = self.split_options(body, known=DIAGRAM_KEYS)
        opts = Options.parse(head, self.report, line.where)
        self.diagram(diagrams.mindmap_source([ln.text for ln in rest], self.report, line.where), opts, line, set())

    def dir_tree(self, args, body, line):
        head, rest = self.split_options(body, known=DIAGRAM_KEYS)
        opts = Options.parse(head, self.report, line.where)
        direction = (opts.get("direction") or "TD").upper()
        self.diagram(diagrams.tree_source([ln.text for ln in rest], direction, self.report, line.where), opts, line, set())

    def dir_timeline(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known=DIAGRAM_KEYS)
        opts = Options.parse(head, self.report, line.where)
        rows = []
        for ln in rest:
            text = ln.text.strip()
            if not text or COMMENT.match(text):
                continue
            if text.startswith("#"):
                rows.append(f'<div class="tl-sec">{self.inline(text.lstrip("# ").strip(), line)}</div>')
                continue
            when, _, what = text.partition(":")
            if not what.strip():
                self.report.error(ln.where, f"timeline line needs 'when: what' but found: {text[:50]}")
                continue
            events = "".join(f"<div>{self.inline(e.strip(), line)}</div>" for e in what.split("|") if e.strip())
            rows.append(
                f'<div class="tl-row"><span class="tl-when">{self.inline(when.strip(), line)}</span>'
                f'<span class="tl-dot"></span><span class="tl-what">{events}</span></div>'
            )
        if not any('class="tl-row"' in r for r in rows):
            self.report.error(line.where, "timeline is empty (write lines like: 1976: Robert May publishes his paper)")
        title = f'<div class="tl-title">{self.inline(opts.get("title"), line)}</div>' if opts.get("title") else ""
        placed = self.layout(opts, line)
        box = css_length(opts.get("width") or "40%", self.report, line.where) if placed[0] else None
        self.float_block(opts, line, f'<div class="tl">{title}<div class="tl-body">{"".join(rows)}</div></div>', "timeline", placed, box)
        opts.finish(DIAGRAM_KEYS)

    def dir_grid(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known=GRID_KEYS)
        opts = Options.parse(head, self.report, line.where)
        cells, current = [], None
        for ln in rest:
            text = ln.text.strip()
            if not text or COMMENT.match(text):
                continue
            if text.endswith(":") and not text.startswith(("-", "*")):
                current = {"title": text[:-1], "items": [], "bullets": True}
                cells.append(current)
            elif current is None:
                self.report.error(ln.where, "start each box with a title line ending in a colon, e.g. 'Strengths:'")
                return
            else:
                bullet = text[:1] in "-*•" and text[1:2] == " "
                current["items"].append(text[2:].strip() if bullet else text)
                current["bullets"] = current["bullets"] and bullet
        cols = int(opts.number("cols", 2))
        html_cells = []
        for cell in cells:
            if cell["bullets"] and cell["items"]:
                items = "<ul>" + "".join(f"<li>{self.inline(t, line)}</li>" for t in cell["items"]) + "</ul>"
            else:
                items = "".join(f"<p>{self.inline(t, line)}</p>" for t in cell["items"])
            html_cells.append(f'<div class="gc"><div class="gh">{self.inline(cell["title"], line)}</div>{items}</div>')
        wrap, classes, margin = self.layout(opts, line)
        width = css_length(opts.get("width") or ("40%" if wrap else "100%"), self.report, line.where)
        anchor, cap, _ = self.caption("fig", opts, line)
        source = self.source_line(opts, line)
        opts.finish(GRID_KEYS)
        self.emit(
            f'<figure class="fig gridfig{classes}" id="{anchor}" style="width:{width};{margin}"><div class="gg" style="--cols:{cols}">'
            f'{"".join(html_cells)}</div>{cap}{source}</figure>'
        )

    dir_swot = dir_grid

    def dir_chart(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known=CHART_KEYS)
        opts = Options.parse(head, self.report, line.where)
        where = line.where
        kind = (opts.get("type") or "line").lower()
        kinds = {"line", "scatter", "bar", "hbar", "hist", "pie", "donut", "function"}
        if kind not in kinds:
            self.report.error(where, f"unknown chart type '{kind}'{suggest(kind, kinds)}; use one of: {', '.join(sorted(kinds))}")
            return
        wrap, classes, margin = self.layout(opts, line)
        width_css = css_length(opts.get("width") or ("40%" if wrap else self.cfg["image-width"]), self.report, where) or "86%"
        width_px = round(length_px(width_css, self.text_width_px()))
        ratio = opts.get("ratio")
        if ratio and ":" in ratio:
            a, b = ratio.split(":")
            ratio = float(a) / float(b)
        spec = {
            "type": kind, "width": width_px, "ratio": float(ratio) if ratio else None,
            "xlabel": latex_to_text(opts.get("xlabel")), "ylabel": latex_to_text(opts.get("ylabel")), "xlog": opts.flag("xlog"), "ylog": opts.flag("ylog"),
            "legend": (opts.get("legend") or "").lower() or None, "grid": opts.flag("grid", True),
            "lines": opts.flag("lines") if opts.get("lines") is not None else None,
            "markers": opts.flag("markers") if opts.get("markers") is not None else None,
            "labels": opts.flag("labels") if kind not in {"pie", "donut"} else (opts.get("labels") or "").lower() or None,
            "bins": int(opts.number("bins", 0)) or None, "alt": opts.get("caption") or "Chart",
            "hlines": [], "vlines": [],
        }
        for key in ("xmin", "xmax", "ymin", "ymax"):
            if opts.get(key) is not None:
                spec[key] = parse_number(opts.get(key))
        for axis, store in (("hline", "hlines"), ("vline", "vlines")):
            for value in opts.all(axis):
                number, _, label = value.partition("|")
                position = parse_number(number)
                if position is None:
                    self.report.error(where, f"'{axis}' needs a number, e.g. {axis}: 4.669 | limit")
                else:
                    spec[store].append({"v": position, "label": label.strip()})

        if kind == "function":
            formulas = []
            for value in opts.all("f") + opts.all("function"):
                for part in value.split(";"):
                    expr, _, label = part.partition("|")
                    if expr.strip():
                        formulas.append({"expr": expr.strip().removeprefix("y=").removeprefix("y =").strip(), "name": label.strip() or None})
            domain = re.split(r"\s*(?:\.\.|,|\bto\b)\s*", opts.get("domain") or "-10..10")
            low, high = (parse_number(domain[0]), parse_number(domain[-1])) if len(domain) >= 2 else (None, None)
            if not formulas:
                self.report.error(where, "function chart needs 'f: sin(x)'")
            if low is None or high is None or low >= high:
                self.report.error(where, "function chart 'domain' must look like -6.28..6.28")
                return
            spec["functions"], spec["domain"] = formulas, [low, high]
            spec.setdefault("xmin", low)
            spec.setdefault("xmax", high)
        else:
            src = opts.get("src") or opts.get("file") or opts.get("csv") or opts.get("data") or opts.get("path")
            if src:
                path = resolve(src, self.bases)
                if path is None:
                    self.report.error(where, f"chart data file not found: {src}")
                    return
                try:
                    rows = read_file(path, opts.get("sheet"))
                except Exception as error:
                    self.report.error(where, f"cannot read {path.name}: {error}")
                    return
            else:
                texts = [ln.text for ln in rest]
                rows = parse_pipe(texts)[0] if any(t.strip().startswith("|") for t in texts) else read_delimited("\n".join(texts), "inline.csv")
            if len(rows) < 2:
                self.report.error(where, "chart has no data (give 'src: file.csv' or put a table after ---)")
                return
            spec["series"] = self.chart_series(rows, opts, kind, where)
            if spec["series"] is None:
                return

        anchor, cap, _ = self.caption("fig", opts, line)
        source = self.source_line(opts, line)
        opts.finish(CHART_KEYS)
        spec = {k: v for k, v in spec.items() if v is not None}
        index = len(self.jobs)
        self.jobs.append({"kind": "chart", "spec": spec, "line": where, "width": width_css})
        self.emit(f'<figure class="fig chart{classes}" id="{anchor}" style="width:{width_css};{margin}"><!--@SVG:{index}@-->{cap}{source}</figure>')

    def chart_series(self, rows, opts, kind, where):
        header = [h.strip() for h in rows[0]]
        lookup = {h.lower(): i for i, h in enumerate(header)}

        def column(name):
            key = name.strip().lower()
            if key in lookup:
                return lookup[key]
            if key.isdigit() and 1 <= int(key) <= len(header):
                return int(key) - 1
            self.report.error(where, f"chart column '{name}' not found{suggest(key, lookup)}; columns are: {', '.join(header)}")
            return None

        xi = column(opts.get("x") or "1")
        if xi is None:
            return None
        ys = []
        if opts.get("y"):
            for part in re.split(r"\s*,\s*", opts.get("y")):
                name, _, label = part.partition("=")
                idx = column(name)
                if idx is None:
                    return None
                ys.append((idx, label.strip() or header[idx]))
        else:
            for i, h in enumerate(header):
                if i != xi:
                    values = [to_float(r[i]) for r in rows[1:] if i < len(r) and r[i].strip()]
                    if values and all(v is not None for v in values):
                        ys.append((i, h))
        if kind == "hist" and not ys:
            ys = [(xi, header[xi])]
        if not ys:
            self.report.error(where, "chart has no numeric columns to plot")
            return None
        body = rows[1:]
        series = []
        for idx, label in ys:
            yv = [to_float(r[idx]) if idx < len(r) else None for r in body]
            labels = [r[xi] if xi < len(r) else "" for r in body]
            xv = [to_float(t) for t in labels]
            categorical = kind in {"bar", "hbar", "pie", "donut"} or any(v is None for v in xv)
            series.append({
                "name": label, "y": [v if v is not None else None for v in yv],
                "x": [None if categorical else v for v in xv] if categorical else xv, "xlabels": labels,
            })
        if kind in {"bar", "hbar", "pie", "donut"}:
            for s in series:
                s["x"] = [None] * len(s["y"])
        return series

    # ---- finishing -------------------------------------------------------------------
    def run_jobs(self, html_text, font, font_css=""):
        charts = [(i, j) for i, j in enumerate(self.jobs) if j["kind"] == "chart"]
        mmd = [(i, j) for i, j in enumerate(self.jobs) if j["kind"] == "mmd"]
        maps = [(i, j) for i, j in enumerate(self.jobs) if j["kind"] == "map"]
        svgs = {}
        if maps:
            try:
                results = diagrams.render_maps([j["spec"] for _, j in maps])
            except Exception as error:
                results = [{"error": str(error)}] * len(maps)
            for (i, job), result in zip(maps, results):
                if "error" in result:
                    self.report.error(job["line"], f"map failed: {result['error']}")
                    continue
                svgs[i] = result["svg"]
                for message in result.get("warnings", []):
                    self.report.warn(job["line"], f"map: {message}")
        for kind, render in (("music", science.render_music), ("molecule", science.render_molecules)):
            todo = [(i, j) for i, j in enumerate(self.jobs) if j["kind"] == kind]
            if not todo:
                continue
            try:
                results = render([j["source"] for _, j in todo])
            except Exception as error:
                results = [(False, str(error))] * len(todo)
            for (i, job), (ok, result) in zip(todo, results):
                if ok:
                    svgs[i] = result
                else:
                    self.report.error(job["line"], f"{kind} failed: {result}")
        if charts:
            try:
                results = diagrams.render_charts([j["spec"] for _, j in charts])
            except Exception as error:
                results = [{"error": str(error)}] * len(charts)
            for (i, job), result in zip(charts, results):
                if "error" in result:
                    self.report.error(job["line"], f"chart failed: {result['error']}")
                else:
                    svgs[i] = result["svg"]
        if mmd:
            try:
                results = diagrams.render_mermaid([j["source"] for _, j in mmd], font, font_css, self.zoom())
            except Exception as error:
                results = [(False, str(error))] * len(mmd)
            for (i, job), (ok, svg) in zip(mmd, results):
                if not ok:
                    detail = " | ".join(s.strip() for s in svg.strip().splitlines()[:4] if s.strip())[:260] or "unknown error"
                    self.report.error(job["line"], f"diagram failed (line numbers below count from the first diagram line): {detail}")
                    continue
                try:
                    svgs[i] = diagrams.clean_svg(svg, f"mmd{i}", job["width"])
                except Exception as error:
                    self.report.error(job["line"], f"diagram could not be read: {error}")
                    continue
                self.check_diagram_text(svgs[i], job)
        return re.sub(r"<!--@SVG:(\d+)@-->", lambda m: svgs.get(int(m.group(1)), '<div class="missing">diagram failed</div>'), html_text)

    def zoom(self):
        try:
            return max(0.5, min(2.0, float(self.cfg.get("font-size", "11")) / 12))
        except ValueError:
            return 11 / 12

    def check_diagram_text(self, svg, job):
        """Warn when a diagram is shrunk so far that its 15px labels print too small to read."""
        view = re.search(r'viewBox="[-\d.]+ [-\d.]+ ([\d.]+) [\d.]+"', svg)
        if not view:
            return
        natural = float(view.group(1))
        shown = self.text_width_px()
        share = job.get("share") or job["width"]
        if share and share.endswith("%"):
            shown *= float(share[:-1]) / 100
        try:
            zoom = float(self.cfg.get("font-size", "11")) / 12
        except ValueError:
            zoom = 11 / 12
        points = 15 * 0.75 * min(zoom, shown / natural)
        if points < 8.5:
            self.report.warn(
                job["line"],
                f"this diagram is too wide for the page, so its text prints at only about {points:.0f} pt (hard to read). "
                "Use 'direction: TD' (top to bottom), fewer boxes in a row, or shorter labels",
            )

    def resolve_refs(self, text):
        known = {}
        for (kind, ident) in self.registry:
            known.setdefault(kind, []).append(ident)

        def fix(match):
            kind, ident = match.group(1), match.group(2)
            hit = self.registry.get((kind, ident))
            if hit is None:
                return f'<span class="bad">[{kind}:{ident}?]</span>'
            return f'<a class="xref" href="#{hit[1]}">{hit[0]}</a>'

        for kind, ident, where in self.refs:
            if (kind, ident) in self.registry:
                self.cited.add((kind, ident))
            else:
                self.report.error(where, f"reference @{kind}:{ident} does not exist{suggest(ident, known.get(kind, []))}"
                                  + (f" (known {kind} ids: {', '.join(known[kind])})" if kind in known else f" (no {kind} has an id yet)"))
        return re.sub(r"\x01(\w+):([\w-]+)\x01", fix, text)

    def list_of(self, kind):
        entries = self.lists[kind]
        rows = "".join(
            f'<a class="lo" href="#{anchor}"><span class="n">{label}</span><span class="t">{cap}</span>'
            f'<span class="dots"></span><span class="pg">@PG:{anchor}@</span></a>'
            for label, anchor, cap in entries
        )
        return f'<nav class="toc lof">{rows}</nav>' if rows else ""

    def build(self):
        lines = self.load(self.path)
        lines = self.front_matter(lines)
        assets = self.cfg.get("assets")
        if assets:
            folder = Path(assets.strip("\"'"))
            if folder.is_dir():
                self.bases.append(folder)
            else:
                self.report.warn(self.path.name, f"assets folder not found: {assets}")
        if not self.cfg.get("title") and not self.cfg.get("question"):
            self.report.warn(self.path.name, "no title: add 'title:' to the settings at the top")

        self.load_source_file()
        self.cover()
        self.contents()
        self.emit_top(self.parse_blocks(lines))
        self.flush_notes(True, self.last_line)
        self.close_section()
        if self.wc_started and not self.wc_ended and not self.manual_wc:
            self.emit("<!--WC-END-->")
        self.emit(self.notes_pages())

        text = self.resolve_cites("".join(self.out))
        text = text.replace("<!--LOF-->", self.list_of("fig")).replace("<!--LOT-->", self.list_of("tbl"))
        text = self.resolve_refs(text)
        for (kind, ident), (label, anchor) in self.registry.items():
            if kind in {"fig", "tbl"} and (kind, ident) not in self.cited:
                self.report.warn(self.path.name, f"{label} (id '{ident}') is never mentioned in the text; refer to it with @{kind}:{ident}")

        title = plain(self.cfg.get("title") or self.cfg.get("question") or self.path.stem)
        head = (
            f'<head><meta charset="utf-8"><title>{escape(title)}</title>'
            f'<meta name="font" content="{attr(self.cfg["font"])}">'
            f'<meta name="page-numbering" content="{attr(self.cfg["page-numbering"].lower())}">'
            f'<meta name="numbers" content="{attr(self.cfg["numbers"].lower())}"></head>'
        )
        return head, text, title


def compile_text(path, source_text=None, studio=False):
    report = Report()
    compiler = Compiler(path, report, source_text, studio)
    head, body, title = compiler.build()
    return compiler, head, body, title, report
