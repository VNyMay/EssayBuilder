import re

from .styling import style_css

KINDS = {"fig", "tbl", "eq", "code", "sec", "def", "thm", "lem", "prop", "cor", "ex", "rem"}
TOKEN = re.compile(
    r"(?P<esc>\\[\\`*_$#\[\]{}()|~@<>!+.\-])"
    r"|(?P<code>(?P<tick>`+)(?P<cbody>.+?)(?<!`)(?P=tick)(?!`))"
    r"|(?P<dm>\$\$(?P<dbody>.+?)\$\$)"
    r"|(?P<im>\$(?=[^\s$])(?P<mbody>(?:\\.|[^$\\])+?)(?<=[^\s\\])\$(?!\d))",
    re.S,
)
REF = re.compile(r"@(" + "|".join(sorted(KINDS)) + r")[:]([A-Za-z][\w-]*)")
CITE = re.compile(
    r"\[((?:-?@(?!(?:fig|tbl|eq|code|sec|def|thm|lem|prop|cor|ex|rem):)[A-Za-z][\w:.-]*)(?:\s*,\s*[^\];@]+?)?"
    r"(?:\s*;\s*-?@[A-Za-z][\w:.-]*(?:\s*,\s*[^\];@]+?)?)*)\]"
)
NARRATIVE = re.compile(r"(?<![\w@/.])(@(?!(?:fig|tbl|eq|code|sec|def|thm|lem|prop|cor|ex|rem):)[A-Za-z][A-Za-z0-9_-]*\d[A-Za-z0-9_-]*)")
SPECIAL = {"$": "&#36;", "<": "&lt;", ">": "&gt;"}
HARD_BREAK = "\x02"


def escape(text):
    return re.sub(r"&(?!#?\w+;)", "&amp;", text).replace("<", "&lt;").replace(">", "&gt;")


def attr(text):
    return escape(text).replace('"', "&quot;")


CHEM = re.compile(r"\\ce\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\}")


PLAIN = "\ue000"
LATEX_HINT = re.compile(r"\\[A-Za-z\\{}\[\],;:!|]|[\^_]\{")


def is_plain(source, mode="auto"):
    if mode == "latex" or not source.strip():
        return False
    return mode == "plain" or not LATEX_HINT.search(source)


def plain_math(source):
    return PLAIN + source.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def clean_math(source, mode="auto"):
    if is_plain(source, mode):
        return plain_math(source)
    parts, last = [], 0
    for match in CHEM.finditer(source):
        parts.append(clean_plain(source[last: match.start()]))
        parts.append(match.group(0).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;"))
        last = match.end()
    parts.append(clean_plain(source[last:]))
    return "".join(parts)


def clean_plain(source):
    source = source.replace("<=", r"\leq ").replace(">=", r"\geq ").replace("!=", r"\neq ")
    source = source.replace("<-", r"\leftarrow ").replace("->", r"\to ").replace("=>", r"\Rightarrow ")
    return source.replace("<", r"\lt ").replace(">", r"\gt ")


NOTE_REF = re.compile(r"(?<!\\)\[\^([\w-]+)\]")


def note_end(text, start):
    depth = 0
    for k in range(start, len(text)):
        if text[k] == "[":
            depth += 1
        elif text[k] == "]":
            depth -= 1
            if depth == 0:
                return k
    return -1


def pull_notes(text, doc, where, keep):
    out, at = [], 0
    while True:
        ref = NOTE_REF.search(text, at)
        start = text.find("^[", at)
        if ref and (start < 0 or ref.start() < start):
            out.append(text[at : ref.start()])
            out.append(keep(doc.note_marker(ref.group(1), None, where)))
            at = ref.end()
            continue
        if start < 0:
            break
        end = note_end(text, start + 1)
        if end < 0 or (start and text[start - 1] == "\\"):
            out.append(text[at : start + 2])
            at = start + 2
            continue
        out.append(text[at:start])
        out.append(keep(doc.note_marker(None, text[start + 2 : end], where)))
        at = end + 1
    out.append(text[at:])
    return "".join(out)


def render_inline(text, doc=None, where=""):
    store = []

    def keep(html):
        store.append(html)
        return f"\x00{len(store) - 1}\x00"

    def token(match):
        if match.group("esc"):
            char = match.group("esc")[1]
            return keep(SPECIAL.get(char, char))
        if match.group("code"):
            return keep(f'<code class="inline">{escape(match.group("cbody").strip())}</code>')
        mode = doc.cfg.get("math-input", "auto") if doc is not None else "auto"
        if match.group("dm"):
            return keep("$$" + clean_math(match.group("dbody"), mode) + "$$")
        return keep("$" + clean_math(match.group("mbody"), mode) + "$")

    if doc is not None and hasattr(doc, "note_marker"):
        text = pull_notes(text, doc, where, keep)

    text = TOKEN.sub(token, text)
    text = escape(text)

    def link(match):
        return keep(f'<a class="url" href="{attr(match.group(2))}">') + match.group(1) + keep("</a>")

    text = re.sub(r"\[([^\]\x00]*(?:\x00\d+\x00[^\]\x00]*)*)\]\(([^)\s]+)\)", link, text)

    def span(match):
        css = style_css(match.group(2), doc, where)
        return keep(f'<span style="{css}">') + match.group(1) + keep("</span>")

    text = re.sub(r"\[([^\]\x00]*(?:\x00\d+\x00[^\]\x00]*)*)\]\{([^{}]*)\}", span, text)

    def cite(match):
        return keep(doc.add_cite(match.group(1), False, where))

    def narrative(match):
        return keep(doc.add_cite(match.group(1), True, where))

    if doc is not None and hasattr(doc, "add_cite"):
        text = CITE.sub(cite, text)
        text = NARRATIVE.sub(narrative, text)

    def bare(match):
        url, trail = match.group(0), ""
        while url and url[-1] in ".,;:)]!?'\"":
            url, trail = url[:-1], url[-1] + trail
        return keep(f'<a class="url" href="{url}">{url}</a>') + trail

    text = re.sub(r"(?<![\w/@])https?://[^\s\x00<>]+", bare, text)

    text = re.sub(r"\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*", r"<strong><em>\1</em></strong>", text)
    text = re.sub(r"\*\*(?=\S)(.+?)(?<=\S)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\w*])\*(?=[^\s*])(.+?)(?<=[^\s*])\*(?![\w*])", r"<em>\1</em>", text)
    text = re.sub(r"(?<!\w)__(?=\S)(.+?)(?<=\S)__(?!\w)", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<!\w)_(?=[^\s_])(.+?)(?<=[^\s_])_(?!\w)", r"<em>\1</em>", text)

    def reference(match):
        kind, ident = match.group(1), match.group(2).rstrip("-")
        if doc is not None:
            doc.refs.append((kind, ident, where))
        return f"\x01{kind}:{ident}\x01"

    text = REF.sub(reference, text)
    text = text.replace(HARD_BREAK, "<br>")

    for _ in range(4):
        if "\x00" not in text:
            break
        text = re.sub(r"\x00(\d+)\x00", lambda m: store[int(m.group(1))], text)
    return text


def plain(text):
    text = re.sub(r"\$[^$]*\$", "", text)
    text = re.sub(r"<[^>]+>|[*_`]", "", text)
    return text.strip()
