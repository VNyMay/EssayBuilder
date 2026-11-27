import copy
import io
import json
import os
import re
import shutil
import subprocess
import tempfile
from contextlib import contextmanager
from html import escape as html_escape
from pathlib import Path
from urllib.parse import unquote, urlparse
from urllib.request import url2pathname

from docx import Document
from docx.opc.constants import CONTENT_TYPE as CT
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from docx.opc.packuri import PackURI
from docx.opc.part import XmlPart
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn
from docx.shared import Emu, Pt
from lxml import etree
from lxml import html as lhtml

from . import fonts
from .labels import latex_to_text
from .util import PAPERS

ENGINE = Path(__file__).resolve().parent.parent
DECLS = nsdecls("w", "r", "m")
MATH_NS = "http://schemas.openxmlformats.org/officeDocument/2006/math"
MATHML_NS = "http://www.w3.org/1998/Math/MathML"
DPI = 220
DOLLAR = "\ue001"
PLAIN = "\ue000"
MATH = re.compile(r"\$\$([\s\S]+?)\$\$|\$([^$]+?)\$")
MARK = re.compile(r"@@B(\d+)@@")
LABEL = re.compile(r"^\s*(Figure|Table|Listing)\s+([A-Z]?)(\d+)\s*(:?)\s*$")
OFF = {"no", "off", "false", "none"}
INK, MUTE, RULE, HAIR, SOFT = "141414", "5D5D58", "141414", "CFCFC8", "F4F4F0"
SKIP_MATH = {"pre", "code", "svg", "style", "script", "template"}
CODE_COLORS = {
    **dict.fromkeys(("k", "kn", "kd", "kr", "ow", "sa"), ("8839EF", False)),
    "kc": ("D9590B", False),
    **dict.fromkeys(("nf", "fm"), ("1E66F5", False)),
    "nc": ("B45309", False),
    **dict.fromkeys(("nb", "bp"), ("C4314B", False)),
    "nn": ("0F7B8A", False),
    **dict.fromkeys(("s", "s1", "s2", "sb", "sc", "sd", "sh", "dl"), ("3A8F26", False)),
    "si": ("C33B9A", False),
    "se": ("179299", False),
    **dict.fromkeys(("mi", "mf", "m", "mh", "mo", "il"), ("D9590B", False)),
    "o": ("1B8FC0", False),
    "p": ("6C6F85", False),
    **dict.fromkeys(("c", "c1", "cm", "ch"), ("8C8FA1", True)),
    "nd": ("DF8E1D", False),
    "pc": ("6B7A72", False),
}
TONES = {
    "adm-tip": ("2E7D32", "F0F7F1"),
    "adm-warning": ("B26A00", "FDF5E6"),
    "adm-info": ("1F6FA5", "EFF6FB"),
    "adm-important": ("B00020", "FBEFF1"),
}
BULLETS = ("\u2022", "\u25e6", "\u25aa")
FORMATS = {"D": "decimal", "r": "lowerRoman", "R": "upperRoman", "a": "lowerLetter", "A": "upperLetter"}
ORDERS = {
    "pPr": (
        "pStyle keepNext keepLines pageBreakBefore framePr widowControl numPr suppressLineNumbers pBdr shd tabs "
        "suppressAutoHyphens kinsoku wordWrap overflowPunct topLinePunct autoSpaceDE autoSpaceDN bidi adjustRightInd "
        "snapToGrid spacing ind contextualSpacing mirrorIndents suppressOverlap jc textDirection textAlignment "
        "textboxTightWrap outlineLvl divId cnfStyle rPr sectPr pPrChange"
    ).split(),
    "sectPr": (
        "headerReference footerReference footnotePr endnotePr type pgSz pgMar paperSrc pgBorders lnNumType pgNumType "
        "cols formProt vAlign noEndnote titlePg textDirection bidi rtlGutter docGrid printerSettings sectPrChange"
    ).split(),
    "settings": (
        "updateFields hdrShapeDefaults footnotePr endnotePr compat docVars rsids mathPr attachedSchema themeFontLang "
        "clrSchemeMapping doNotIncludeSubdocsInStats doNotAutoCompressPictures forceUpgrade captions "
        "readModeInkLockDown smartTagType schemaLibrary shapeDefaults doNotEmbedSmartTags decimalSymbol listSeparator"
    ).split(),
}
MATH_JS = r"""
const fs = require('fs');
const katex = require('katex');
require('katex/dist/contrib/mhchem.js');
const AsciiMath = require('asciimath2tex');
const ascii = new (AsciiMath.default || AsciiMath)();
const UNICODE = {
  '²': '^2', '³': '^3', '¹': '^1', '⁰': '^0', '⁴': '^4', '⁵': '^5', '⁶': '^6', '⁷': '^7', '⁸': '^8', '⁹': '^9',
  '√': ' sqrt ', '×': ' xx ', '÷': ' -: ', '≤': ' <= ', '≥': ' >= ', '≠': ' != ', '∞': ' oo ', '±': ' +- ',
  '→': ' -> ', '⇒': ' => ', '·': ' * ', '−': '-', '∑': ' sum ', '∫': ' int ', '∈': ' in ', '∉': ' !in ',
  '⊂': ' subset ', '∪': ' cup ', '∩': ' cap ', '≈': ' ~~ ', '°': '^@',
};
const RELATIONS = ['\\le', '\\ge', '\\ne', '\\approx', '\\equiv', '\\sim', '\\to', '\\Rightarrow', '\\in', '='];
function relationAt(tex) {
  let depth = 0;
  for (let i = 0; i < tex.length; i += 1) {
    const c = tex[i];
    if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (depth === 0) {
      const hit = RELATIONS.find((r) => tex.startsWith(r, i) && !/[A-Za-z]/.test(tex[i + r.length] || ''));
      if (hit) return i;
    }
  }
  return -1;
}
function fromPlain(source) {
  const lines = source.split('\n').map((line) => line.trim()).filter(Boolean)
    .map((line) => ascii.parse(line.replace(/[²³¹⁰⁴⁵⁶⁷⁸⁹√×÷≤≥≠∞±→⇒·−∑∫∈∉⊂∪∩≈°]/g, (c) => UNICODE[c])));
  if (lines.length < 2) return lines[0] || '';
  const rows = lines.map((line) => {
    const at = relationAt(line);
    return at <= 0 ? `&${line}` : `${line.slice(0, at)}&${line.slice(at)}`;
  });
  return `\\begin{aligned}${rows.join(' \\\\[3pt] ')}\\end{aligned}`;
}
const items = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
const out = items.map(([source, display]) => {
  try {
    let tex = source.trim();
    if (tex.startsWith('\uE000')) tex = fromPlain(tex.slice(1));
    return katex.renderToString(tex, { displayMode: display, output: 'mathml', throwOnError: true, strict: 'ignore' });
  } catch (error) {
    return null;
  }
});
fs.writeFileSync(process.argv[2], JSON.stringify(out));
"""


def twips(pt):
    return str(int(round(pt * 20)))


def half(pt):
    return str(max(2, int(round(pt * 2))))


def eighths(pt):
    return str(max(2, min(96, int(round(pt * 8)))))


def classes(el):
    return set((el.get("class") or "").split())


def is_tag(el):
    return isinstance(el.tag, str)


def local(el):
    return el.tag.split("}")[-1].lower() if is_tag(el) else ""


def node(markup):
    return parse_xml(re.sub(r"^<([\w:]+)", lambda m: f"<{m.group(1)} {DECLS}", markup, count=1))


def attr(value):
    return html_escape(str(value), quote=True)


def css(el):
    found = {}
    for part in (el.get("style") or "").split(";"):
        key, _, value = part.partition(":")
        if key.strip() and value.strip():
            found[key.strip().lower()] = value.strip()
    return found


def colour(value, accent):
    from PIL import ImageColor

    value = (value or "").strip().lower()
    if not value or value in {"inherit", "transparent", "currentcolor"}:
        return None
    if "--accent" in value:
        return accent
    if value.startswith("var("):
        return None
    try:
        red, green, blue = ImageColor.getrgb(value)[:3]
    except ValueError:
        return None
    return f"{red:02X}{green:02X}{blue:02X}"


def points(value, em=12.0, full=None):
    match = re.fullmatch(r"\s*(-?\d*\.?\d+)\s*(pt|px|mm|cm|in|em|rem|%)?\s*", value or "")
    if not match:
        return None
    number, unit = float(match.group(1)), match.group(2) or "pt"
    if unit == "%":
        return number / 100 * (full if full is not None else em)
    scale = {"pt": 1, "px": 0.75, "mm": 72 / 25.4, "cm": 72 / 2.54, "in": 72, "em": em, "rem": em}
    return number * scale[unit]


def put(parent, child, order):
    name = child.tag.split("}")[-1]
    for existing in parent.findall(child.tag):
        parent.remove(existing)
    rank = order.index(name) if name in order else len(order)
    for sibling in parent:
        other = sibling.tag.split("}")[-1]
        if other in order and order.index(other) > rank:
            sibling.addprevious(child)
            return child
    parent.append(child)
    return child


def ppr_xml(o):
    parts = []
    if o.get("style"):
        parts.append(f'<w:pStyle w:val="{o["style"]}"/>')
    if o.get("keep_next"):
        parts.append("<w:keepNext/>")
    if o.get("keep_lines"):
        parts.append("<w:keepLines/>")
    if o.get("page_break"):
        parts.append("<w:pageBreakBefore/>")
    if o.get("num") is not None:
        num, level = o["num"]
        parts.append(f'<w:numPr><w:ilvl w:val="{level}"/><w:numId w:val="{num}"/></w:numPr>')
    borders = o.get("borders") or {}
    if borders:
        sides = "".join(
            f'<w:{side} w:val="single" w:sz="{eighths(size)}" w:space="{int(round(space))}" w:color="{color}"/>'
            for side in ("top", "left", "bottom", "right")
            if side in borders
            for size, color, space in [borders[side]]
        )
        parts.append(f"<w:pBdr>{sides}</w:pBdr>")
    if o.get("fill"):
        parts.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{o["fill"]}"/>')
    if o.get("tabs"):
        stops = "".join(
            f'<w:tab w:val="{kind}" w:leader="{leader}" w:pos="{twips(pos)}"/>' for kind, pos, leader in o["tabs"]
        )
        parts.append(f"<w:tabs>{stops}</w:tabs>")
    spacing = []
    if o.get("before") is not None:
        spacing.append(f'w:before="{twips(o["before"])}"')
    if o.get("after") is not None:
        spacing.append(f'w:after="{twips(o["after"])}"')
    if o.get("line") is not None:
        spacing.append(f'w:line="{twips(o["line"])}" w:lineRule="{o.get("rule", "atLeast")}"')
    elif o.get("single"):
        spacing.append('w:line="240" w:lineRule="auto"')
    if spacing:
        parts.append(f"<w:spacing {' '.join(spacing)}/>")
    indent = []
    if o.get("left") is not None:
        indent.append(f'w:left="{twips(o["left"])}"')
    if o.get("right") is not None:
        indent.append(f'w:right="{twips(o["right"])}"')
    if o.get("hanging"):
        indent.append(f'w:hanging="{twips(o["hanging"])}"')
    elif o.get("first") is not None:
        indent.append(f'w:firstLine="{twips(o["first"])}"')
    if indent:
        parts.append(f"<w:ind {' '.join(indent)}/>")
    if o.get("jc"):
        parts.append(f'<w:jc w:val="{o["jc"]}"/>')
    if o.get("outline") is not None:
        parts.append(f'<w:outlineLvl w:val="{o["outline"]}"/>')
    if o.get("mark"):
        parts.append(f"<w:rPr>{rpr_xml(o['mark'])}</w:rPr>")
    return "".join(parts)


def rpr_xml(f):
    parts = []
    if f.get("rstyle"):
        parts.append(f'<w:rStyle w:val="{f["rstyle"]}"/>')
    if f.get("font"):
        name = attr(f["font"])
        parts.append(f'<w:rFonts w:ascii="{name}" w:hAnsi="{name}" w:eastAsia="{name}" w:cs="{name}"/>')
    if f.get("bold") is not None:
        parts.append("<w:b/><w:bCs/>" if f["bold"] else '<w:b w:val="0"/><w:bCs w:val="0"/>')
    if f.get("italic") is not None:
        parts.append("<w:i/><w:iCs/>" if f["italic"] else '<w:i w:val="0"/><w:iCs w:val="0"/>')
    if f.get("caps"):
        parts.append("<w:caps/>")
    if f.get("smallcaps"):
        parts.append("<w:smallCaps/>")
    if f.get("strike"):
        parts.append("<w:strike/>")
    if f.get("color"):
        parts.append(f'<w:color w:val="{f["color"]}"/>')
    if f.get("tracking"):
        parts.append(f'<w:spacing w:val="{twips(f["tracking"])}"/>')
    if f.get("size"):
        parts.append(f'<w:sz w:val="{half(f["size"])}"/><w:szCs w:val="{half(f["size"])}"/>')
    if f.get("underline") is not None:
        parts.append(f'<w:u w:val="{"single" if f["underline"] else "none"}"/>')
    if f.get("shade"):
        parts.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{f["shade"]}"/>')
    if f.get("vert"):
        parts.append(f'<w:vertAlign w:val="{f["vert"]}"/>')
    return "".join(parts)


def style_xml(kind, ident, name, based="Normal", ppr="", rpr="", extra=""):
    default = ' w:default="1"' if ident == "Normal" else ""
    return (
        f'<w:style {nsdecls("w")} w:type="{kind}"{default} w:styleId="{ident}"><w:name w:val="{name}"/>'
        + (f'<w:basedOn w:val="{based}"/>' if based else "")
        + extra
        + (f"<w:pPr>{ppr}</w:pPr>" if ppr else "")
        + (f"<w:rPr>{rpr}</w:rPr>" if rpr else "")
        + "</w:style>"
    )


def make_run(text, fmt):
    run = OxmlElement("w:r")
    props = rpr_xml(fmt)
    if props:
        run.append(node(f"<w:rPr>{props}</w:rPr>"))
    for piece in re.split(r"(\t|\n)", text):
        if piece == "\t":
            run.append(OxmlElement("w:tab"))
        elif piece == "\n":
            run.append(OxmlElement("w:br"))
        elif piece:
            text_el = OxmlElement("w:t")
            text_el.text = piece
            text_el.set(qn("xml:space"), "preserve")
            run.append(text_el)
    return run


