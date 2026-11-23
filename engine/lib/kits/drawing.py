import html
import math
import re

from ..util import Options, suggest
from . import FIGURE_KEYS

INK = "#141414"
GREY = "#6b6b6b"
RULE = "#c8c8c8"
WIDTH = 520
PALETTE = ["#1f4e79", "#2e7d6b", "#b7791f", "#a23b3b", "#6a4c93", "#3f7ca8"]
COMMENT = re.compile(r"^\s*(%%|//(\s|$))")
BULLET = re.compile(r"^\s*[-*•]\s+")
HEADING = re.compile(r"^([^:;]+?)\s*:\s*(.*)$")
MINUS = "-−–"
NUMBER = re.compile(
    rf"^\(?\s*([{MINUS}+]?)\s*[$€£¥]?\s*([{MINUS}+]?)\s*"
    r"([\d,]*\.?\d+)\s*([kKmM%]?)\s*\)?$"
)


def parse_number(text):
    text = str(text).strip()
    match = NUMBER.match(text)
    if not match:
        return None
    first, second, digits, suffix = match.groups()
    value = float(digits.replace(",", ""))
    value *= {"k": 1e3, "m": 1e6}.get(suffix.lower(), 1)
    if text.startswith("(") or any(sign in MINUS for sign in first + second):
        value = -value
    return value


def n(value):
    return f"{value:.2f}".rstrip("0").rstrip(".") if value % 1 else str(int(value))


def fmt(value, symbol="", brackets=False, decimals=None):
    if decimals is None:
        decimals = 0 if abs(value - round(value)) < 0.005 else 2
    body = f"{abs(value):,.{decimals}f}"
    if value < -0.0000001 and round(abs(value), decimals) != 0:
        return f"({symbol}{body})" if brackets else f"-{symbol}{body}"
    return f"{symbol}{body}"


