import posixpath
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
A = "http://schemas.openxmlformats.org/drawingml/2006/main"
WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
V = "urn:schemas-microsoft-com:vml"
M = "http://schemas.openxmlformats.org/officeDocument/2006/math"
PKG = "http://schemas.openxmlformats.org/package/2006/relationships"
DC = "http://purl.org/dc/elements/1.1/"
IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"}
TEXT_WIDTH_CM = 16.0


def w(tag):
    return f"{{{W}}}{tag}"


def on(element, tag):
    found = element.find(w(tag)) if element is not None else None
    if found is None:
        return False
    value = found.get(w("val"))
    return value not in {"0", "false", "none", "off"}


def escape(text):
    text = text.replace("\\", "\\\\")
    for char in "*_[@$":
        text = text.replace(char, "\\" + char)
    return text


class Converter:
    def __init__(self, path, images):
        self.zip = zipfile.ZipFile(path)
        self.images = images
        self.saved = {}
        self.notes = []
        self.note_ids = {}
        self.blocks = []
        self.settings = {}
        self.warnings = []
        self.math = 0
        self.caption = None
        self.styles = self.read_styles()
        self.numbering = self.read_numbering()
        self.rels = self.read_rels("word/_rels/document.xml.rels")
        self.footnotes = self.read_footnotes()

    def xml(self, name):
        try:
            return ET.fromstring(self.zip.read(name))
        except KeyError:
            return None

    def read_rels(self, name):
        root = self.xml(name)
        rels = {}
        if root is None:
            return rels
        for rel in root.findall(f"{{{PKG}}}Relationship"):
            rels[rel.get("Id")] = (rel.get("Target"), rel.get("TargetMode") == "External")
        return rels

    def read_styles(self):
        root = self.xml("word/styles.xml")
        styles = {}
        if root is None:
            return styles
        for style in root.findall(w("style")):
            name_node = style.find(w("name"))
            name = (name_node.get(w("val")) if name_node is not None else "").lower()
            outline = style.find(f"{w('pPr')}/{w('outlineLvl')}")
            based = style.find(w("basedOn"))
            styles[style.get(w("styleId"))] = {
                "name": name,
                "outline": int(outline.get(w("val"))) if outline is not None else None,
                "based": based.get(w("val")) if based is not None else None,
            }
        return styles

    def read_numbering(self):
        root = self.xml("word/numbering.xml")
        formats, numbers = {}, {}
        if root is None:
            return numbers
        for abstract in root.findall(w("abstractNum")):
            levels = {}
            for level in abstract.findall(w("lvl")):
                fmt = level.find(w("numFmt"))
                levels[int(level.get(w("ilvl")))] = fmt.get(w("val")) if fmt is not None else "bullet"
            formats[abstract.get(w("abstractNumId"))] = levels
        for num in root.findall(w("num")):
            ref = num.find(w("abstractNumId"))
            if ref is not None:
                numbers[num.get(w("numId"))] = formats.get(ref.get(w("val")), {})
        return numbers

    def read_footnotes(self):
        root = self.xml("word/footnotes.xml")
        notes = {}
        if root is None:
            return notes
        for note in root.findall(w("footnote")):
            if note.get(w("type")) in {"separator", "continuationSeparator", "continuationNotice"}:
                continue
            notes[note.get(w("id"))] = note
        return notes

    def style_of(self, paragraph):
        node = paragraph.find(f"{w('pPr')}/{w('pStyle')}")
        return node.get(w("val")) if node is not None else None

    def kind_of(self, style_id):
        seen = set()
        while style_id and style_id not in seen:
            seen.add(style_id)
            style = self.styles.get(style_id)
            if not style:
                break
            name = style["name"]
            match = re.fullmatch(r"heading (\d)", name)
            if match:
                return f"h{min(int(match.group(1)), 3)}"
            if name in {"title", "subtitle", "caption", "quote", "intense quote"}:
                return name.replace("intense ", "")
            if name.startswith("toc") or name == "toc heading":
                return "toc"
            if style["outline"] is not None and style["outline"] < 9:
                return f"h{min(style['outline'] + 1, 3)}"
            style_id = style["based"]
        lowered = (style_id or "").lower()
        match = re.fullmatch(r"heading(\d)", lowered)
        return f"h{min(int(match.group(1)), 3)}" if match else "p"

    def image(self, rel_id, extent):
        target = self.rels.get(rel_id)
        if not target or target[1]:
            return None
        member = posixpath.normpath(posixpath.join("word", target[0])).lstrip("/")
        suffix = Path(member).suffix.lower()
        if suffix not in IMAGE_TYPES:
            self.warnings.append(f"skipped a picture in an unsupported format ({suffix or 'unknown'})")
            return None
        if member not in self.saved:
            try:
                data = self.zip.read(member)
            except KeyError:
                return None
            self.images.mkdir(parents=True, exist_ok=True)
            name = f"image{len(self.saved) + 1}{suffix}"
            (self.images / name).write_bytes(data)
            self.saved[member] = name
        width = None
        if extent:
            width = max(10, min(100, round(extent / 360000 / TEXT_WIDTH_CM * 100)))
        return {"src": f"images/{self.saved[member]}", "width": width}

    def pictures(self, run):
        found = []
        for drawing in run.iter(w("drawing")):
            extent = drawing.find(f".//{{{WP}}}extent")
            size = int(extent.get("cx")) if extent is not None else None
            for blip in drawing.iter(f"{{{A}}}blip"):
                picture = self.image(blip.get(f"{{{R}}}embed"), size)
                if picture:
                    found.append(picture)
        for data in run.iter(f"{{{V}}}imagedata"):
            picture = self.image(data.get(f"{{{R}}}id"), None)
            if picture:
                found.append(picture)
        return found

    def run_style(self, run):
        props = run.find(w("rPr"))
        vert = props.find(w("vertAlign")) if props is not None else None
        vert = vert.get(w("val")) if vert is not None else ""
        return (
            on(props, "b"),
            on(props, "i"),
            on(props, "u"),
            on(props, "strike") or on(props, "dstrike"),
            vert == "superscript",
            vert == "subscript",
        )

    def inline(self, container, plain=False, state=None):
        state = state if state is not None else {"pictures": [], "page_break": False}
        pieces = []

        def add(text, style, link=None):
            if not text:
                return
            if pieces and pieces[-1][1] == style and pieces[-1][2] == link:
                pieces[-1] = (pieces[-1][0] + text, style, link)
            else:
                pieces.append((text, style, link))

        def walk(node, link=None):
            for child in node:
                tag = child.tag
                if tag == w("r"):
                    style = (False,) * 6 if plain else self.run_style(child)
                    for part in child:
                        if part.tag == w("t"):
                            add(escape(part.text or ""), style, link)
                        elif part.tag == w("tab"):
                            add(" ", style, link)
                        elif part.tag == w("noBreakHyphen"):
                            add("-", style, link)
                        elif part.tag == w("br"):
                            if part.get(w("type")) == "page":
                                state["page_break"] = True
                            else:
                                add("\\\\\n", (False,) * 6, link)
                        elif part.tag == w("footnoteReference") and not plain:
                            add(self.note_mark(part.get(w("id"))), (False,) * 6, None)
                    state["pictures"].extend(self.pictures(child))
                elif tag == w("hyperlink"):
                    target = self.rels.get(child.get(f"{{{R}}}id"))
                    walk(child, target[0] if target and target[1] and not plain else link)
                elif tag in {w("smartTag"), w("ins"), w("fldSimple"), w("sdt"), w("sdtContent"), w("customXml")}:
                    walk(child, link)
                elif tag in {f"{{{M}}}oMath", f"{{{M}}}oMathPara"}:
                    text = "".join(t.text or "" for t in child.iter(f"{{{M}}}t"))
                    if text:
                        self.math += 1
                        add(escape(text), (False,) * 6, link)

        walk(container)
        out = []
        for text, style, link in pieces:
            out.append(self.wrap(text, style, link))
        return "".join(out).strip(), state

    def wrap(self, text, style, link):
        lead = text[: len(text) - len(text.lstrip(" "))]
        tail = text[len(text.rstrip(" ")) :]
        core = text.strip(" ")
        if not core:
            return text
        bold, italic, underline, strike, sup, sub = style
        if underline or strike or sup or sub:
            flags = [name for name, flag in (("bold", bold), ("italic", italic), ("underline", underline), ("strike", strike), ("sup", sup), ("sub", sub)) if flag]
            core = f"[{core}]{{{' '.join(flags)}}}"
        elif bold and italic:
            core = f"***{core}***"
        elif bold:
            core = f"**{core}**"
        elif italic:
            core = f"*{core}*"
        if link:
            core = f"[{core}]({link})"
        return f"{lead}{core}{tail}"

    def note_mark(self, ident):
        if ident not in self.note_ids:
            note = self.footnotes.get(ident)
            if note is None:
                return ""
            number = len(self.notes) + 1
            self.note_ids[ident] = number
            text = " ".join(self.inline(p)[0] for p in note.findall(w("p"))).strip()
            self.notes.append(f"[^{number}]: {text}")
        return f"[^{self.note_ids[ident]}]"

    def list_prefix(self, paragraph):
        num = paragraph.find(f"{w('pPr')}/{w('numPr')}")
        if num is None:
            return None
        num_id = num.find(w("numId"))
        level = num.find(w("ilvl"))
        num_id = num_id.get(w("val")) if num_id is not None else None
        if num_id in {None, "0"}:
            return None
        depth = int(level.get(w("val"))) if level is not None else 0
        fmt = self.numbering.get(num_id, {}).get(depth, "bullet")
        return num_id, "  " * depth + ("- " if fmt in {"bullet", "none"} else "1. ")

    def push(self, text, kind="block"):
        self.blocks.append((kind, text))

    def flush_caption(self):
        if self.caption:
            self.push(self.caption)
            self.caption = None

    def paragraph(self, paragraph):
        props = paragraph.find(w("pPr"))
        if on(props, "pageBreakBefore") and self.blocks:
            self.flush_caption()
            self.push(":::pagebreak")
        kind = self.kind_of(self.style_of(paragraph))
        if kind == "toc":
            self.settings["contents"] = "yes"
            return
        plain = kind in {"h1", "h2", "h3", "title", "subtitle"}
        text, state = self.inline(paragraph, plain=plain)
        text = text.replace("\\\\\n", " ").strip() if plain else text
        if kind == "title" and text and "title" not in self.settings:
            self.settings["title"] = text.replace("\\", "")
        elif kind == "subtitle" and text and "subtitle" not in self.settings:
            self.settings["subtitle"] = text.replace("\\", "")
        elif kind in {"h1", "h2", "h3"} and text:
            if re.fullmatch(r"(table of )?contents", text, re.I):
                self.settings["contents"] = "yes"
            else:
                self.flush_caption()
                self.push(f"{'#' * int(kind[1])} {text}")
        elif kind == "caption" and text:
            clean = re.sub(r"^(figure|fig\.?|table)\s*\d+[.:]?\s*", "", text, flags=re.I)
            last = self.blocks[-1] if self.blocks else None
            if last and last[0] == "figure" and "caption" not in last[1]:
                self.blocks[-1] = ("figure", {**last[1], "caption": clean})
            elif re.match(r"table", text, re.I):
                self.caption = f"Table: {clean}"
            else:
                self.push(f"*{clean}*")
        elif text:
            self.flush_caption()
            listed = self.list_prefix(paragraph)
            if listed:
                self.push(listed[1] + text.replace("\\\\\n", " "), f"item:{listed[0]}")
            elif kind == "quote":
                self.push("\n".join(f"> {line}" for line in text.split("\n")))
            else:
                if text.startswith("#"):
                    text = "\\" + text
                elif re.match(r"(>|- |\d+[.)] |:::|%%|// )", text):
                    text = "​" + text
                self.push(text)
        for picture in state["pictures"]:
            self.flush_caption()
            self.push(picture, "figure")
        if state["page_break"]:
            self.flush_caption()
            self.push(":::pagebreak")

    def table(self, table):
        rows = []
        for row in table.findall(w("tr")):
            cells = []
            for cell in row.findall(w("tc")):
                text = " ".join(self.inline(p)[0] for p in cell.findall(w("p"))).replace("|", "/")
                text = text.replace("\\\\\n", " ").replace("\n", " ").strip()
                props = cell.find(w("tcPr"))
                span = props.find(w("gridSpan")) if props is not None else None
                cells.append(text)
                for _ in range(int(span.get(w("val"))) - 1 if span is not None else 0):
                    cells.append("")
            if cells:
                rows.append(cells)
        if not rows:
            return
        width = max(len(r) for r in rows)
        rows = [r + [""] * (width - len(r)) for r in rows]
        lines = [f"| {' | '.join(c or ' ' for c in rows[0])} |", "|" + "---|" * width]
        lines += [f"| {' | '.join(c or ' ' for c in r)} |" for r in rows[1:]]
        if self.caption:
            lines.insert(0, self.caption)
            self.caption = None
        self.push("\n".join(lines))

    def walk_body(self, node):
        for child in node:
            if child.tag == w("p"):
                self.paragraph(child)
            elif child.tag == w("tbl"):
                self.table(child)
            elif child.tag == w("sdt"):
                gallery = child.find(f".//{w('docPartGallery')}")
                if gallery is not None and "contents" in (gallery.get(w("val")) or "").lower():
                    self.settings["contents"] = "yes"
                    continue
                content = child.find(w("sdtContent"))
                if content is not None:
                    self.walk_body(content)

    def convert(self, fallback_title):
        root = self.xml("word/document.xml")
        if root is None:
            raise ValueError("This file is not a Word document")
        body = root.find(w("body"))
        self.walk_body(body)
        self.flush_caption()
        if "title" not in self.settings:
            core = self.xml("docProps/core.xml")
            node = core.find(f"{{{DC}}}title") if core is not None else None
            self.settings["title"] = (node.text or "").strip() if node is not None and node.text else fallback_title
        if self.math:
            self.warnings.append(f"{self.math} equation(s) came in as plain text; retype them with the Equation block")
        return self.render()

    def render(self):
        head = [f"title: {self.settings['title']}"]
        if self.settings.get("subtitle"):
            head.append(f"subtitle: {self.settings['subtitle']}")
        head += ["cover: no", f"contents: {self.settings.get('contents', 'no')}", "---", ""]
        out = []
        previous = None
        for kind, block in self.blocks:
            if kind == "figure":
                lines = [":::figure", f"src: {block['src']}"]
                if block.get("caption"):
                    lines.append(f"caption: {block['caption']}")
                if block.get("width"):
                    lines.append(f"width: {block['width']}%")
                lines.append(":::")
                block = "\n".join(lines)
            if block == ":::pagebreak" and previous == ":::pagebreak":
                continue
            if kind.startswith("item") and out and out[-1][0] == kind:
                out[-1] = (kind, out[-1][1] + "\n" + block)
            else:
                out.append((kind, block))
            previous = block
        while out and out[-1][1] == ":::pagebreak":
            out.pop()
        text = "\n".join(head) + "\n" + "\n\n".join(block for _, block in out) + "\n"
        if self.notes:
            text += "\n" + "\n".join(self.notes) + "\n"
        return text


def import_docx(source, folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    stem = folder.name
    converter = Converter(source, folder / "images")
    try:
        text = converter.convert(stem)
    finally:
        converter.zip.close()
    target = folder / f"{stem}.txt"
    target.write_text(text, encoding="utf-8")
    return target, converter.warnings