def field_runs(instruction, result, fmt):
    props = rpr_xml(fmt)
    head = f"<w:rPr>{props}</w:rPr>" if props else ""
    runs = [
        node(f'<w:r>{head}<w:fldChar w:fldCharType="begin"/></w:r>'),
        node(f'<w:r>{head}<w:instrText xml:space="preserve"> {attr(instruction)} </w:instrText></w:r>'),
        node(f'<w:r>{head}<w:fldChar w:fldCharType="separate"/></w:r>'),
        make_run(result, fmt),
        node(f'<w:r>{head}<w:fldChar w:fldCharType="end"/></w:r>'),
    ]
    return runs


def mathml_to_omml():
    places = []
    for root in (os.environ.get("ProgramFiles"), os.environ.get("ProgramFiles(x86)"), os.environ.get("ProgramW6432")):
        if root:
            for version in ("16", "15", "14"):
                places.append(Path(root) / "Microsoft Office" / "root" / f"Office{version}" / "MML2OMML.XSL")
                places.append(Path(root) / "Microsoft Office" / f"Office{version}" / "MML2OMML.XSL")
    places.append(Path("/Applications/Microsoft Word.app/Contents/Resources/mathml2omml.xsl"))
    for place in places:
        if place.is_file():
            try:
                return etree.XSLT(etree.parse(str(place)))
            except (etree.XSLTParseError, OSError):
                continue
    return None


def convert_math(items, work):
    if not items:
        return {}
    transform = mathml_to_omml()
    if transform is None or not shutil.which("node"):
        return {}
    source, target = work / "math-in.json", work / "math-out.json"
    source.write_text(json.dumps(items), encoding="utf-8")
    try:
        subprocess.run(
            ["node", "-e", MATH_JS, str(source), str(target)],
            cwd=str(ENGINE),
            check=True,
            capture_output=True,
            timeout=120,
        )
        rendered = json.loads(target.read_text(encoding="utf-8"))
    except (subprocess.SubprocessError, OSError, ValueError):
        return {}
    found = {}
    for (tex, display), markup in zip(items, rendered):
        if not markup:
            continue
        match = re.search(r"<math[\s\S]*</math>", markup)
        if not match:
            continue
        try:
            tree = etree.fromstring(match.group(0))
            for note in list(tree.iter(f"{{{MATHML_NS}}}annotation")):
                note.getparent().remove(note)
            result = transform(tree).getroot()
        except (etree.XMLSyntaxError, etree.XSLTApplyError, AttributeError):
            continue
        if result is None:
            continue
        omath = result if result.tag == f"{{{MATH_NS}}}oMath" else result.find(f".//{{{MATH_NS}}}oMath")
        if omath is not None:
            found[(tex, display)] = parse_xml(etree.tostring(omath))
    return found


def fallback_math(tex):
    text = tex.strip()
    if text.startswith(PLAIN):
        text = text[1:]
        text = re.sub(r"\^\(([^()]*)\)", r"^{\1}", text)
        text = re.sub(r"_\(([^()]*)\)", r"_{\1}", text)
        text = text.replace("sqrt", "√").replace("*", "·").replace("<=", "≤").replace(">=", "≥").replace("!=", "≠")
    text = re.sub(r"\\frac\{([^{}]*)\}\{([^{}]*)\}", r"(\1)/(\2)", text)
    text = re.sub(r"\\sqrt\{([^{}]*)\}", r"√(\1)", text)
    text = re.sub(r"\\(left|right|displaystyle|,|;|!|quad|qquad)", " ", text)
    text = latex_to_text(f"${text}$")
    return re.sub(r"\s+", " ", text.replace("\\", "")).strip()


