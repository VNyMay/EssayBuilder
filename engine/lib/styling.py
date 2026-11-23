import re

from .fonts import parse_family

SIZES = {"tiny": "0.7em", "small": "0.85em", "large": "1.25em", "xl": "1.6em", "xxl": "2.2em", "huge": "3em"}
SIZE = re.compile(r"^\d+(?:\.\d+)?(?:pt|px|em|rem|%)?$")
COLOR = re.compile(r"^(?:#[0-9a-fA-F]{3,8}|[a-zA-Z]{3,20}|rgba?\(\s*\d{1,3}\s*(?:,\s*\d{1,3}\s*){2}(?:,\s*[\d.]+\s*)?\))$")
PAIR = re.compile(r"([A-Za-z][\w-]*)\s*=\s*(\"[^\"]*\"|\'[^\']*\'|[^\s\"\']+)|([A-Za-z][\w-]*)")
HIGHLIGHT = "#fff3a3"
FLAGS = {
    "bold": "font-weight:700", "italic": "font-style:italic", "underline": "text-decoration:underline",
    "strike": "text-decoration:line-through", "smallcaps": "font-variant:small-caps",
    "caps": "text-transform:uppercase", "sup": "vertical-align:super;font-size:0.75em",
    "sub": "vertical-align:sub;font-size:0.75em", "nowrap": "white-space:nowrap",
}
KEYS = {"size", "font", "color", "bg", "highlight", "spacing", "weight", "line", "align", "indent"}


def length(value):
    value = SIZES.get(value.lower(), value)
    if not SIZE.match(value):
        return None
    return value if re.search(r"[a-z%]$", value) else f"{value}pt"


def color(value):
    if value.lower() == "accent":
        return "var(--accent)"
    return value if COLOR.match(value) else None


def style_css(text, doc=None, where=""):
    parts, problems = [], []
    for key, raw, flag in PAIR.findall(text):
        if flag:
            key = flag.lower()
            if key == "highlight":
                parts.append(f"background-color:{HIGHLIGHT};padding:0 1pt")
            elif key in FLAGS:
                parts.append(FLAGS[key])
            else:
                problems.append(f"unknown style '{flag}'")
            continue
        key, value = key.lower(), raw.strip("\"'")
        if key == "size":
            css = length(value)
            parts.append(f"font-size:{css}") if css else problems.append(f"bad size '{value}'")
        elif key == "font":
            name = parse_family(value)[0]
            if doc is not None:
                doc.text_fonts.add(name)
            parts.append(f"font-family:'{name}',var(--font)")
        elif key == "color":
            css = color(value)
            parts.append(f"color:{css}") if css else problems.append(f"bad colour '{value}'")
        elif key in {"bg", "highlight"}:
            css = color(value)
            parts.append(f"background-color:{css};padding:0 1pt") if css else problems.append(f"bad colour '{value}'")
        elif key == "spacing":
            css = length(value)
            parts.append(f"letter-spacing:{css}") if css else problems.append(f"bad spacing '{value}'")
        elif key == "weight":
            parts.append(f"font-weight:{value}") if re.fullmatch(r"[1-9]00|bold|normal", value) else problems.append(f"bad weight '{value}'")
        elif key == "line":
            parts.append(f"line-height:{value}") if re.fullmatch(r"\d+(?:\.\d+)?", value) else problems.append(f"bad line height '{value}'")
        elif key == "align":
            parts.append(f"text-align:{value}") if value in {"left", "center", "right", "justify"} else problems.append(f"bad align '{value}'")
        elif key == "indent":
            css = length(value)
            parts.append(f"text-indent:{css}") if css else problems.append(f"bad indent '{value}'")
        else:
            problems.append(f"unknown style '{key}'")
    if doc is not None and where:
        for message in problems:
            doc.report.warn(where, message)
    return ";".join(parts)
