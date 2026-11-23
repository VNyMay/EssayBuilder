import html

from pygments.lexers import TextLexer, get_lexer_by_name, get_lexer_for_filename
from pygments.token import STANDARD_TYPES
from pygments.util import ClassNotFound


def lexer_for(name=None, language=None):
    try:
        if language:
            return get_lexer_by_name(language)
        return get_lexer_for_filename(name)
    except ClassNotFound:
        return None


def highlight(source, name=None, language=None):
    lexer = lexer_for(name, language)
    known = lexer is not None
    lexer = lexer or TextLexer()
    source = source.expandtabs(4).replace("\r\n", "\n").rstrip("\n") + "\n"
    lines, current = [], []

    for kind, value in lexer.get_tokens(source):
        while kind not in STANDARD_TYPES:
            kind = kind.parent
        css = STANDARD_TYPES[kind]

        for i, piece in enumerate(value.split("\n")):
            if i:
                lines.append(current)
                current = []
            if piece:
                text = html.escape(piece, quote=False)
                current.append(f'<span class="{css}">{text}</span>' if css else text)

    return lines, (lexer.name if known else "Text")


def card(name, label, rows, kind="", ident="", numbers=True, caption=""):
    cells = [
        f'<div class="cl{" hl" if mark else ""}">'
        + (f'<span class="ln{" prompt" if kind else ""}">{number}</span>' if numbers else "")
        + f'<span class="lc">{"".join(parts) or "&#8203;"}</span></div>'
        for number, parts, mark in rows
    ]
    short = len(rows) <= 12  # a tiny listing stays whole; longer ones may break between pages, ...
    if len(cells) > 12:  # ... but never leaving fewer than 3 lines on either side of the break
        cells = ['<div class="cg">' + "".join(cells[:3]) + "</div>", *cells[3:-3], '<div class="cg">' + "".join(cells[-3:]) + "</div>"]
    body = "".join(cells)
    classes = "codecard nonum" + (" " + kind.strip() if kind else "") + ("" if numbers else " nolines") + (" short" if short else "")
    id_attr = ' id="' + ident + '"' if ident else ""
    figure = (
        f'<figure class="{classes}"{id_attr}>'
        '<figcaption class="bar"><span class="dots3"><i></i><i></i><i></i></span>'
        f'<span class="fname">{html.escape(name)}</span><span class="lang">{html.escape(label)}</span>'
        f'</figcaption><pre class="code">{body}</pre></figure>'
    )
    return f'<div class="listing{" short" if short else ""}">{caption}{figure}</div>' if caption else figure


def terminal_rows(lines):
    commands = [line for line in lines if line.startswith(("$ ", "> "))]
    rows = []
    for line in lines:
        if not line.strip():
            rows.append(("", [], False))
        elif commands and not line.startswith(("$ ", "> ")):
            rows.append(("", [html.escape(line)], False))
        else:
            text = line[2:] if commands else line.strip()
            rows.append(("$", [html.escape(text.strip())], False))
    return rows