def rgb(color):
    color = color.strip().lstrip("#")
    if len(color) == 3:
        color = "".join(ch * 2 for ch in color)
    try:
        return tuple(int(color[i : i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return (31, 78, 121)


def mix(color, other, amount):
    a, b = rgb(color), rgb(other)
    return "#" + "".join(f"{round(x + (y - x) * amount):02x}" for x, y in zip(a, b))


def tint(color, amount):
    return mix(color, "#ffffff", amount)


def shade(color, amount):
    return mix(color, "#000000", amount)


def el(name, content="", **values):
    parts = []
    for key, value in values.items():
        if value is None:
            continue
        value = n(value) if isinstance(value, float) else value
        parts.append(f'{key.rstrip("_").replace("_", "-")}="{value}"')
    head = f"<{name} {' '.join(parts)}"
    return f"{head}>{content}</{name}>" if content else f"{head}/>"


def box(x, y, w, h, fill="none", stroke="none", sw=1.0, r=0.0, **extra):
    return el(
        "rect",
        x=x,
        y=y,
        width=w,
        height=h,
        fill=fill,
        stroke=stroke,
        stroke_width=sw,
        rx=r or None,
        **extra,
    )


def line(x1, y1, x2, y2, stroke=INK, sw=1.0, dash=None, **extra):
    return el(
        "line",
        x1=x1,
        y1=y1,
        x2=x2,
        y2=y2,
        stroke=stroke,
        stroke_width=sw,
        stroke_dasharray=dash,
        **extra,
    )


def path(commands, fill="none", stroke=INK, sw=1.0, dash=None, **extra):
    return el(
        "path",
        d=commands,
        fill=fill,
        stroke=stroke,
        stroke_width=sw,
        stroke_dasharray=dash,
        stroke_linejoin="round",
        **extra,
    )


def polygon(points, fill=INK, stroke="none", sw=1.0, **extra):
    shown = " ".join(f"{n(x)},{n(y)}" for x, y in points)
    return el(
        "polygon", points=shown, fill=fill, stroke=stroke, stroke_width=sw, **extra
    )


def circle(x, y, r, fill=INK, stroke="none", sw=1.0, **extra):
    return el(
        "circle", cx=x, cy=y, r=r, fill=fill, stroke=stroke, stroke_width=sw, **extra
    )


def text(
    x, y, content, size=11.0, anchor="start", weight=None, fill=INK, raw=False, **extra
):
    body = content if raw else html.escape(str(content), quote=False)
    return el(
        "text",
        body,
        x=x,
        y=y,
        font_size=size,
        text_anchor=anchor if anchor != "start" else None,
        font_weight=weight,
        fill=fill,
        **extra,
    )


def lines_of_text(x, y, lines, size=11.0, step=None, **extra):
    step = step or size * 1.3
    return "".join(
        text(x, y + i * step, ln, size, **extra) for i, ln in enumerate(lines)
    )


def width_of(content, size, bold=False):
    return len(content) * size * (0.56 if bold else 0.5)


def wrap(content, limit, size, bold=False):
    lines, current = [], ""
    for word in content.split():
        trial = f"{current} {word}".strip()
        if current and width_of(trial, size, bold) > limit:
            lines.append(current)
            current = word
        else:
            current = trial
    return lines + [current] if current else lines or [""]


def arrow(x1, y1, x2, y2, color=INK, sw=1.2, size=6.0):
    angle = math.atan2(y2 - y1, x2 - x1)
    bx, by = x2 - size * math.cos(angle), y2 - size * math.sin(angle)
    wing = size * 0.45
    left = (bx + wing * math.sin(angle), by - wing * math.cos(angle))
    right = (bx - wing * math.sin(angle), by + wing * math.cos(angle))
    return line(x1, y1, bx, by, color, sw) + polygon([(x2, y2), left, right], color)


def canvas(height, parts, width=WIDTH):
    style = "width:100%;height:auto;display:block;font-family:inherit"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {n(width)} '
        f'{n(height)}" style="{style}">{"".join(parts)}</svg>'
    )


def nice_step(span, count=5):
    raw = span / count if span > 0 else 1
    magnitude = 10 ** math.floor(math.log10(raw))
    for factor in (1, 2, 2.5, 5, 10):
        if raw <= factor * magnitude * 1.0001:
            return factor * magnitude
    return 10 * magnitude


def ticks(low, high, count=5):
    step = nice_step(high - low, count)
    first = math.ceil(low / step - 1e-9)
    values = []
    while first * step <= high + 1e-9:
        values.append(first * step)
        first += 1
    return values


def keep_apart(items, gap, low, high):
    order = sorted(range(len(items)), key=lambda i: items[i])
    placed = list(items)
    previous = None
    for index in order:
        value = max(low, placed[index])
        if previous is not None and value < previous + gap:
            value = previous + gap
        placed[index] = min(value, high)
        previous = placed[index]
    return placed


class Placer:
    def __init__(self, left, top, right, bottom):
        self.limits = (left, top, right, bottom)
        self.rects = []

    def block(self, x0, y0, x1, y1):
        self.rects.append((x0, y0, x1, y1))

    def free(self, rect):
        x0, y0, x1, y1 = rect
        left, top, right, bottom = self.limits
        if x0 < left or x1 > right or y0 < top or y1 > bottom:
            return False
        return all(
            x1 <= a or x0 >= c or y1 <= b or y0 >= d for a, b, c, d in self.rects
        )

    def spots(self, x, y, radius, w, h, size):
        for factor in (1.0, 1.8, 2.8):
            gap = radius * factor + 3 * factor
            yield (
                x + gap,
                y - h / 2,
                x + gap + w,
                y + h / 2,
            ), x + gap, "start", y + size * 0.35
            yield (
                x - gap - w,
                y - h / 2,
                x - gap,
                y + h / 2,
            ), x - gap, "end", y + size * 0.35
            yield (x - w / 2, y - gap - h, x + w / 2, y - gap), x, "middle", y - gap - 3
            yield (
                x - w / 2,
                y + gap,
                x + w / 2,
                y + gap + h,
            ), x, "middle", y + gap + size

    def put(self, x, y, radius, content, size=11.0, weight=None, fill=INK):
        w, h = width_of(content, size, weight == "bold") + 3, size + 3
        choice = None
        for rect, tx, anchor, ty in self.spots(x, y, radius, w, h, size):
            if choice is None:
                choice = (rect, tx, anchor, ty)
            if self.free(rect):
                choice = (rect, tx, anchor, ty)
                break
        rect, tx, anchor, ty = choice
        self.rects.append(rect)
        return text(tx, ty, content, size, anchor, weight, fill)


def aliases(table):
    found = {}
    for canon, words in table.items():
        for word in [canon, *words]:
            found[re.sub(r"[\s_]+", "-", word.lower())] = canon
    return found


def read(doc, body, line_, keys):
    doc.ensure_section(line_)
    head, rest = doc.split_options(body, known=keys)
    opts = Options.parse(head, doc.report, line_.where)
    rest = [ln for ln in rest if ln.text.strip() and not COMMENT.match(ln.text)]
    return opts, rest


def settings(opts, rest, names):
    values, others = {}, []
    for key, value in opts.pairs:
        if key in names and names[key] not in FIGURE_KEYS:
            values[names[key]] = value
    for ln in rest:
        match = HEADING.match(ln.text.strip())
        key = re.sub(r"[\s_]+", "-", match.group(1).lower()) if match else ""
        canon = names.get(key)
        if canon is None:
            others.append(ln)
        elif canon in FIGURE_KEYS:
            opts.pairs.append([canon, match.group(2).strip()])
        else:
            values[canon] = match.group(2).strip()
    return values, others


def reject(others, names, report):
    for ln in others:
        stripped = ln.text.strip()
        key = re.sub(r"[\s_:]+", "-", stripped.split(":")[0].lower())
        report.error(
            ln.where,
            f"cannot read this line: '{stripped[:50]}'{suggest(key, names)} "
            "(write 'name: value')",
        )


def number_of(values, name, report, where, default=None):
    if name not in values:
        return default
    value = parse_number(values[name])
    if value is None:
        report.error(where, f"'{name}' must be a number, not '{values[name]}'")
        return default
    return value


def groups(rest, report):
    found = []
    for ln in rest:
        raw = ln.text.rstrip()
        stripped = raw.strip()
        continued = BULLET.match(raw) or raw[:1] in (" ", "\t")
        if continued and found:
            found[-1]["items"].extend(split_items(BULLET.sub("", raw).strip()))
            continue
        match = HEADING.match(stripped)
        if not match:
            report.error(
                ln.where,
                f"cannot read this line: '{stripped[:50]}' (write 'Name: item; item')",
            )
            continue
        found.append(
            {
                "name": match.group(1).strip(),
                "items": split_items(match.group(2)),
                "ln": ln,
            }
        )
    return found


def split_items(content):
    return [part.strip() for part in re.split(r"\s*;\s*", content) if part.strip()]


def pick(name, table, report, where):
    key = re.sub(r"[^a-z]+", " ", name.lower()).strip()
    for canon, words in table.items():
        if key == canon or key in words:
            return canon
    known = [canon for canon in table] + [
        word for words in table.values() for word in words
    ]
    report.error(where, f"unknown name '{name}'{suggest(key, known)}")
    return None


def show(doc, opts, line_, markup, keys):
    opts.finish(keys)
    doc.emit_figure(opts, line_, markup, "kit drawing")


def accent_of(doc):
    return doc.cfg.get("accent") or "#1f4e79"