class Writer:
    def __init__(self, compiler, body, result, pdf, work):
        import pymupdf

        self.compiler = compiler
        self.cfg = compiler.cfg
        self.result = result
        self.work = work
        self.pdf = pymupdf.open(str(pdf))
        self.regions = {int(key): value for key, value in (result.get("regions") or {}).items()}
        self.notes = getattr(compiler, "note_items", [])
        mode = compiler.note_mode() if hasattr(compiler, "note_mode") else "footnotes"
        self.footnotes_on = mode == "footnotes"
        self.fs = self.number("font-size", 11)
        self.z = max(0.5, min(2.0, self.fs / 12))
        self.lh = self.number("line-spacing", 1.8)
        paper = PAPERS.get(self.cfg.get("paper", "a4").strip().lower(), PAPERS["a4"])
        self.paper = paper
        self.margin_mm = self.number("margins", 25)
        self.margin = self.margin_mm * 72 / 25.4
        self.page_w, self.page_h = paper[0] * 72 / 25.4, paper[1] * 72 / 25.4
        self.text_w = self.page_w - 2 * self.margin
        self.body_h = self.page_h - 2 * self.margin
        self.accent = colour(self.cfg.get("accent", "#1f4e79"), "1F4E79") or "1F4E79"
        self.font = fonts.parse_family(self.cfg.get("font") or "Cambria")[0] or "Cambria"
        heading = self.cfg.get("heading-font", "").strip()
        self.hfont = fonts.parse_family(heading)[0] if heading else self.font
        code = self.cfg.get("code-font", "").strip()
        self.cfont = fonts.parse_family(code)[0] if code else "Consolas"
        self.cap = self.size("caption-size", 10.5)
        self.code = self.size("code-size", 8.2)
        self.tbl = self.size("table-size", 10)
        self.p_after = self.number("paragraph-spacing", 10) * self.z
        indent = self.cfg.get("paragraph-indent", "").strip()
        self.indent = points(indent, self.fs) if indent and indent.lower() not in {"no", "none", "0"} else None
        self.justify = self.cfg.get("justify", "yes").strip().lower() not in OFF
        self.doc = Document()
        self.body_el = self.doc.element.body
        self.sect = self.body_el.sectPr
        self.target = None
        self.rel_part = self.doc.part
        self.decor = [{}]
        self.base = [{}]
        self.para_extra = [{}]
        self.pending_mark = None
        self.pending_break = False
        self.pending_space = None
        self.at_top = True
        self.emitted = False
        self.body_started = False
        self.body_index = 0
        self.front_pages = 0
        self.last_kind = ""
        self.last_space = True
        self.bookmarks = {}
        self.bookmark_id = 0
        self.note_id = 0
        self.abstract_id = 100
        self.num_id = 100
        self.heading_num = None
        self.math = {}
        self.anchor_marks = {}
        self.front_cover = False
        self.use_numbering = False
        self.toc_entries = []

    def number(self, key, default):
        try:
            return float(str(self.cfg.get(key, default)).strip() or default)
        except ValueError:
            return float(default)

    def size(self, key, base):
        value = str(self.cfg.get(key, "")).strip()
        try:
            return float(value) if value else base * self.z
        except ValueError:
            return base * self.z

    def build(self, body):
        words = self.result.get("words")
        body = body.replace("{{WORDS}}", f"{words:,}" if isinstance(words, int) else "")
        body = body.replace("&#36;", DOLLAR)
        root = lhtml.fromstring(f"<html><body><div id='essay-root'>{body}</div></body></html>")
        root = root.get_element_by_id("essay-root")
        for hint in root.xpath('//span[contains(concat(" ", normalize-space(@class), " "), " ph ")]'):
            self.drop(hint)
        self.prepare(root)
        self.setup_page()
        self.setup_styles()
        self.setup_numbering()
        self.setup_footnotes()
        for child in root:
            self.top(child)
        self.trim_end()
        self.page_furniture()
        self.setup_settings()
        self.clean_package()

    def drop(self, el):
        parent = el.getparent()
        if parent is None:
            return
        if el.tail:
            previous = el.getprevious()
            if previous is not None:
                previous.tail = (previous.tail or "") + el.tail
            else:
                parent.text = (parent.text or "") + el.tail
        parent.remove(el)

    def prepare(self, root):
        items = []
        seen = set()

        def collect(text, display=None):
            for match in MATH.finditer(text or ""):
                if match.group(1) is not None:
                    key = (match.group(1).replace(DOLLAR, "$"), True)
                else:
                    key = (match.group(2).replace(DOLLAR, "$"), False)
                if display is not None:
                    key = (key[0], display)
                if key not in seen:
                    seen.add(key)
                    items.append(list(key))

        def walk(el, skip=False):
            if not is_tag(el):
                return
            name = local(el)
            skip = skip or name in SKIP_MATH or "url" in classes(el) or "mk" in classes(el)
            if not skip:
                collect(el.text)
            for child in el:
                walk(child, skip)
                if not skip:
                    collect(child.tail)

        walk(root)
        for item in self.notes:
            walk(lhtml.fragment_fromstring(item["html"].replace("&#36;", DOLLAR), create_parent="div"))
        self.math = convert_math(items, self.work)
        for el in root.iter():
            if is_tag(el) and el.get("id"):
                ident = el.get("id")
                name = re.sub(r"[^A-Za-z0-9_]", "_", ident)[:36]
                name = name if name[:1].isalpha() else f"x{name}"
                while name in self.bookmarks.values():
                    name = f"{name[:33]}_{len(self.bookmarks)}"
                self.bookmarks[ident] = name
                if local(el) == "figure":
                    self.anchor_marks[ident] = self.mark_in(el)
        self.heading_plan(root)

    def heading_plan(self, root):
        expected, first, second = [], 0, 0
        ok = True
        for el in root.iter("h1", "h2"):
            if el.get("id") == "contents":
                continue
            num = el.find("span[@class='num']")
            level = 1 if el.tag == "h1" else 2
            text = (num.text or "").strip() if num is not None else ""
            if text:
                if level == 1:
                    first, second = first + 1, 0
                    ok = ok and text == str(first)
                else:
                    second += 1
                    ok = ok and text == f"{first}.{second}"
            title = re.sub(r"\s+", " ", "".join(self.plain_text(el))).strip()
            if "notoc" not in classes(el):
                expected.append((level, title, self.mark_in(el)))
        self.use_numbering = ok and self.cfg.get("heading-numbers", "yes").strip().lower() not in OFF
        self.toc_entries = expected

    def plain_text(self, el):
        pieces = [el.text or ""]
        for child in el:
            if is_tag(child) and not ({"mk", "ph"} & classes(child)):
                if local(child) == "span" and "num" in classes(child):
                    pieces.append((child.text or "") + "\u2002")
                else:
                    pieces.extend(self.plain_text(child))
            pieces.append(child.tail or "")
        return [piece.replace(DOLLAR, "$") for piece in pieces]

    def mark_in(self, el):
        previous = el.getprevious()
        if previous is not None and is_tag(previous) and "mk" in classes(previous):
            match = MARK.search(previous.text or "")
            if match:
                return int(match.group(1))
        for mark in el.iter("span"):
            if "mk" in classes(mark):
                match = MARK.search(mark.text or "")
                if match:
                    return int(match.group(1))
        return None

    def setup_page(self):
        section = self.doc.sections[0]
        section.page_width = Emu(int(self.page_w * 12700))
        section.page_height = Emu(int(self.page_h * 12700))
        for side in ("left_margin", "right_margin", "top_margin", "bottom_margin"):
            setattr(section, side, Emu(int(self.margin * 12700)))
        section.header_distance = Pt(max(10, min(40, self.margin * 0.55) - 8))
        section.footer_distance = Pt(22)
        section.gutter = 0

    def heading_look(self):
        z, style = self.z, self.cfg.get("heading-style", "rule").strip().lower()
        look = {
            1: {"size": 20 * z, "before": 0, "after": 16 * z, "line": 1.25, "bold": True, "border": (1.3, RULE, 8 * z)},
            2: {"size": 14 * z, "before": 20 * z, "after": 4 * z, "line": 1.35, "bold": True},
            3: {"size": 12 * z, "before": 14 * z, "after": 2 * z, "line": 1.4, "bold": True, "italic": True},
        }
        if style == "underline":
            look[1].update(size=17, after=14 * z, bold=False, underline=True, border=None)
            look[2].update(size=14, bold=False, underline=True)
        elif style == "plain":
            look[1].update(size=17, after=12 * z, border=None)
        elif style == "accent":
            look[1].update(size=15, before=20 * z, after=6 * z, line=1.3, border=None)
            look[2].update(size=12.5, before=14 * z, after=4 * z)
            look[3].update(before=10 * z, after=2 * z)
            for level in look.values():
                level["color"] = self.accent
        if self.cfg.get("heading-size", "").strip():
            size = self.number("heading-size", 15)
            look[1]["size"], look[2]["size"] = size, size * 0.85
        for key, level in (("h2-size", 2), ("h3-size", 3)):
            if self.cfg.get(key, "").strip():
                look[level]["size"] = self.number(key, look[level]["size"])
        tint = colour(self.cfg.get("heading-color", ""), self.accent)
        if tint:
            for level in look.values():
                level["color"] = tint
        align = self.cfg.get("heading-align", "").strip().lower()
        if align in {"center", "centre", "right"}:
            for level in (1, 2):
                look[level]["jc"] = "right" if align == "right" else "center"
        if self.cfg.get("heading-case", "").strip().lower() in {"upper", "caps", "uppercase"}:
            for level in (1, 2):
                look[level]["caps"] = True
                look[level]["tracking"] = look[level]["size"] * 0.04
        return look

    def setup_styles(self):
        styles = self.doc.styles.element
        defaults = styles.find(qn("w:docDefaults"))
        if defaults is not None:
            styles.remove(defaults)
        name = attr(self.font)
        defaults = node(
            f'<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="{name}" w:hAnsi="{name}" w:eastAsia="{name}" '
            f'w:cs="{name}"/><w:sz w:val="{half(self.fs)}"/><w:szCs w:val="{half(self.fs)}"/>'
            '<w:lang w:val="en-GB" w:eastAsia="en-US" w:bidi="ar-SA"/></w:rPr></w:rPrDefault>'
            '<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="240" w:lineRule="auto"/></w:pPr></w:pPrDefault>'
            "</w:docDefaults>"
        )
        styles.insert(0, defaults)
        z, fs, lh = self.z, self.fs, self.lh
        look = self.heading_look()
        line = lh * fs
        defs = [
            style_xml(
                "paragraph",
                "Normal",
                "Normal",
                None,
                ppr_xml({"after": self.p_after, "line": line, "jc": "both" if self.justify else "left"}),
                rpr_xml({"font": self.font, "size": fs, "color": INK}),
                "<w:qFormat/>",
            )
        ]
        for level in (1, 2, 3):
            item = look[level]
            border = item.get("border")
            ppr = {
                "keep_next": True,
                "keep_lines": True,
                "before": item["before"],
                "after": item["after"],
                "line": item["size"] * item["line"],
                "jc": item.get("jc", "left"),
                "outline": level - 1,
            }
            if border:
                ppr["borders"] = {"bottom": border}
            if self.use_numbering and level < 3:
                ppr["num"] = (self.heading_num_id(), level - 1)
            rpr = {
                "font": self.hfont,
                "size": item["size"],
                "bold": item.get("bold", False),
                "italic": item.get("italic", False),
                "color": item.get("color", INK),
                "underline": item.get("underline"),
                "caps": item.get("caps"),
                "tracking": item.get("tracking"),
            }
            defs.append(
                style_xml(
                    "paragraph",
                    f"Heading{level}",
                    f"heading {level}",
                    "Normal",
                    ppr_xml(ppr),
                    rpr_xml(rpr),
                    '<w:next w:val="Normal"/><w:uiPriority w:val="9"/><w:qFormat/>',
                )
            )
            if level == 1:
                defs.append(
                    style_xml(
                        "paragraph",
                        "TOCHeading",
                        "TOC Heading",
                        "Normal",
                        ppr_xml({**ppr, "num": None, "outline": 9}),
                        rpr_xml(rpr),
                        '<w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/><w:qFormat/>',
                    )
                )
                defs.append(
                    style_xml(
                        "paragraph",
                        "UnlistedHeading",
                        "Unlisted Heading",
                        "Normal",
                        ppr_xml({**ppr, "num": None, "outline": 9}),
                        rpr_xml(rpr),
                        '<w:next w:val="Normal"/><w:qFormat/>',
                    )
                )
        dots = "none" if self.cfg.get("contents-dots", "yes").strip().lower() in OFF else "dot"
        width = self.text_w
        defs += [
            style_xml(
                "paragraph",
                "TOC1",
                "toc 1",
                "Normal",
                ppr_xml(
                    {"tabs": [("right", width, dots)], "before": 18 * z, "after": 0, "line": 1.35 * fs, "jc": "left"}
                ),
                rpr_xml({"bold": True}),
                '<w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/>',
            ),
            style_xml(
                "paragraph",
                "TOC2",
                "toc 2",
                "Normal",
                ppr_xml(
                    {
                        "tabs": [("right", width, dots)],
                        "before": 9 * z,
                        "after": 0,
                        "line": 1.35 * fs,
                        "left": 2.1 * fs,
                        "jc": "left",
                    }
                ),
                "",
                '<w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/>',
            ),
            style_xml(
                "paragraph",
                "TOC3",
                "toc 3",
                "Normal",
                ppr_xml(
                    {"tabs": [("right", width, dots)], "after": 0, "line": 1.35 * fs, "left": 4 * fs, "jc": "left"}
                ),
                "",
                '<w:next w:val="Normal"/><w:uiPriority w:val="39"/><w:unhideWhenUsed/>',
            ),
            style_xml(
                "paragraph",
                "TableofFigures",
                "table of figures",
                "Normal",
                ppr_xml(
                    {"tabs": [("right", width, dots)], "before": 6 * z, "after": 0, "line": 1.35 * fs, "jc": "left"}
                ),
                rpr_xml({"size": 11 * z}),
                '<w:next w:val="Normal"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>',
            ),
            style_xml(
                "paragraph",
                "Caption",
                "caption",
                "Normal",
                ppr_xml({"before": 8 * z, "after": 0, "line": self.cap * 1.5, "jc": "center", "left": 11, "right": 11}),
                rpr_xml(
                    {
                        "size": self.cap,
                        "color": "2A2A28",
                        "italic": self.cfg.get("caption-style", "bold").lower() == "italic",
                    }
                ),
                '<w:next w:val="Normal"/><w:uiPriority w:val="35"/><w:unhideWhenUsed/><w:qFormat/>',
            ),
            style_xml(
                "paragraph",
                "FigureSource",
                "Figure Source",
                "Normal",
                ppr_xml(
                    {"before": 3, "after": 0, "line": (self.cap - 1) * 1.4, "jc": "center", "left": 11, "right": 11}
                ),
                rpr_xml({"size": self.cap - 1, "color": MUTE}),
                '<w:next w:val="Normal"/>',
            ),
            style_xml(
                "paragraph",
                "Quote",
                "Quote",
                "Normal",
                ppr_xml(
                    {
                        "borders": {"left": (2, HAIR, 12)},
                        "before": 4 * z,
                        "after": self.p_after,
                        "line": 1.6 * fs,
                        "left": 14 * z + 2,
                    }
                ),
                "",
                '<w:next w:val="Normal"/><w:uiPriority w:val="29"/><w:qFormat/>',
            ),
            style_xml(
                "paragraph",
                "Bibliography",
                "Bibliography",
                "Normal",
                ppr_xml({"after": 8 * z, "line": 1.75 * fs, "left": 36, "hanging": 36, "jc": "left"}),
                "",
                '<w:next w:val="Normal"/><w:uiPriority w:val="37"/><w:unhideWhenUsed/>',
            ),
            style_xml(
                "paragraph",
                "ListParagraph",
                "List Paragraph",
                "Normal",
                ppr_xml({"after": 3 * z}),
                "",
                '<w:uiPriority w:val="34"/><w:qFormat/>',
            ),
            style_xml(
                "paragraph",
                "FootnoteText",
                "footnote text",
                "Normal",
                ppr_xml({"after": 2, "line": 9 * 1.38, "jc": "left"}),
                rpr_xml({"size": 9}),
                '<w:link w:val="FootnoteTextChar"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>',
            ),
            style_xml(
                "character",
                "FootnoteTextChar",
                "Footnote Text Char",
                "DefaultParagraphFont",
                "",
                rpr_xml({"size": 9}),
                '<w:link w:val="FootnoteText"/><w:uiPriority w:val="99"/>',
            ),
            style_xml(
                "character",
                "FootnoteReference",
                "footnote reference",
                "DefaultParagraphFont",
                "",
                rpr_xml({"vert": "superscript"}),
                '<w:uiPriority w:val="99"/><w:unhideWhenUsed/>',
            ),
            style_xml(
                "character",
                "Hyperlink",
                "Hyperlink",
                "DefaultParagraphFont",
                "",
                rpr_xml({"color": self.accent}),
                '<w:uiPriority w:val="99"/><w:unhideWhenUsed/>',
            ),
            style_xml(
                "paragraph",
                "Header",
                "header",
                "Normal",
                ppr_xml(
                    {
                        "tabs": [("center", self.text_w / 2, "none"), ("right", self.text_w, "none")],
                        "after": 0,
                        "single": True,
                        "jc": "left",
                    }
                ),
                rpr_xml({"size": 9.5, "color": "616161"}),
                '<w:link w:val="HeaderChar"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>',
            ),
            style_xml(
                "paragraph",
                "Footer",
                "footer",
                "Normal",
                ppr_xml(
                    {
                        "tabs": [("center", self.text_w / 2, "none"), ("right", self.text_w, "none")],
                        "after": 0,
                        "single": True,
                        "jc": "left",
                    }
                ),
                rpr_xml({"size": 9.5, "color": "616161"}),
                '<w:link w:val="FooterChar"/><w:uiPriority w:val="99"/><w:unhideWhenUsed/>',
            ),
        ]
        replaced = set()
        for markup in defs:
            element = parse_xml(markup)
            ident = element.get(qn("w:styleId"))
            replaced.add(ident)
            for old in styles.findall(qn("w:style")):
                if old.get(qn("w:styleId")) == ident:
                    styles.remove(old)
            styles.append(element)

    def heading_num_id(self):
        if self.heading_num is None:
            self.heading_num = self.num_id
            self.num_id += 1
        return self.heading_num

    def setup_numbering(self):
        self.numbering = self.doc.part.numbering_part.element
        if not self.use_numbering:
            return
        levels = "".join(
            f'<w:lvl w:ilvl="{level}"><w:start w:val="1"/><w:numFmt w:val="{"decimal" if level < 2 else "none"}"/>'
            f'<w:pStyle w:val="Heading{level + 1}"/><w:suff w:val="nothing"/>'
            f'<w:lvlText w:val="{"%1" if level == 0 else "%1.%2" if level == 1 else ""}\u2002"/><w:lvlJc w:val="left"/>'
            '<w:pPr><w:ind w:left="0" w:firstLine="0"/></w:pPr></w:lvl>'
            for level in range(3)
        )
        self.add_numbering(f'<w:multiLevelType w:val="multilevel"/>{levels}', self.heading_num_id())

    def add_numbering(self, body, num_id, starts=None):
        abstract = self.abstract_id
        self.abstract_id += 1
        element = node(f'<w:abstractNum w:abstractNumId="{abstract}">{body}</w:abstractNum>')
        first = self.numbering.find(qn("w:num"))
        if first is not None:
            first.addprevious(element)
        else:
            self.numbering.append(element)
        overrides = "".join(
            f'<w:lvlOverride w:ilvl="{level}"><w:startOverride w:val="{start}"/></w:lvlOverride>'
            for level, start in (starts or {}).items()
        )
        self.numbering.append(
            node(f'<w:num w:numId="{num_id}"><w:abstractNumId w:val="{abstract}"/>{overrides}</w:num>')
        )

    def setup_footnotes(self):
        self.footnotes = None
        if not (self.footnotes_on and self.notes):
            return
        markup = (
            f"<w:footnotes {DECLS}>"
            '<w:footnote w:type="separator" w:id="-1"><w:p><w:pPr><w:spacing w:after="0" w:line="240" '
            'w:lineRule="auto"/></w:pPr><w:r><w:separator/></w:r></w:p></w:footnote>'
            '<w:footnote w:type="continuationSeparator" w:id="0"><w:p><w:pPr><w:spacing w:after="0" w:line="240" '
            'w:lineRule="auto"/></w:pPr><w:r><w:continuationSeparator/></w:r></w:p></w:footnote>'
            "</w:footnotes>"
        )
        part = XmlPart(PackURI("/word/footnotes.xml"), CT.WML_FOOTNOTES, parse_xml(markup), self.doc.part.package)
        self.doc.part.relate_to(part, RT.FOOTNOTES)
        self.footnote_part = part
        self.footnotes = part.element

    def setup_settings(self):
        settings = self.doc.settings.element
        order = ORDERS["settings"]
        put(settings, node('<w:updateFields w:val="true"/>'), order)
        if self.footnotes is not None:
            put(settings, node('<w:footnotePr><w:footnote w:id="-1"/><w:footnote w:id="0"/></w:footnotePr>'), order)
        for setting in settings.iter(qn("w:compatSetting")):
            if setting.get(qn("w:name")) == "compatibilityMode":
                setting.set(qn("w:val"), "15")
        core = self.doc.core_properties
        core.title = re.sub(r"\s+", " ", self.result.get("title") or "")
        core.author = self.cfg.get("author", "").strip()
        core.comments = ""
        core.subject = self.cfg.get("subject", "").strip()
        core.keywords = ""
        core.last_modified_by = ""
        core.revision = 1

    def clean_package(self):
        package = self.doc.part.package
        for key, rel in list(package.rels.items()):
            if rel.reltype.endswith("/thumbnail"):
                del package.rels[key]

    def put_block(self, element):
        if element.tag == qn("w:tbl") and self.pending_break and self.target is None:
            self.pending_break = False
            self.sect.addprevious(
                node('<w:p><w:pPr><w:pageBreakBefore/><w:spacing w:before="0" w:after="0"/></w:pPr></w:p>')
            )
        if self.target is None:
            last = self.sect.getprevious()
            if element.tag == qn("w:tbl") and last is not None and last.tag == qn("w:tbl"):
                self.sect.addprevious(self.spacer())
            self.sect.addprevious(element)
        else:
            children = [c for c in self.target if c.tag in (qn("w:p"), qn("w:tbl"))]
            if element.tag == qn("w:tbl") and children and children[-1].tag == qn("w:tbl"):
                self.target.append(self.spacer())
            self.target.append(element)
        return element

    def spacer(self, after=0):
        return node(
            f'<w:p><w:pPr><w:spacing w:before="0" w:after="{twips(after)}" w:line="20" w:lineRule="exact"/>'
            '<w:rPr><w:sz w:val="2"/></w:rPr></w:pPr></w:p>'
        )

    @contextmanager
    def into(self, target, rel_part=None):
        saved = (
            self.target,
            self.rel_part,
            self.pending_break,
            self.pending_space,
            self.at_top,
            self.last_kind,
            self.last_space,
        )
        self.target = target
        self.pending_break, self.pending_space, self.at_top, self.last_kind = False, None, True, ""
        if rel_part is not None:
            self.rel_part = rel_part
        self.decor.append({})
        self.base.append({})
        self.para_extra.append({})
        try:
            yield
        finally:
            self.decor.pop()
            self.base.pop()
            self.para_extra.pop()
            (
                self.target,
                self.rel_part,
                self.pending_break,
                self.pending_space,
                self.at_top,
                self.last_kind,
                self.last_space,
            ) = saved

    @contextmanager
    def panel(self, decor=None, fmt=None, extra=None):
        self.decor.append(self.decor[-1] if decor is None else decor)
        self.base.append({**self.base[-1], **(fmt or {})})
        self.para_extra.append({**self.para_extra[-1], **(extra or {})})
        try:
            yield
        finally:
            self.decor.pop()
            self.base.pop()
            self.para_extra.pop()

    def para(self, **options):
        merged = {**self.para_extra[-1], **self.decor[-1]}
        merged.update({key: value for key, value in options.items() if value is not None or key == "num"})
        if self.pending_break and self.target is None:
            merged["page_break"] = True
            merged["before"] = 0
        if self.pending_space is not None and not merged.get("page_break"):
            merged["before"] = max(merged.get("before") or 0, self.pending_space)
        self.pending_break = False
        self.pending_space = None
        paragraph = OxmlElement("w:p")
        props = ppr_xml(merged)
        if props:
            paragraph.append(node(f"<w:pPr>{props}</w:pPr>"))
        self.put_block(paragraph)
        self.last_space = True
        if self.target is None:
            self.at_top = False
            self.emitted = True
        return paragraph

    def fmt(self, **extra):
        return {**self.base[-1], **extra}

    def top(self, el):
        if not is_tag(el):
            return
        name, cls = local(el), classes(el)
        if name == "section" and "cover" in cls:
            self.cover(el)
        elif name == "section" and "fnm" in cls:
            return
        elif name == "section" and el.find("h1[@id='contents']") is not None:
            self.contents(el)
        elif name == "section":
            self.section(el)
        else:
            self.block(el)

    def page_break(self):
        if not self.at_top:
            self.pending_break = True

    def section(self, el):
        flow = "flow" in classes(el)
        starts_body = not self.body_started and any(h.get("id") != "contents" for h in el.iter("h1"))
        if starts_body:
            self.body_started = True
            continuous = self.cfg.get("page-numbering", "body").strip().lower() == "continuous"
            if self.emitted and not flow and not continuous:
                self.section_break(restart=True)
            elif not flow:
                self.page_break()
        elif not flow:
            self.page_break()
        elif self.emitted and not self.at_top:
            self.pending_space = (20 if self.cfg.get("heading-style", "").strip().lower() == "accent" else 24) * self.z
        for child in el:
            self.block(child, depth=0)

    def section_break(self, restart=False, landscape=None, cols=None, continuous=False):
        continuous = continuous and not self.pending_break
        frozen = copy.deepcopy(self.sect)
        last = self.sect.getprevious()
        if last is None or last.tag != qn("w:p"):
            last = self.spacer()
            self.sect.addprevious(last)
        props = last.find(qn("w:pPr"))
        if props is None:
            props = OxmlElement("w:pPr")
            last.insert(0, props)
        put(props, frozen, ORDERS["pPr"])
        for ref in self.sect.findall(qn("w:headerReference")) + self.sect.findall(qn("w:footerReference")):
            self.sect.remove(ref)
        order = ORDERS["sectPr"]
        for stale in self.sect.findall(qn("w:titlePg")):
            self.sect.remove(stale)
        put(self.sect, node(f'<w:type w:val="{"continuous" if continuous else "nextPage"}"/>'), order)
        if restart:
            self.body_index = len(self.body_el.findall(f".//{qn('w:sectPr')}")) - 1
            style = self.page_style()[1]
            put(self.sect, node(f'<w:pgNumType w:fmt="{FORMATS.get(style, "decimal")}" w:start="1"/>'), order)
        else:
            for stale in self.sect.findall(qn("w:pgNumType")):
                self.sect.remove(stale)
        if landscape is not None:
            wide, tall = (self.page_h, self.page_w) if landscape else (self.page_w, self.page_h)
            orient = ' w:orient="landscape"' if landscape else ""
            put(self.sect, node(f'<w:pgSz w:w="{twips(wide)}" w:h="{twips(tall)}"{orient}/>'), order)
            self.text_w = wide - 2 * self.margin
        if cols is not None:
            count, gap, rule = cols
            separator = ' w:sep="1"' if rule else ""
            put(self.sect, node(f'<w:cols w:num="{count}" w:space="{twips(gap)}"{separator}/>'), order)
        self.at_top = not continuous
        self.pending_break = False
        if not continuous:
            self.pending_space = None

    def page_style(self):
        value = (self.cfg.get("page-number-format") or "").strip() or "arabic"
        if "{n}" in value:
            return value, "D"
        low = value.lower()
        if low == "roman":
            return "{n}", "R" if value != low else "r"
        if low == "letter":
            return "{n}", "A" if value != low else "a"
        return "{n}", "D"

    def block(self, el, mark=None, depth=1):
        if not is_tag(el):
            return
        name, cls = local(el), classes(el)
        if name == "span" and "mk" in cls:
            match = MARK.search(el.text or "")
            self.pending_mark = int(match.group(1)) if match else None
            return
        if name == "span" and "pn" in cls:
            return
        if mark is None:
            mark = self.take_mark(el)
        if name in ("h1", "h2", "h3"):
            self.heading(el, int(name[1]))
        elif name == "p":
            self.paragraph(el, depth)
        elif name in ("ul", "ol"):
            self.checklist(el) if "check" in cls else self.list_block(el)
        elif name == "blockquote":
            self.quote(el)
        elif name == "dl":
            self.glossary(el)
        elif name == "figure":
            self.figure(el, mark)
        elif name == "table":
            self.table(el)
        elif name in ("nav", "template", "script", "style", "br"):
            return
        elif name == "div":
            self.division(el, mark)
        elif name == "section":
            for child in el:
                self.block(child)
        elif name == "pre":
            self.code_lines(el)
        elif mark is not None and self.regions.get(mark):
            self.picture(mark)
        else:
            self.inline_para(el)
        self.last_kind = name

    def take_mark(self, el):
        if self.pending_mark is not None:
            mark, self.pending_mark = self.pending_mark, None
            return mark
        for mark in el.iter("span"):
            if "mk" in classes(mark):
                match = MARK.search(mark.text or "")
                return int(match.group(1)) if match else None
        return None

    def has_blocks(self, el):
        blocks = {"p", "div", "ul", "ol", "table", "figure", "blockquote", "dl", "h1", "h2", "h3", "pre", "section"}
        return any(is_tag(child) and local(child) in blocks for child in el)

    def inline_para(self, el, **options):
        paragraph = self.para(**options)
        self.inline(el, paragraph, self.fmt())
        self.finish(paragraph)
        return paragraph

    def finish(self, paragraph):
        texts = [t for t in paragraph.iter(qn("w:t"))]
        if texts:
            texts[-1].text = texts[-1].text.rstrip(" ")
            texts[0].text = (
                texts[0].text.lstrip(" ") if texts[0].getparent().getparent() is paragraph else texts[0].text
            )

    def bookmark(self, paragraph, ident):
        name = self.bookmarks.get(ident or "")
        if not name:
            return
        self.bookmark_id += 1
        start = node(f'<w:bookmarkStart w:id="{self.bookmark_id}" w:name="{name}"/>')
        props = paragraph.find(qn("w:pPr"))
        if props is not None:
            props.addnext(start)
        else:
            paragraph.insert(0, start)
        paragraph.append(node(f'<w:bookmarkEnd w:id="{self.bookmark_id}"/>'))

    def heading(self, el, level):
        cls = classes(el)
        look = css(el)
        style = f"Heading{level}"
        if "notoc" in cls and level == 1:
            style = "UnlistedHeading"
        num = el.find("span[@class='num']")
        options = {"style": style}
        if self.use_numbering and level < 3 and (num is None or not (num.text or "").strip()):
            options["num"] = (0, 0)
        if level == 2 and self.last_kind == "h1":
            options["before"] = 0
        if look.get("text-align") in ("center", "right", "left"):
            options["jc"] = {"center": "center", "right": "right", "left": "left"}[look["text-align"]]
        if self.at_top and self.target is None:
            options["before"] = 0
        paragraph = self.para(**options)
        fmt = self.fmt(**self.span_fmt(look, self.heading_look()[level]["size"]))
        self.inline(el, paragraph, fmt, numbers=not self.use_numbering)
        self.finish(paragraph)
        self.bookmark(paragraph, el.get("id"))

    def paragraph(self, el, depth=1):
        cls = classes(el)
        look = css(el)
        options = {}
        fmt = self.fmt()
        if "ref" in cls:
            options["style"] = "Bibliography"
        if "kw" in cls:
            fmt["size"] = (fmt.get("size") or self.fs) * 0.92
            options["before"] = 8 * self.z
        if depth == 0 and self.indent and not self.decor[-1]:
            options["first"] = self.indent
        if look.get("text-align") in ("center", "right", "left", "justify"):
            options["jc"] = {"center": "center", "right": "right", "left": "left", "justify": "both"}[
                look["text-align"]
            ]
        fmt.update(self.span_fmt(look, fmt.get("size") or self.fs))
        if self.last_kind in ("h1", "h2", "h3") and self.at_top:
            options["before"] = 0
        paragraph = self.para(**options)
        self.inline(el, paragraph, fmt)
        self.finish(paragraph)
        return paragraph

    def span_fmt(self, look, size):
        fmt = {}
        weight = look.get("font-weight", "")
        if weight:
            fmt["bold"] = weight in {"bold", "bolder"} or (weight.isdigit() and int(weight) >= 600)
        if look.get("font-style"):
            fmt["italic"] = look["font-style"] == "italic"
        decoration = look.get("text-decoration", "")
        if "underline" in decoration:
            fmt["underline"] = True
        if "line-through" in decoration:
            fmt["strike"] = True
        if "small-caps" in look.get("font-variant", ""):
            fmt["smallcaps"] = True
        if look.get("text-transform") == "uppercase":
            fmt["caps"] = True
        if look.get("vertical-align") in ("super", "sub"):
            fmt["vert"] = "superscript" if look["vertical-align"] == "super" else "subscript"
        if look.get("font-size") and "vert" not in fmt:
            found = points(look["font-size"], size, size)
            if found:
                fmt["size"] = found * (self.z if look["font-size"].strip().endswith("pt") else 1)
        if look.get("font-family"):
            family = look["font-family"].split(",")[0].strip().strip("'\"")
            if family and not family.startswith("var("):
                fmt["font"] = family
        tint = colour(look.get("color"), self.accent)
        if tint:
            fmt["color"] = tint
        shade = colour(look.get("background-color") or look.get("background"), self.accent)
        if shade:
            fmt["shade"] = shade
        if look.get("letter-spacing"):
            found = points(look["letter-spacing"], size)
            if found:
                fmt["tracking"] = found
        return fmt

    def inline(self, el, box, fmt, numbers=True):
        self.text(el.text, box, fmt)
        for child in el:
            self.inline_child(child, box, fmt, numbers)
            self.text(child.tail, box, fmt)

    def inline_child(self, child, box, fmt, numbers=True):
        if not is_tag(child):
            return
        name, cls = local(child), classes(child)
        if {"mk", "ph", "pn", "fnb", "probe"} & cls or name in ("img", "svg", "template", "script", "style", "nav"):
            return
        if name == "br":
            box.append(make_run("\n", fmt))
        elif name in ("strong", "b"):
            self.inline(child, box, {**fmt, "bold": True})
        elif name in ("em", "i", "cite", "var"):
            self.inline(child, box, {**fmt, "italic": True})
        elif name in ("u", "ins"):
            self.inline(child, box, {**fmt, "underline": True})
        elif name in ("s", "del", "strike"):
            self.inline(child, box, {**fmt, "strike": True})
        elif name == "sup" and "fnr" in cls:
            self.note_ref(child, box, fmt)
        elif name == "sup":
            self.inline(child, box, {**fmt, "vert": "superscript"})
        elif name == "sub":
            self.inline(child, box, {**fmt, "vert": "subscript"})
        elif name in ("code", "kbd", "samp"):
            size = (fmt.get("size") or self.fs) * 0.82
            self.inline(child, box, {**fmt, "font": self.cfont, "size": size, "shade": SOFT, "code": True})
        elif name == "a":
            self.link(child, box, fmt)
        elif name == "span" and "num" in cls:
            if numbers and (child.text or "").strip():
                self.text((child.text or "").strip() + "\u2002", box, fmt)
        elif name == "span" and "bad" in cls:
            self.inline(child, box, {**fmt, "color": "B00020", "bold": True})
        else:
            self.inline(child, box, {**fmt, **self.span_fmt(css(child), fmt.get("size") or self.fs)})

    def text(self, text, box, fmt):
        if not text:
            return
        if not fmt.get("pre"):
            text = re.sub(r"[ \t\r\n\f]+", " ", text)
            if self.last_space:
                text = text.lstrip(" ")
            if not text:
                return
        if fmt.get("code") or fmt.get("pre") or box.tag == qn("w:hyperlink"):
            box.append(make_run(text.replace(DOLLAR, "$"), fmt))
            self.last_space = text.endswith(" ")
            return
        at = 0
        for match in MATH.finditer(text):
            if match.start() > at:
                box.append(make_run(text[at : match.start()].replace(DOLLAR, "$"), fmt))
            display = match.group(1) is not None
            tex = (match.group(1) if display else match.group(2)).replace(DOLLAR, "$")
            omml = self.math.get((tex, display))
            if omml is None:
                omml = self.math.get((tex, not display))
            if omml is not None:
                box.append(copy.deepcopy(omml))
            else:
                box.append(make_run(fallback_math(tex), {**fmt, "italic": True}))
            at = match.end()
        if at < len(text):
            box.append(make_run(text[at:].replace(DOLLAR, "$"), fmt))
        self.last_space = text.endswith(" ")

    def link(self, el, box, fmt):
        href = el.get("href") or ""
        cls = classes(el)
        if box.tag == qn("w:hyperlink") or not href:
            self.inline(el, box, fmt)
            return
        if href.startswith("#"):
            name = self.bookmarks.get(href[1:])
            if not name:
                self.inline(el, box, fmt)
                return
            link = node(f'<w:hyperlink w:anchor="{name}" w:history="1"/>')
            box.append(link)
            self.inline(el, link, fmt)
            return
        if not re.match(r"^(https?|mailto|ftp):", href, re.I):
            self.inline(el, box, fmt)
            return
        rel = self.rel_part.relate_to(href, RT.HYPERLINK, is_external=True)
        link = node(f'<w:hyperlink r:id="{rel}" w:history="1"/>')
        box.append(link)
        self.inline(el, link, {**fmt, "rstyle": "Hyperlink"})

    def note_ref(self, el, box, fmt):
        serial = el.get("data-n")
        if not (self.footnotes is not None and serial and serial.isdigit() and 0 < int(serial) <= len(self.notes)):
            label = "".join(el.itertext()).strip()
            box.append(
                make_run(
                    label,
                    {
                        **fmt,
                        "vert": "superscript",
                        "color": self.accent if el.find("a") is not None else fmt.get("color"),
                    },
                )
            )
            self.last_space = False
            return
        self.note_id += 1
        ident = self.note_id
        item = self.notes[int(serial) - 1]
        note = node(f'<w:footnote w:id="{ident}"/>')
        self.footnotes.append(note)
        with self.into(note, self.footnote_part):
            paragraph = self.para(style="FootnoteText")
            paragraph.append(node('<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteRef/></w:r>'))
            paragraph.append(make_run(" ", {}))
            self.last_space = True
            fragment = lhtml.fragment_fromstring(item["html"].replace("&#36;", DOLLAR), create_parent="div")
            self.inline(fragment, paragraph, {})
            self.finish(paragraph)
        box.append(
            node(
                f'<w:r><w:rPr><w:rStyle w:val="FootnoteReference"/></w:rPr><w:footnoteReference w:id="{ident}"/></w:r>'
            )
        )
        self.last_space = False

    def division(self, el, mark):
        cls = classes(el)
        look = css(el)
        z = self.z
        if "pb" in cls:
            self.page_break()
        elif "blank-page" in cls:
            self.page_break()
            self.para()
            self.pending_break = True
        elif "fnb" in cls or "lo-title" in cls:
            return
        elif "box" in cls:
            decor = {"borders": self.frame(SOFT, left=(3, RULE)), "fill": SOFT, "left": 19, "right": 16, "jc": "left"}
            with self.panel(decor, {"bold": True}):
                self.children(el)
            self.pending_space = 16 * z
        elif "thm" in cls:
            plain = {"proof", "note", "remark"} & cls
            fill = None if plain else "FAFAF7"
            borders = None if {"proof"} & cls else self.frame(fill, left=(2, HAIR))
            decor = {
                "borders": borders,
                "fill": fill,
                "left": 16 if borders else None,
                "right": 14 if borders else None,
            }
            italic = bool({"theorem", "lemma", "proposition", "corollary"} & cls)
            with self.panel(decor, {"italic": True} if italic else {}):
                self.children(el)
            self.pending_space = 14 * z
        elif "adm" in cls:
            tone, wash = next((TONES[c] for c in cls if c in TONES), (self.accent, "F1F5F9"))
            decor = {"borders": self.frame(wash, left=(3, tone)), "fill": wash, "left": 17, "right": 14, "jc": "left"}
            with self.panel(decor):
                self.titled(el, tone)
            self.pending_space = 16 * z
        elif "abs" in cls:
            frame = {
                "top": (1.3, RULE, 10),
                "bottom": (0.6, HAIR, 11),
                "left": (0.5, SOFT, 16),
                "right": (0.5, SOFT, 16),
            }
            decor = {"borders": frame, "fill": SOFT, "left": 16, "right": 16}
            with self.panel(decor):
                self.titled(el, INK)
            self.pending_space = 16 * z
        elif "notes" in cls:
            self.endnotes(el)
        elif "bibwrap" in cls:
            self.children(el)
        elif "steps" in cls:
            title = el.find("div[@class='stt']")
            if title is not None:
                with self.panel(None, {"bold": True}):
                    self.inline_para(title, keep_next=True, after=6 * z, jc="left")
            for child in el:
                if local(child) == "ol":
                    self.list_block(child, steps=True)
        elif "txt" in cls:
            fmt = self.span_fmt(look, self.fs)
            extra = {}
            if look.get("text-align"):
                extra["jc"] = {"center": "center", "right": "right", "justify": "both"}.get(look["text-align"], "left")
            if look.get("padding-left"):
                extra["left"] = points(look["padding-left"], self.fs, self.text_w)
            if look.get("line-height"):
                factor = points(look["line-height"], 1)
                if factor:
                    extra["line"] = factor * (fmt.get("size") or self.fs)
            if "page" in look.get("break-before", ""):
                self.page_break()
            with self.panel(None, fmt, extra):
                self.children(el)
        elif "cols" in cls:
            self.columns(el, look)
        elif "land" in cls:
            self.landscape(el)
        elif "listing" in cls:
            for child in el:
                if is_tag(child) and "cap" in classes(child):
                    self.caption(child, keep_next=True, before=6 * z, after=6 * z)
                elif is_tag(child) and local(child) == "figure":
                    self.code_card(child)
        elif "eq" in cls:
            self.equation(el, mark)
        elif "eq-pair" in cls:
            self.equation_pair(el, mark)
        elif "design-page" in cls or "cover" in cls:
            if mark is not None and self.regions.get(mark):
                self.picture(mark, page_fit=True)
        elif look.get("height") and not len(el) and not (el.text or "").strip():
            height = points(look["height"], self.fs, self.body_h) or 12
            self.para(line=max(1, height), rule="exact", after=0)
        elif mark is not None and self.regions.get(mark):
            self.picture(mark)
        elif self.has_blocks(el):
            self.children(el)
        elif "".join(el.itertext()).strip():
            self.inline_para(el)

    def frame(self, fill, left=None):
        edge = fill or "FFFFFF"
        borders = {"top": (0.5, edge, 8), "bottom": (0.5, edge, 8), "right": (0.5, edge, 12)}
        if left:
            borders["left"] = (left[0], left[1], 14)
        return borders

    def children(self, el):
        loose = []

        def flush():
            if loose:
                holder = lhtml.Element("span")
                holder.text = ""
                for piece in loose:
                    if isinstance(piece, str):
                        if len(holder):
                            holder[-1].tail = (holder[-1].tail or "") + piece
                        else:
                            holder.text += piece
                    else:
                        clone = copy.deepcopy(piece)
                        clone.tail = None
                        holder.append(clone)
                if "".join(holder.itertext()).strip():
                    self.inline_para(holder)
                loose.clear()

        blocks = {"p", "div", "ul", "ol", "table", "figure", "blockquote", "dl", "h1", "h2", "h3", "pre", "section"}
        if el.text and el.text.strip():
            loose.append(el.text)
        for child in el:
            if is_tag(child) and (local(child) in blocks or "mk" in classes(child)):
                flush()
                self.block(child)
            else:
                loose.append(child if is_tag(child) else "")
            if child.tail and child.tail.strip():
                loose.append(child.tail)
        flush()

    def titled(self, el, tone):
        for child in el:
            if is_tag(child) and "at" in classes(child):
                paragraph = self.para(keep_next=True, after=3 * self.z, jc="left")
                self.inline(
                    child,
                    paragraph,
                    self.fmt(bold=True, caps=True, color=tone, size=self.fs * 0.82, tracking=self.fs * 0.08),
                )
                self.finish(paragraph)
            else:
                self.block(child)

    def endnotes(self, el):
        z = self.z
        for child in el:
            if not is_tag(child):
                continue
            cls = classes(child)
            if "nh" in cls:
                with self.panel(None, {"bold": True}):
                    self.inline_para(child, keep_next=True, before=14 * z, after=6 * z, jc="left")
                continue
            if "en" not in cls:
                self.block(child)
                continue
            number = child.find("span[@class='nn']")
            label = (number.text or "").strip() if number is not None else ""
            if number is not None:
                self.drop(number)
            size = self.fs * 0.9
            paragraph = self.para(left=1.9 * size, hanging=1.9 * size, after=4 * z, line=1.5 * size, jc="left")
            self.bookmark(paragraph, child.get("id"))
            paragraph.append(make_run(f"{label}\t" if label else "", self.fmt(size=size)))
            self.last_space = True
            self.inline(child, paragraph, self.fmt(size=size))
            self.finish(paragraph)

    def quote(self, el):
        paragraphs = [child for child in el if is_tag(child) and local(child) == "p"] or [el]
        for index, child in enumerate(paragraphs):
            last = index == len(paragraphs) - 1
            self.inline_para(
                child, style="Quote", after=14 * self.z if last else 6 * self.z, jc="both" if self.justify else "left"
            )

    def glossary(self, el):
        z = self.z
        items = [child for child in el if is_tag(child) and local(child) in ("dt", "dd")]
        for index, child in enumerate(items):
            last = index == len(items) - 1
            if local(child) == "dt":
                paragraph = self.para(keep_next=True, before=6 * z, after=0, jc="left")
                self.inline(child, paragraph, self.fmt(bold=True))
            else:
                paragraph = self.para(left=1.6 * self.fs, after=14 * z if last else 0, line=1.55 * self.fs, jc="left")
                self.inline(child, paragraph, self.fmt())
            self.finish(paragraph)

    def checklist(self, el):
        z = self.z
        items = [child for child in el if is_tag(child) and local(child) == "li"]
        for index, item in enumerate(items):
            done = "done" in classes(item)
            last = index == len(items) - 1
            paragraph = self.para(left=1.6 * self.fs, hanging=1.6 * self.fs, after=14 * z if last else 4 * z, jc="left")
            paragraph.append(make_run("\u2612\t" if done else "\u2610\t", self.fmt(color=self.accent if done else INK)))
            self.last_space = True
            self.inline(item, paragraph, self.fmt())
            self.finish(paragraph)

    def list_block(self, el, steps=False):
        kinds = {}

        def survey(node_el, depth):
            for item in node_el:
                if is_tag(item) and local(item) == "li":
                    for sub in item:
                        if is_tag(sub) and local(sub) in ("ul", "ol"):
                            kinds.setdefault(depth + 1, (local(sub) == "ol", int(sub.get("start") or 1)))
                            survey(sub, depth + 1)

        kinds[0] = (local(el) == "ol", int(el.get("start") or 1))
        survey(el, 0)
        em = self.fs
        levels = []
        for level in range(9):
            ordered, start = kinds.get(level, (False, 1))
            left = 2.6 * em if steps else 1.6 * em * (level + 1)
            hang = 2.6 * em if steps else 1.6 * em
            props = f'<w:pPr><w:ind w:left="{twips(left)}" w:hanging="{twips(hang)}"/></w:pPr>'
            mark = f'<w:rPr><w:b/><w:color w:val="{self.accent}"/></w:rPr>' if steps else ""
            if ordered:
                text = f"%{level + 1}." if not steps else f"%{level + 1}"
                levels.append(
                    f'<w:lvl w:ilvl="{level}"><w:start w:val="{start}"/><w:numFmt w:val="decimal"/>'
                    f'<w:lvlText w:val="{text}"/><w:lvlJc w:val="left"/>{props}{mark}</w:lvl>'
                )
            else:
                bullet = BULLETS[level % 3]
                levels.append(
                    f'<w:lvl w:ilvl="{level}"><w:start w:val="1"/><w:numFmt w:val="bullet"/>'
                    f'<w:lvlText w:val="{bullet}"/><w:lvlJc w:val="left"/>{props}'
                    f'<w:rPr><w:rFonts w:ascii="{attr(self.font)}" w:hAnsi="{attr(self.font)}"/></w:rPr></w:lvl>'
                )
        num = self.num_id
        self.num_id += 1
        self.add_numbering(f'<w:multiLevelType w:val="hybridMultilevel"/>{"".join(levels)}', num)
        items = []

        def gather(node_el, depth):
            for item in node_el:
                if is_tag(item) and local(item) == "li":
                    items.append((item, depth))
                    for sub in item:
                        if is_tag(sub) and local(sub) in ("ul", "ol"):
                            gather(sub, depth + 1)

        gather(el, 0)
        z = self.z
        for index, (item, depth) in enumerate(items):
            last = index == len(items) - 1
            after = (14 if steps else 10) * z if last else (9 * z if steps else 3 * z)
            paragraph = self.para(
                style="ListParagraph",
                num=(num, depth),
                after=after,
                jc="left" if steps or not self.justify else "both",
            )
            self.text(item.text, paragraph, self.fmt())
            for child in item:
                if is_tag(child) and local(child) in ("ul", "ol"):
                    break
                if is_tag(child) and local(child) == "p":
                    self.inline(child, paragraph, self.fmt())
                else:
                    self.inline_child(child, paragraph, self.fmt())
                self.text(child.tail, paragraph, self.fmt())
            self.finish(paragraph)

    def figure(self, el, mark):
        cls = classes(el)
        if "tbl" in cls:
            self.table_figure(el)
            return
        if "codecard" in cls:
            self.code_card(el)
            return
        z = self.z
        caption = next((c for c in el if is_tag(c) and local(c) == "figcaption"), None)
        sources = [c for c in el if is_tag(c) and "src" in classes(c)]
        images = [c for c in el if is_tag(c) and local(c) == "img"]
        align = (
            "left"
            if "al-left" in cls or "wrap-left" in cls
            else "right" if "al-right" in cls or "wrap-right" in cls else "center"
        )
        follows = caption is not None or bool(sources)
        placed = False
        if len(images) == 1 and not el.xpath(".//svg"):
            placed = self.image_file(images[0], el, align, keep_next=follows, after=0 if follows else 18 * z)
        if not placed and mark is not None and self.regions.get(mark):
            cut = None
            if caption is not None:
                label = caption.find("b")
                cut = "".join(label.itertext()).strip() if label is not None else None
            placed = self.picture(mark, cut=cut, align=align, keep_next=follows, after=0 if follows else 18 * z)
        if not placed:
            for image in el.iter("img"):
                placed = self.image_file(image, el, align, keep_next=True, after=4 * z, share=True) or placed
        if not placed and not follows:
            return
        if caption is not None:
            self.caption(caption, keep_next=bool(sources), after=0 if sources else 18 * z, ident=el.get("id"))
        for index, source in enumerate(sources):
            self.inline_para(source, style="FigureSource", after=18 * z if index == len(sources) - 1 else 0)
        self.last_kind = "figure"

    def caption(self, el, keep_next=False, before=None, after=None, ident=None):
        paragraph = self.para(style="Caption", keep_next=keep_next, before=before, after=after)
        italic = self.cfg.get("caption-style", "bold").lower() == "italic"
        label = el.find("b")
        fmt = self.fmt()
        if (
            label is not None
            and "lab" in classes(label)
            and label.getprevious() is None
            and not (el.text or "").strip()
        ):
            words = "".join(label.itertext()).strip()
            match = LABEL.match(words)
            bold = {**fmt, "bold": not italic}
            if match and not match.group(2):
                kind = match.group(1)
                paragraph.append(make_run(f"{kind} ", bold))
                for run in field_runs(f"SEQ {kind} \\* ARABIC", match.group(3), bold):
                    paragraph.append(run)
                if match.group(4):
                    paragraph.append(make_run(":", bold))
            else:
                paragraph.append(make_run(words, bold))
            self.last_space = False
            self.text(label.tail, paragraph, fmt)
            rest = label.getnext()
            while rest is not None:
                self.inline_child(rest, paragraph, fmt)
                self.text(rest.tail, paragraph, fmt)
                rest = rest.getnext()
        else:
            self.inline(el, paragraph, fmt)
        self.finish(paragraph)
        self.bookmark(paragraph, ident)
        return paragraph

    def image_path(self, img):
        source = img.get("src") or ""
        if not source.startswith("file:"):
            return None
        path = Path(url2pathname(unquote(urlparse(source).path)))
        if not path.is_file():
            path = Path(url2pathname(urlparse(source).path))
        return path if path.is_file() else None

    def image_file(self, img, figure, align, keep_next=False, after=None, share=False):
        from PIL import Image

        path = self.image_path(img)
        if path is None or path.suffix.lower() == ".svg":
            return False
        try:
            with Image.open(path) as picture:
                width_px, height_px = picture.size
                if path.suffix.lower() in (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tif", ".tiff"):
                    stream = str(path)
                else:
                    buffer = io.BytesIO()
                    picture.convert("RGBA" if picture.mode in ("RGBA", "LA", "P") else "RGB").save(buffer, "PNG")
                    buffer.seek(0)
                    stream = buffer
        except OSError:
            return False
        look_img, look_fig = css(img), css(figure)
        share_w = 1.0
        if "wrap" in classes(figure) and look_fig.get("width"):
            share_w = (points(look_fig["width"], self.fs, self.text_w) or self.text_w) / self.text_w
        width = points(look_img.get("width", "86%"), self.fs, self.text_w * share_w) or self.text_w * 0.86
        if share:
            width = min(width, self.text_w * 0.45)
        width = min(width, self.text_w)
        height = width * height_px / max(1, width_px)
        limit = self.body_h * 0.82
        if height > limit:
            width, height = width * limit / height, limit
        paragraph = self.para(jc=align, keep_next=keep_next, before=8 * self.z, after=after, single=True, line=None)
        self.add_picture(paragraph, stream, width, height)
        return True

    def add_picture(self, paragraph, stream, width, height):
        inline = self.doc.part.new_pic_inline(stream, Emu(int(width * 12700)), Emu(int(height * 12700)))
        run = OxmlElement("w:r")
        drawing = OxmlElement("w:drawing")
        drawing.append(inline)
        run.append(drawing)
        paragraph.append(run)

    def crop(self, mark, cut=None, page_fit=False):
        import pymupdf
        from PIL import Image, ImageChops

        spans = self.regions.get(mark) or []
        pieces = []
        for span in spans:
            if span["page"] >= len(self.pdf):
                continue
            page = self.pdf[span["page"]]
            width = page.rect.width
            left = max(0, self.margin - 14)
            right = min(width, width - self.margin + 14)
            top, bottom = span["y0"], span["y1"]
            if cut:
                hits = page.search_for(cut, clip=pymupdf.Rect(left, top, right, bottom))
                hits = [hit for hit in hits if hit.y0 > top + 6]
                if hits:
                    bottom = min(bottom, max(hit.y0 for hit in hits) - 1.5)
            if bottom - top < 2:
                continue
            pix = page.get_pixmap(dpi=DPI, clip=pymupdf.Rect(left, top, right, bottom), alpha=False)
            image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            difference = ImageChops.difference(image, Image.new("RGB", image.size, (255, 255, 255))).convert("L")
            box = difference.point(lambda value: 255 if value > 12 else 0).getbbox()
            if not box:
                continue
            pad = 4
            box = (
                max(0, box[0] - pad),
                max(0, box[1] - pad),
                min(image.width, box[2] + pad),
                min(image.height, box[3] + pad),
            )
            pieces.append(image.crop(box))
        if not pieces:
            return None
        if len(pieces) == 1:
            return pieces[0]
        total_w = max(piece.width for piece in pieces)
        total_h = sum(piece.height for piece in pieces)
        sheet = Image.new("RGB", (total_w, total_h), (255, 255, 255))
        y = 0
        for piece in pieces:
            sheet.paste(piece, ((total_w - piece.width) // 2, y))
            y += piece.height
        return sheet

    def picture(self, mark, cut=None, align="center", keep_next=False, after=None, page_fit=False, image=None):
        if image is None:
            image = self.crop(mark, cut, page_fit)
        if image is None:
            return False
        width = image.width / DPI * 72
        height = image.height / DPI * 72
        if width > self.text_w:
            width, height = self.text_w, height * self.text_w / width
        limit = self.body_h - 30
        if height > limit:
            width, height = width * limit / height, limit
        buffer = io.BytesIO()
        image.save(buffer, "PNG", dpi=(DPI, DPI), optimize=True)
        buffer.seek(0)
        if after is None:
            after = 12 * self.z
        paragraph = self.para(jc=align, keep_next=keep_next, before=6 * self.z, after=after, single=True, line=None)
        self.add_picture(paragraph, buffer, width, height)
        return True

    def own_text(self, el):
        return "".join([el.text or ""] + [child.tail or "" for child in el])

    def equation(self, el, mark):
        z = self.z
        match = MATH.search(self.own_text(el))
        cite = el.find("span[@class='eq-cite']")
        label = "".join(cite.itertext()).strip() if cite is not None else ""
        if not match:
            self.inline_para(el, jc="center")
            return
        tex = (match.group(1) if match.group(1) is not None else match.group(2)).replace(DOLLAR, "$")
        omml = self.math.get((tex, True))
        if omml is None and mark is not None and self.regions.get(mark):
            self.picture(mark, after=9 * z)
            return
        if not label:
            paragraph = self.para(jc="center", before=2 * z, after=9 * z, single=True, line=None)
            if omml is not None:
                paragraph.append(node(f"<m:oMathPara>{etree.tostring(omml).decode()}</m:oMathPara>"))
            else:
                paragraph.append(make_run(fallback_math(tex), self.fmt(italic=True)))
            self.bookmark(paragraph, el.get("id"))
            return
        side = self.text_w * 0.12
        cells = [side, self.text_w - 2 * side, side]
        table = self.plain_table(cells)
        row = table.find(qn("w:tr"))
        tcs = row.findall(qn("w:tc"))
        with self.into(tcs[1]):
            paragraph = self.para(jc="center", before=2 * z, after=2 * z, single=True, line=None)
            if omml is not None:
                paragraph.append(node(f"<m:oMathPara>{etree.tostring(omml).decode()}</m:oMathPara>"))
            else:
                paragraph.append(make_run(fallback_math(tex), self.fmt(italic=True)))
            self.bookmark(paragraph, el.get("id"))
        with self.into(tcs[2]):
            paragraph = self.para(jc="right", after=0, single=True, line=None)
            paragraph.append(make_run(label, self.fmt()))
        with self.into(tcs[0]):
            self.para(after=0)
        self.put_block(table)
        self.pending_space = 9 * z

    def equation_pair(self, el, mark):
        parts = [child for child in el if is_tag(child) and "eq" in classes(child)]
        found = []
        for part in parts:
            match = MATH.search(self.own_text(part))
            tex = (match.group(1) if match.group(1) is not None else match.group(2)) if match else ""
            found.append(self.math.get((tex.replace(DOLLAR, "$"), True)))
        if (not parts or any(item is None for item in found)) and mark is not None and self.regions.get(mark):
            self.picture(mark, after=14 * self.z)
            return
        width = self.text_w / max(1, len(parts))
        table = self.plain_table([width] * len(parts))
        for tc, omml, part in zip(table.find(qn("w:tr")).findall(qn("w:tc")), found, parts):
            with self.into(tc):
                paragraph = self.para(jc="center", after=0, single=True, line=None)
                if omml is not None:
                    paragraph.append(node(f"<m:oMathPara>{etree.tostring(omml).decode()}</m:oMathPara>"))
                else:
                    paragraph.append(make_run(fallback_math((part.text or "").strip("$ ")), self.fmt(italic=True)))
        self.put_block(table)
        self.pending_space = 14 * self.z

    def plain_table(self, widths, borders=None):
        grid = "".join(f'<w:gridCol w:w="{twips(w)}"/>' for w in widths)
        cells = "".join(
            f'<w:tc><w:tcPr><w:tcW w:w="{twips(w)}" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr></w:tc>'
            for w in widths
        )
        return node(
            f'<w:tbl><w:tblPr><w:tblW w:w="{twips(sum(widths))}" w:type="dxa"/><w:jc w:val="center"/>'
            f'<w:tblBorders>{borders or ""}</w:tblBorders><w:tblLayout w:type="fixed"/>'
            '<w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/>'
            '<w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar>'
            '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" '
            f'w:noVBand="1"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid><w:tr>{cells}</w:tr></w:tbl>'
        )

    def table_figure(self, el):
        z = self.z
        caption = next((c for c in el if is_tag(c) and local(c) == "figcaption"), None)
        if caption is not None:
            self.caption(caption, keep_next=True, before=6 * z, after=8 * z, ident=el.get("id"))
        table = el.find("table")
        if table is not None:
            self.table(table)
        sources = [c for c in el if is_tag(c) and "src" in classes(c)]
        for index, source in enumerate(sources):
            self.inline_para(
                source, style="FigureSource", before=4 * z, after=18 * z if index == len(sources) - 1 else 0
            )
        if not sources:
            self.pending_space = 18 * z
        self.last_kind = "table"

    def table(self, el):
        z = self.z
        cls = classes(el)
        style = next((c[6:] for c in cls if c.startswith("table-")), "classic")
        size = self.tbl * (0.86 if "sm" in cls else 0.76 if "xs" in cls else 1)
        rows = []
        head_rows = 0
        for section in el:
            if not is_tag(section):
                continue
            name = local(section)
            members = [section] if name == "tr" else [r for r in section if is_tag(r) and local(r) == "tr"]
            for row in members:
                rows.append((row, name == "thead"))
                head_rows += name == "thead"
        if not rows:
            return
        occupied = {}
        layout = []
        for r, (row, head) in enumerate(rows):
            c = 0
            cells = []
            for cell in row:
                if not is_tag(cell) or local(cell) not in ("td", "th"):
                    continue
                while (r, c) in occupied:
                    c += 1
                rowspan = max(1, int(cell.get("rowspan") or 1))
                colspan = max(1, int(cell.get("colspan") or 1))
                for dr in range(rowspan):
                    for dc in range(colspan):
                        occupied[(r + dr, c + dc)] = (r, c)
                cells.append((c, cell, rowspan, colspan))
                c += colspan
            layout.append(cells)
        columns = max(c for _, c in occupied) + 1
        lengths = [1.0] * columns
        for cells in layout:
            for c, cell, _, colspan in cells:
                if colspan == 1:
                    lengths[c] = max(lengths[c], len(" ".join("".join(cell.itertext()).split())))
        look = css(el)
        natural = sum(min(length, 40) * size * 0.52 + 14 for length in lengths)
        if look.get("width") and look["width"] != "auto":
            total = points(look["width"], self.fs, self.text_w) or self.text_w
        elif "auto" in look.get("width", "") or look.get("min-width"):
            minimum = points(look.get("min-width", "0%"), self.fs, self.text_w) or 0
            total = max(minimum, min(natural, self.text_w))
        else:
            total = self.text_w
        total = min(total, self.text_w)
        weights = [min(length, 40) ** 0.75 + 2 for length in lengths]
        widths = [total * w / sum(weights) for w in weights]
        grid = "".join(f'<w:gridCol w:w="{twips(w)}"/>' for w in widths)
        outer = ""
        if style == "grid":
            outer = "".join(
                f'<w:{side} w:val="single" w:sz="6" w:space="0" w:color="{RULE}"/>'
                for side in ("top", "left", "bottom", "right")
            )
            outer += "".join(
                f'<w:{side} w:val="single" w:sz="4" w:space="0" w:color="{HAIR}"/>' for side in ("insideH", "insideV")
            )
        elif style != "minimal":
            outer = f'<w:top w:val="single" w:sz="10" w:space="0" w:color="{RULE}"/><w:bottom w:val="single" w:sz="10" w:space="0" w:color="{RULE}"/>'
        align = (
            "left"
            if "0 auto 0 0" in look.get("margin", "")
            else "right" if "0 0 0 auto" in look.get("margin", "") else "center"
        )
        table = node(
            f'<w:tbl><w:tblPr><w:tblW w:w="{twips(total)}" w:type="dxa"/><w:jc w:val="{align}"/>'
            f'<w:tblBorders>{outer}</w:tblBorders><w:tblLayout w:type="autofit"/>'
            f'<w:tblCellMar><w:top w:w="{twips(2.6 * z)}" w:type="dxa"/><w:left w:w="{twips(6 * z)}" w:type="dxa"/>'
            f'<w:bottom w:w="{twips(2.6 * z)}" w:type="dxa"/><w:right w:w="{twips(6 * z)}" w:type="dxa"/></w:tblCellMar>'
            '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" '
            f'w:noVBand="1"/></w:tblPr><w:tblGrid>{grid}</w:tblGrid></w:tbl>'
        )
        body_index = 0
        for r, ((row, head), cells) in enumerate(zip(rows, layout)):
            row_cls = classes(row)
            tr = OxmlElement("w:tr")
            props = "<w:cantSplit/>" + ("<w:tblHeader/>" if head else "")
            tr.append(node(f"<w:trPr>{props}</w:trPr>"))
            starts = {c: (cell, rowspan, colspan) for c, cell, rowspan, colspan in cells}
            c = 0
            if not head:
                body_index += 1
            while c < columns:
                if c in starts:
                    cell, rowspan, colspan = starts[c]
                    tc = self.table_cell(
                        cell,
                        widths[c : c + colspan],
                        head,
                        rowspan,
                        colspan,
                        r,
                        head_rows,
                        row_cls,
                        style,
                        body_index,
                        size,
                        False,
                    )
                    tr.append(tc)
                    c += colspan
                    continue
                origin = occupied.get((r, c))
                if origin is None:
                    tr.append(self.empty_cell(widths[c], None))
                    c += 1
                    continue
                source_cells = {cc: (cell, rs, cs) for cc, cell, rs, cs in layout[origin[0]]}
                cell, rowspan, colspan = source_cells[origin[1]]
                tc = self.table_cell(
                    cell,
                    widths[c : c + colspan],
                    head,
                    rowspan,
                    colspan,
                    r,
                    head_rows,
                    row_cls,
                    style,
                    body_index,
                    size,
                    True,
                )
                tr.append(tc)
                c += colspan
            table.append(tr)
        self.put_block(table)
        self.pending_space = self.pending_space or 10 * z
        self.last_kind = "table"

    def empty_cell(self, width, merge):
        merge_xml = f'<w:vMerge w:val="{merge}"/>' if merge == "restart" else "<w:vMerge/>" if merge else ""
        return node(f'<w:tc><w:tcPr><w:tcW w:w="{twips(width)}" w:type="dxa"/>{merge_xml}</w:tcPr><w:p/></w:tc>')

    def table_cell(
        self, cell, widths, head, rowspan, colspan, r, head_rows, row_cls, style, body_index, size, continued
    ):
        z = self.z
        cls = classes(cell)
        th = local(cell) == "th"
        props = [f'<w:tcW w:w="{twips(sum(widths))}" w:type="dxa"/>']
        if colspan > 1:
            props.append(f'<w:gridSpan w:val="{colspan}"/>')
        if rowspan > 1 or continued:
            props.append('<w:vMerge w:val="restart"/>' if not continued else "<w:vMerge/>")
        borders = []
        if head and r + rowspan == head_rows and style != "grid":
            colour_ = HAIR if style == "minimal" else RULE
            borders.append(
                f'<w:bottom w:val="single" w:sz="{6 if style != "minimal" else 5}" w:space="0" w:color="{colour_}"/>'
            )
        if head and style == "grid":
            borders.append(f'<w:bottom w:val="single" w:sz="6" w:space="0" w:color="{RULE}"/>')
        if "first" in row_cls and r > head_rows and not head:
            borders.append(f'<w:top w:val="single" w:sz="4" w:space="0" w:color="{HAIR}"/>')
        if "total" in row_cls:
            borders.append(f'<w:top w:val="single" w:sz="6" w:space="0" w:color="{RULE}"/>')
        if "k" in cls:
            borders.append(f'<w:right w:val="single" w:sz="4" w:space="0" w:color="{HAIR}"/>')
        if borders:
            props.append(f"<w:tcBorders>{''.join(borders)}</w:tcBorders>")
        fill = None
        if head and style == "grid":
            fill = SOFT
        if not head and style == "striped" and body_index % 2 == 0:
            fill = SOFT
        if fill:
            props.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>')
        if th:
            pad = twips(5 * z)
            props.append(f'<w:tcMar><w:top w:w="{pad}" w:type="dxa"/><w:bottom w:w="{pad}" w:type="dxa"/></w:tcMar>')
        valign = "center" if ({"vm", "k"} & cls) else "bottom" if th else "top"
        props.append(f'<w:vAlign w:val="{valign}"/>')
        tc = node(f"<w:tc><w:tcPr>{''.join(props)}</w:tcPr></w:tc>")
        jc = "center" if ({"c", "sp", "k", "cm"} & cls) else "right" if "r" in cls else "left"
        cell_size = size - 0.5 * z if th else size
        fmt = {"size": cell_size}
        if th or "total" in row_cls:
            fmt["bold"] = True
        with self.into(tc), self.panel(None, fmt, None):
            if continued:
                self.para(after=0, line=cell_size * 1.3, jc=jc)
            else:
                blocks = self.has_blocks(cell)
                if blocks:
                    with self.panel(None, None, {"after": 0, "line": cell_size * 1.3, "jc": jc, "first": None}):
                        self.children(cell)
                if not blocks or not [c for c in tc if c.tag in (qn("w:p"), qn("w:tbl"))]:
                    self.inline_para(cell, after=0, line=cell_size * 1.3, jc=jc)
        return tc

    def code_card(self, el):
        z = self.z
        size = self.code
        bar = el.find("figcaption")
        pre = el.find(".//pre")
        terminal = "term" in classes(el)
        numbers = "nolines" not in classes(el)
        border = "D9D9D3"
        table = node(
            f'<w:tbl><w:tblPr><w:tblW w:w="{twips(self.text_w)}" w:type="dxa"/><w:jc w:val="center"/>'
            "<w:tblBorders>"
            + "".join(
                f'<w:{side} w:val="single" w:sz="4" w:space="0" w:color="{border}"/>'
                for side in ("top", "left", "bottom", "right")
            )
            + '</w:tblBorders><w:tblLayout w:type="fixed"/>'
            f'<w:tblCellMar><w:top w:w="{twips(4)}" w:type="dxa"/><w:left w:w="{twips(6)}" w:type="dxa"/>'
            f'<w:bottom w:w="{twips(4)}" w:type="dxa"/><w:right w:w="{twips(8)}" w:type="dxa"/></w:tblCellMar>'
            '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" '
            f'w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="{twips(self.text_w)}"/></w:tblGrid></w:tbl>'
        )
        if bar is not None:
            name = bar.find(".//span[@class='fname']")
            lang = bar.find(".//span[@class='lang']")
            tr = node(
                f'<w:tr><w:trPr><w:cantSplit/><w:tblHeader/></w:trPr><w:tc><w:tcPr><w:tcW w:w="{twips(self.text_w)}" w:type="dxa"/>'
                f'<w:tcBorders><w:bottom w:val="single" w:sz="4" w:space="0" w:color="{border}"/></w:tcBorders>'
                '<w:shd w:val="clear" w:color="auto" w:fill="EFEFE9"/></w:tcPr></w:tc></w:tr>'
            )
            with self.into(tr.find(qn("w:tc"))):
                paragraph = self.para(
                    after=0,
                    single=True,
                    line=None,
                    jc="left",
                    keep_next=True,
                    tabs=[("right", self.text_w - 16, "none")],
                )
                if bar.find(".//span[@class='dots3']") is not None:
                    for tint in ("ED6A5E", "F5BF4F", "61C554"):
                        paragraph.append(make_run("●", {"size": size * 1.1, "color": tint}))
                        paragraph.append(make_run(" ", {"size": size * 0.6}))
                    paragraph.append(make_run("  ", {"size": size}))
                paragraph.append(
                    make_run(
                        "".join(name.itertext()) if name is not None else "",
                        {"font": self.cfont, "size": size, "bold": True, "color": "303446"},
                    )
                )
                if lang is not None:
                    paragraph.append(
                        make_run("\t" + "".join(lang.itertext()), {"size": size * 0.95, "color": "8C8FA1"})
                    )
            table.append(tr)
        lines = (
            pre.xpath(".//div[contains(concat(' ', normalize-space(@class), ' '), ' cl ')]") if pre is not None else []
        )
        keep = "<w:trPr><w:cantSplit/></w:trPr>" if len(lines) <= 12 else ""
        tr = node(
            f'<w:tr>{keep}<w:tc><w:tcPr><w:tcW w:w="{twips(self.text_w)}" w:type="dxa"/>'
            '<w:shd w:val="clear" w:color="auto" w:fill="F8F8F5"/></w:tcPr></w:tc></w:tr>'
        )
        tc = tr.find(qn("w:tc"))
        gutter = size * 3.2 if numbers else 0
        with self.into(tc):
            for line in lines:
                number = line.find("span[@class='ln']")
                if number is None:
                    number = next((s for s in line if is_tag(s) and "ln" in classes(s)), None)
                body = next((s for s in line if is_tag(s) and "lc" in classes(s)), None)
                fill = "FFF6D5" if "hl" in classes(line) else None
                paragraph = self.para(
                    after=0,
                    line=size * 1.45,
                    jc="left",
                    left=gutter,
                    hanging=gutter if numbers else None,
                    tabs=[("right", gutter - size * 0.9, "none"), ("left", gutter, "none")] if numbers else None,
                    fill=fill,
                )
                if numbers and number is not None:
                    tint = "40A02B" if "prompt" in classes(number) else "A0A3B1"
                    paragraph.append(
                        make_run(
                            "\t" + "".join(number.itertext()) + "\t",
                            {"font": self.cfont, "size": size, "color": tint, "bold": "prompt" in classes(number)},
                        )
                    )
                elif numbers:
                    paragraph.append(make_run("\t\t", {"font": self.cfont, "size": size}))
                if body is not None:
                    self.code_runs(
                        body,
                        paragraph,
                        {"font": self.cfont, "size": size, "color": "303446" if terminal else "4C4F69", "pre": True},
                    )
            if not lines and pre is not None:
                for text in "".join(pre.itertext()).split("\n"):
                    paragraph = self.para(after=0, line=size * 1.45, jc="left")
                    paragraph.append(make_run(text, {"font": self.cfont, "size": size, "pre": True}))
            if not [c for c in tc if c.tag == qn("w:p")]:
                self.para(after=0)
        table.append(tr)
        self.put_block(table)
        self.pending_space = 12 * z
        self.last_kind = "code"

    def code_runs(self, el, paragraph, fmt):
        if el.text:
            paragraph.append(make_run(el.text.replace("\u200b", "").replace(DOLLAR, "$"), fmt))
        for child in el:
            if is_tag(child):
                tint = next((CODE_COLORS[c] for c in classes(child) if c in CODE_COLORS), None)
                inner = {**fmt}
                if tint:
                    inner["color"] = tint[0]
                    if tint[1]:
                        inner["italic"] = True
                self.code_runs(child, paragraph, inner)
            if child.tail:
                paragraph.append(make_run(child.tail.replace(DOLLAR, "$"), fmt))

    def code_lines(self, el):
        for text in "".join(el.itertext()).replace(DOLLAR, "$").split("\n"):
            paragraph = self.para(after=0, line=self.code * 1.45, jc="left", fill="F8F8F5")
            paragraph.append(make_run(text, {"font": self.cfont, "size": self.code}))
        self.pending_space = 12 * self.z

    def columns(self, el, look):
        count = 2
        match = re.search(r"\d+", look.get("column-count", "2"))
        if match:
            count = max(1, int(match.group(0)))
        gap = points(look.get("column-gap", "8mm"), self.fs) or 22
        rule = "solid" in look.get("column-rule", "")
        if self.target is not None:
            self.children(el)
            return
        self.section_break(cols=(count, gap, rule), continuous=True)
        self.children(el)
        self.section_break(cols=(1, 36, False), continuous=True)

    def landscape(self, el):
        if self.target is not None:
            self.children(el)
            return
        if self.emitted:
            self.section_break(landscape=True)
        else:
            put(
                self.sect,
                node(f'<w:pgSz w:w="{twips(self.page_h)}" w:h="{twips(self.page_w)}" w:orient="landscape"/>'),
                ORDERS["sectPr"],
            )
            self.text_w = self.page_h - 2 * self.margin
        self.children(el)
        self.section_break(landscape=False)

    def cover(self, el):
        cls = classes(el)
        z = self.z
        if "cv-free" in cls:
            image = self.page_image(0)
            if image is not None:
                self.picture(None, image=image, after=0)
            self.front_cover = True
            self.page_break()
            return
        mm = 72 / 25.4
        rows = [[], [], []]
        fills = [None, None, None]
        if "cover-ib" in cls:
            align = "center"
            subject = el.find(".//div[@class='ib-subject']")
            category = subject.find(".//span[@class='ib-category']") if subject is not None else None
            if category is not None:
                self.drop(category)
            if self.has_text(subject):
                size = 13 * z
                rows[0].append(
                    (
                        subject,
                        {"size": size, "bold": True, "caps": True, "tracking": size * 0.08},
                        {"line": size * 1.5, "before": 14 * mm * z},
                    )
                )
            if self.has_text(category):
                rows[0].append((category, {"size": 11 * z, "color": MUTE}, {"before": 3}))
            title = el.find(".//div[@class='ib-title']")
            if self.has_text(title):
                size = 22 * z
                rows[1].append(
                    (
                        title,
                        {"size": size, "bold": True},
                        {"line": size * 1.3, "after": 16 * z, **self.balance(title, size, 0.55)},
                    )
                )
            label = el.find(".//div[@class='ib-label']")
            if self.has_text(label):
                size = 10 * z
                side = self.text_w * 0.27
                look = {"size": size, "bold": True, "caps": True, "color": MUTE, "tracking": size * 0.14}
                rows[1].append(
                    (label, look, {"before": 18 * z, "borders": {"top": (1, RULE, 16)}, "left": side, "right": side})
                )
            question = el.find(".//p[@class='ib-question']")
            if self.has_text(question):
                size = 14 * z
                rows[1].append(
                    (
                        question,
                        {"size": size, "italic": True},
                        {"before": 10 * z, "line": size * 1.6, **self.balance(question, size, 0.47)},
                    )
                )
            foot = el.find(".//div[@class='ib-foot']")
            if self.has_text(foot):
                rows[2].append((foot, {"size": 12 * z}, {"line": 12 * z * 1.6, "after": 6 * mm * z}))
        else:
            look = css(el)
            style = next(
                (c[3:] for c in cls if c.startswith("cv-") and c not in ("cv-left", "cv-center", "cv-right")), "modern"
            )
            tone = colour(look.get("--cv-bg"), self.accent) or self.accent
            ink = colour(look.get("--cv-fg"), self.accent) or "FFFFFF"
            align = "center" if style == "formal" or "cv-center" in cls else "right" if "cv-right" in cls else "left"
            if style == "banner":
                fills[0] = fills[1] = tone
            elif style == "image":
                fills = [tone, tone, tone]
            light = {0: ink, 1: ink} if style == "banner" else {0: ink, 1: ink, 2: ink} if style == "image" else {}
            kicker = el.find(".//div[@class='cv-kicker']")
            if self.has_text(kicker):
                colour_ = INK if style == "formal" else MUTE if style == "minimal" else tone
                rows[0].append(
                    (
                        kicker,
                        {"size": 11, "bold": True, "caps": True, "tracking": 11 * 0.16, "color": light.get(0, colour_)},
                        {"before": 8 * mm, "line": 15},
                    )
                )
            title = el.find(".//div[@class='cv-title']")
            size = {"formal": 25, "modern": 34, "minimal": 38, "banner": 34, "image": 38}.get(style, 30)
            middle = {}
            if style == "modern":
                middle = {"borders": {"left": (6, tone, 22)}, "left": 8 * mm + 6}
            if style == "formal":
                middle = {"borders": {"top": (1.4, RULE, 31), "bottom": (1.4, RULE, 31)}}
            if self.has_text(title):
                fmt = {"size": size, "bold": style != "minimal", "font": self.hfont, "color": light.get(1, INK)}
                rows[1].append((title, fmt, {"line": size * 1.18, **middle}))
            subtitle = el.find(".//p[@class='cv-subtitle']")
            if self.has_text(subtitle):
                rows[1].append(
                    (
                        subtitle,
                        {"size": 15, "italic": True, "color": light.get(1, MUTE)},
                        {"before": 12, "line": 15 * 1.45, **middle},
                    )
                )
            items = []
            for item in el.iter("div"):
                if "cv-item" in classes(item):
                    label, value = item.find("b"), item.find("span")
                    if self.has_text(value):
                        items.append((label, value))
            edge = {"modern": (0.8, HAIR), "minimal": (0.8, RULE)}.get(style)
            first = {"borders": {"top": (edge[0], edge[1], 22)}} if edge else {}
            for index in range(0, len(items), 2):
                pair = items[index : index + 2]
                rows[2].append(
                    (
                        "pair",
                        pair,
                        {**(first if index == 0 else {}), "before": 10 if index else 0, "tint": light.get(2)},
                    )
                )
            foot = el.find(".//div[@class='cv-foot']")
            if self.has_text(foot):
                rows[2].append(
                    (
                        foot,
                        {"size": 11, "color": light.get(2, MUTE)},
                        {"line": 11 * 1.6, "before": 14, **(first if not items else {})},
                    )
                )
            if rows[2]:
                last = rows[2][-1]
                rows[2][-1] = (last[0], last[1], {**last[2], "after": 4 * mm})
        height = self.body_h - 30
        needs = [sum(self.estimate(spec) for spec in row) for row in rows]
        heights = [needs[0], max(needs[1], height - needs[0] - needs[2]), needs[2]]
        lower = "center"
        if "cv-banner" in cls:
            heights[1] = max(needs[1], self.page_h * 0.5 - self.margin - needs[0])
            heights[2] = max(needs[2], height - heights[0] - heights[1])
            lower = "bottom"
        elif {"cv-minimal", "cv-image"} & cls:
            lower = "bottom"
        trs = "".join(
            f'<w:tr><w:trPr><w:trHeight w:val="{twips(max(h, 2))}" w:hRule="atLeast"/></w:trPr><w:tc><w:tcPr>'
            f'<w:tcW w:w="{twips(self.text_w)}" w:type="dxa"/>'
            + (f'<w:shd w:val="clear" w:color="auto" w:fill="{fill}"/>' if fill else "")
            + f'<w:vAlign w:val="{v}"/></w:tcPr></w:tc></w:tr>'
            for h, v, fill in zip(heights, ("top", lower, "bottom"), fills)
        )
        pad = twips(10) if any(fills) else "0"
        table = node(
            f'<w:tbl><w:tblPr><w:tblW w:w="{twips(self.text_w)}" w:type="dxa"/><w:jc w:val="center"/>'
            '<w:tblBorders/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/>'
            f'<w:left w:w="{pad}" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="{pad}" w:type="dxa"/></w:tblCellMar>'
            '<w:tblLook w:val="0000" w:firstRow="0" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="1" '
            f'w:noVBand="1"/></w:tblPr><w:tblGrid><w:gridCol w:w="{twips(self.text_w)}"/></w:tblGrid>{trs}</w:tbl>'
        )
        for tr, specs in zip(table.findall(qn("w:tr")), rows):
            with self.into(tr.find(qn("w:tc"))):
                for item, fmt, options in specs:
                    if isinstance(item, str):
                        self.cover_pair(fmt, options, align)
                        continue
                    paragraph = self.para(**{"jc": align, "after": 0, "line": fmt.get("size", 12) * 1.5, **options})
                    self.inline(item, paragraph, {**fmt})
                    self.finish(paragraph)
                if not specs:
                    self.para(after=0, line=1, rule="exact")
        self.put_block(table)
        self.sect.addprevious(self.spacer())
        self.emitted = True
        self.at_top = False
        self.front_cover = True
        self.page_break()

    def has_text(self, el):
        return el is not None and bool("".join(el.itertext()).strip())

    def estimate(self, spec):
        item, fmt, options = spec
        if isinstance(item, str):
            return 8.2 * 1.6 + 12 * 1.35 + (options.get("before") or 0) + 24 * bool(options.get("borders"))
        size = fmt.get("size", 12)
        width = self.text_w - (options.get("left") or 0) - (options.get("right") or 0)
        text = re.sub(r"\s+", " ", "".join(item.itertext())).strip()
        breaks = len(item.findall(".//br"))
        lines = max(1, -(-len(text) * size * 0.52 // max(width, 1))) + breaks
        line = options.get("line") or size * 1.5
        extra = sum(border[2] + border[0] for border in (options.get("borders") or {}).values())
        return lines * line + (options.get("before") or 0) + (options.get("after") or 0) + extra

    def cover_pair(self, pair, options, align):
        tint = options.get("tint")
        half_w = self.text_w / 2
        if align == "center":
            tabs = [("center", half_w / 2, "none"), ("center", half_w * 1.5, "none")]
        else:
            tabs = [("left", half_w + 12, "none")]
        borders = options.get("borders")
        for row, look in (
            (0, {"size": 8.2, "bold": True, "caps": True, "tracking": 8.2 * 0.14, "color": tint or MUTE}),
            (1, {"size": 12, "color": tint or INK}),
        ):
            paragraph = self.para(
                jc="left",
                tabs=tabs,
                after=0,
                before=options.get("before") if row == 0 else 2,
                line=look["size"] * (1.6 if row == 0 else 1.35),
                borders=borders if row == 0 else None,
                keep_next=row == 0,
            )
            for index, (label, value) in enumerate(pair):
                if align == "center" or index:
                    paragraph.append(make_run("\t", look))
                    self.last_space = True
                source = label if row == 0 else value
                if source is not None:
                    self.inline(source, paragraph, dict(look))
            self.finish(paragraph)

    def balance(self, el, size, factor):
        text = re.sub(r"\s+", " ", "".join(el.itertext())).strip()
        room = self.text_w - 2 * 8 * 72 / 25.4 * self.z
        needed = len(text) * size * factor
        if needed <= room:
            return {"left": 8 * 72 / 25.4 * self.z, "right": 8 * 72 / 25.4 * self.z}
        lines = -(-needed // room)
        width = min(room, needed / lines * 1.1)
        side = (self.text_w - width) / 2
        return {"left": side, "right": side}

    def page_image(self, index):
        import pymupdf
        from PIL import Image

        if index >= len(self.pdf):
            return None
        page = self.pdf[index]
        rect = pymupdf.Rect(
            self.margin - 2, self.margin - 2, page.rect.width - self.margin + 2, page.rect.height - self.margin + 2
        )
        pix = page.get_pixmap(dpi=DPI, clip=rect, alpha=False)
        return Image.frombytes("RGB", (pix.width, pix.height), pix.samples)

    def contents(self, el):
        z = self.z
        self.page_break()
        heading = el.find("h1")
        paragraph = self.para(style="TOCHeading")
        self.inline(heading, paragraph, self.fmt(), numbers=False)
        self.finish(paragraph)
        depth = "1-1" if self.cfg.get("contents-depth", "").strip() == "1" else "1-2"
        entries = []
        first = self.first_body_page()
        for level, title, mark in self.toc_entries:
            if level == 2 and depth == "1-1":
                continue
            page = ""
            spans = self.regions.get(mark) if mark is not None else None
            if spans and first is not None:
                page = str(spans[0]["page"] - first + 1)
            entries.append((f"TOC{level}", title, page))
        self.field_block(f'TOC \\o "{depth}" \\h \\z \\u', entries)
        title = None
        for child in el:
            if not is_tag(child):
                continue
            if "lo-title" in classes(child):
                title = child
            elif local(child) == "nav" and title is not None:
                paragraph = self.para(keep_next=True, before=22 * z, after=6 * z, jc="left")
                self.inline(title, paragraph, self.fmt(bold=True, size=14 * z))
                self.finish(paragraph)
                kind = "Table" if "Table" in "".join(title.itertext()) else "Figure"
                rows = []
                for link in child.iter("a"):
                    number = link.find("span[@class='n']")
                    text = link.find("span[@class='t']")
                    label = "".join(number.itertext()).strip() if number is not None else ""
                    words = re.sub(r"\s+", " ", "".join(text.itertext())).strip() if text is not None else ""
                    target = (link.get("href") or "#")[1:]
                    page = self.anchor_page(target, first)
                    rows.append(("TableofFigures", f"{label}: {words}" if words else label, page))
                self.field_block(f'TOC \\h \\z \\c "{kind}"', rows)
                title = None

    def first_body_page(self):
        continuous = self.cfg.get("page-numbering", "body").strip().lower() == "continuous"
        if continuous:
            return 0
        pages = [
            spans[0]["page"]
            for level, _, mark in self.toc_entries
            for spans in [self.regions.get(mark) if mark is not None else None]
            if spans
        ]
        return min(pages) if pages else None

    def anchor_page(self, anchor, first):
        mark = self.anchor_marks.get(anchor)
        spans = self.regions.get(mark) if mark is not None else None
        if first is None or not spans:
            return ""
        return str(spans[0]["page"] - first + 1)

    def field_block(self, instruction, entries):
        entries = entries or [("TOC1", "", "")]
        for index, (style, text, page) in enumerate(entries):
            paragraph = self.para(style=style)
            if index == 0:
                paragraph.append(node('<w:r><w:fldChar w:fldCharType="begin"/></w:r>'))
                paragraph.append(
                    node(f'<w:r><w:instrText xml:space="preserve"> {attr(instruction)} </w:instrText></w:r>')
                )
                paragraph.append(node('<w:r><w:fldChar w:fldCharType="separate"/></w:r>'))
            if text:
                paragraph.append(make_run(f"{text}\t{page}", {}))
            if index == len(entries) - 1:
                paragraph.append(node('<w:r><w:fldChar w:fldCharType="end"/></w:r>'))

    def trim_end(self):
        last = self.sect.getprevious()
        if last is not None and last.tag == qn("w:tbl"):
            self.sect.addprevious(self.spacer())

    def furniture_runs(self, paragraph, text, values, fmt, part):
        pieces = re.split(r"(\{\w+\})", text)
        for piece in pieces:
            token = piece[1:-1] if re.fullmatch(r"\{\w+\}", piece) else None
            if token in ("page", "n"):
                for run in field_runs("PAGE", "1", fmt):
                    paragraph.append(run)
            elif token == "pages":
                self.total_pages(paragraph, fmt)
            elif token == "section":
                for run in field_runs('STYLEREF "heading 1" \\* MERGEFORMAT', "", fmt):
                    paragraph.append(run)
            elif token in values:
                paragraph.append(make_run(values[token], fmt))
            elif piece:
                paragraph.append(make_run(piece, fmt))

    def total_pages(self, paragraph, fmt):
        front = self.front_pages
        if not front:
            for run in field_runs("NUMPAGES", "1", fmt):
                paragraph.append(run)
            return
        props = rpr_xml(fmt)
        head = f"<w:rPr>{props}</w:rPr>" if props else ""
        sequence = [
            f'<w:r>{head}<w:fldChar w:fldCharType="begin"/></w:r>',
            f'<w:r>{head}<w:instrText xml:space="preserve"> = </w:instrText></w:r>',
            f'<w:r>{head}<w:fldChar w:fldCharType="begin"/></w:r>',
            f'<w:r>{head}<w:instrText xml:space="preserve"> NUMPAGES </w:instrText></w:r>',
            f'<w:r>{head}<w:fldChar w:fldCharType="separate"/></w:r>',
            f"<w:r>{head}<w:t>{front + 1}</w:t></w:r>",
            f'<w:r>{head}<w:fldChar w:fldCharType="end"/></w:r>',
            f'<w:r>{head}<w:instrText xml:space="preserve"> - {front} </w:instrText></w:r>',
            f'<w:r>{head}<w:fldChar w:fldCharType="separate"/></w:r>',
            f"<w:r>{head}<w:t>1</w:t></w:r>",
            f'<w:r>{head}<w:fldChar w:fldCharType="end"/></w:r>',
        ]
        for markup in sequence:
            paragraph.append(node(markup))

    def fill_story(self, story, text, kind):
        element = story._element
        for child in list(element):
            element.remove(child)
        number = kind == "number"
        fmt = {"size": 10.5, "color": "454545"} if number else {"size": 9.5, "color": "616161"}
        props = ppr_xml({"style": "Footer" if kind != "header" else "Header", "jc": "center" if number else "left"})
        paragraph = node(f"<w:p><w:pPr>{props}</w:pPr></w:p>")
        element.append(paragraph)
        if not text:
            return
        values = {
            "title": re.sub(r"\s+", " ", self.result.get("title") or ""),
            "author": self.cfg.get("author", "").strip(),
            "date": self.date_text(),
        }
        if number:
            self.furniture_runs(paragraph, text, values, fmt, story.part)
            return
        parts = [part.strip() for part in text.split("|")]
        if len(parts) == 1:
            parts = ["", parts[0], ""]
        elif len(parts) == 2:
            parts = [parts[0], "", parts[1]]
        props = rpr_xml(fmt)
        for index, part in enumerate(parts[:3]):
            if index:
                where = "center" if index == 1 else "right"
                paragraph.append(
                    node(
                        f"<w:r><w:rPr>{props}</w:rPr>"
                        f'<w:ptab w:relativeTo="margin" w:alignment="{where}" w:leader="none"/></w:r>'
                    )
                )
            self.furniture_runs(paragraph, part, values, fmt, story.part)

    def date_text(self):
        from datetime import date

        value = self.cfg.get("date", "").strip()
        if value and value.lower() != "today":
            return value
        now = date.today()
        return f"{now.day} {now.strftime('%B %Y')}"

    def page_furniture(self):
        sections = self.doc.sections
        continuous = self.cfg.get("page-numbering", "body").strip().lower() == "continuous"
        numbered = self.cfg.get("page-numbers", "yes").strip().lower() not in OFF
        header = self.cfg.get("header", "").strip()
        footer = self.cfg.get("footer", "").strip()
        pattern = self.page_style()[0]
        start = min(self.body_index, len(sections) - 1)
        section = sections[start]
        first = self.first_body_page()
        self.front_pages = 0 if continuous else (first or 0)
        if continuous:
            style = FORMATS.get(self.page_style()[1], "decimal")
            if style != "decimal":
                put(sections[0]._sectPr, node(f'<w:pgNumType w:fmt="{style}"/>'), ORDERS["sectPr"])
        footer_text = footer or (pattern if numbered else "")
        footer_kind = "footer" if footer else "number"
        if footer_text:
            section.footer.is_linked_to_previous = False
            self.fill_story(section.footer, footer_text, footer_kind)
        if header:
            section.header.is_linked_to_previous = False
            self.fill_story(section.header, header, "header")
        cover = getattr(self, "front_cover", False)
        skip_header = self.cfg.get("header-on-first", "yes").strip().lower() in OFF
        skip_footer = self.cfg.get("footer-on-first", "yes").strip().lower() in OFF
        if continuous and cover and start == 0:
            section.different_first_page_header_footer = True
            section.first_page_footer.is_linked_to_previous = False
            self.fill_story(section.first_page_footer, "", "footer")
            section.first_page_header.is_linked_to_previous = False
            self.fill_story(section.first_page_header, "", "header")
        elif (skip_header and header) or (skip_footer and footer):
            section.different_first_page_header_footer = True
            section.first_page_footer.is_linked_to_previous = False
            self.fill_story(
                section.first_page_footer, "" if skip_footer else footer_text, "" if skip_footer else footer_kind
            )
            section.first_page_header.is_linked_to_previous = False
            self.fill_story(section.first_page_header, "" if skip_header else header, "header")
        for later in sections[start + 1 :]:
            if later._sectPr.find(qn("w:titlePg")) is not None:
                later._sectPr.remove(later._sectPr.find(qn("w:titlePg")))


def export(essay, output, source=None):
    import build
    from .parse import compile_text

    essay = Path(essay).resolve()
    output = Path(output).resolve()
    if source is None:
        source = essay.read_text(encoding="utf-8-sig")
    source = re.sub(r"(?im)^watermark\s*:.*$", "%%", source)
    work = Path(tempfile.mkdtemp(prefix="essay-docx-"))
    try:
        result = build.studio_build(essay, source, work / "render.pdf")
        if result.get("errors"):
            first = result["errors"][0]
            raise ValueError(f"{len(result['errors'])} error(s) in {essay.name}: {first}")
        compiler, _, body, title, _ = compile_text(essay, source, True)
        result["title"] = result.get("title") or title
        writer = Writer(compiler, body, result, work / "render.pdf", work)
        try:
            writer.build(body)
            output.parent.mkdir(parents=True, exist_ok=True)
            writer.doc.save(str(output))
        finally:
            writer.pdf.close()
    finally:
        shutil.rmtree(work, ignore_errors=True)
    return {"pages": result.get("pages"), "words": result.get("words"), "path": str(output)}
