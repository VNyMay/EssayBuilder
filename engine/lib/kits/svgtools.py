import html
import itertools
import math
import re

from ..util import Options

INK = "#141414"
GREY = "#8a8a8a"
PALE = "#ececec"
WHITE = "#ffffff"
IDS = itertools.count(1)
SCRIPT = re.compile(r"([_^])(\{[^}]*\}|-?\d+|[A-Za-z+-])")
SYMBOLS = [("<=", "≤"), (">=", "≥"), ("!=", "≠"), ("->", "→"), ("+-", "±")]
NUMBER = re.compile(r"[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?")
COMMENT = ("%%", "//")


def uid(prefix):
    return f"{prefix}{next(IDS)}"


def clean(text):
    return text.replace("−", "-").replace("–", "-").strip()


def fmt(value, places=2):
    text = f"{value:.{places}f}"
    if "." in text:
        text = text.rstrip("0").rstrip(".")
    return "0" if text in {"-0", ""} else text


def shown(value, places=2):
    return fmt(value, places).replace("-", "−")


def number(text):
    found = NUMBER.search(clean(text))
    return float(found.group()) if found else None


def numbers(text):
    return [float(item) for item in NUMBER.findall(clean(text))]


def split_items(text, marks=",;"):
    return [item.strip() for item in re.split(f"[{marks}]", text) if item.strip()]


def mix(color, amount):
    color = color.lstrip("#")
    if len(color) == 3:
        color = "".join(ch * 2 for ch in color)
    try:
        red, green, blue = (int(color[i : i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return "#d9d9d9"
    parts = (round(255 - (255 - part) * amount) for part in (red, green, blue))
    return "#" + "".join(f"{part:02x}" for part in parts)


def plain(text):
    text = SCRIPT.sub(lambda m: m.group(2).strip("{}"), text)
    for old, new in SYMBOLS:
        text = text.replace(old, new)
    return text


def text_width(text, size=11):
    return len(plain(text)) * size * 0.56


def rich(text, size=11):
    for old, new in SYMBOLS:
        text = text.replace(old, new)
    parts, position = [], 0
    for match in SCRIPT.finditer(text):
        parts.append((text[position : match.start()], 0))
        parts.append((match.group(2).strip("{}"), 1 if match.group(1) == "_" else -1))
        position = match.end()
    parts.append((text[position:], 0))
    out, current = [], 0.0
    for part, level in parts:
        if not part:
            continue
        target = level * size * (0.3 if level > 0 else 0.38)
        delta = target - current
        current = target
        body = html.escape(part)
        if level:
            out.append(
                f'<tspan dy="{fmt(delta)}" font-size="{fmt(size * 0.72)}">{body}</tspan>'
            )
        elif delta:
            out.append(f'<tspan dy="{fmt(delta)}">{body}</tspan>')
        else:
            out.append(body)
    return "".join(out)


def nice_ticks(low, high, target=6):
    span = high - low
    if span <= 0:
        return [low]
    raw = span / max(target, 1)
    power = 10 ** math.floor(math.log10(raw))
    step = next(
        (mult * power for mult in (1, 2, 2.5, 5, 10) if mult * power >= raw), 10 * power
    )
    first = math.ceil(low / step - 1e-9)
    last = math.floor(high / step + 1e-9)
    return [round(i * step, 10) for i in range(first, last + 1)]


def tick_step(low, high, target=6):
    ticks = nice_ticks(low, high, target)
    return ticks[1] - ticks[0] if len(ticks) > 1 else 1


class Canvas:
    def __init__(self, width, height, accent):
        self.width, self.height, self.accent = width, height, accent
        self.parts = []
        self.tint = mix(accent, 0.22)
        self.mid = mix(accent, 0.5)

    def add(self, markup):
        self.parts.append(markup)

    def text(
        self,
        x,
        y,
        content,
        size=11,
        anchor="middle",
        fill=INK,
        weight=None,
        italic=False,
        angle=0,
        halo=False,
        middle=True,
    ):
        baseline = y + size * 0.35 if middle else y
        attrs = f'x="{fmt(x)}" y="{fmt(baseline)}" font-size="{fmt(size)}"'
        attrs += f' text-anchor="{anchor}" fill="{fill}"'
        if weight:
            attrs += f' font-weight="{weight}"'
        if italic:
            attrs += ' font-style="italic"'
        if angle:
            attrs += f' transform="rotate({fmt(angle)} {fmt(x)} {fmt(y)})"'
        if halo:
            attrs += ' stroke="#fff" stroke-width="3.2" paint-order="stroke"'
            attrs += ' stroke-linejoin="round"'
        self.add(f"<text {attrs}>{rich(content, size)}</text>")

    def lines(self, x, y, rows, size=11, gap=1.25, **style):
        top = y - (len(rows) - 1) * size * gap / 2
        for index, row in enumerate(rows):
            self.text(x, top + index * size * gap, row, size, **style)

    def line(self, x1, y1, x2, y2, color=INK, width=1.2, dash=None, cap="butt"):
        attrs = f'x1="{fmt(x1)}" y1="{fmt(y1)}" x2="{fmt(x2)}" y2="{fmt(y2)}"'
        attrs += f' stroke="{color}" stroke-width="{fmt(width)}"'
        attrs += f' stroke-linecap="{cap}"'
        if dash:
            attrs += f' stroke-dasharray="{dash}"'
        self.add(f"<line {attrs}/>")

    def rect(
        self,
        x,
        y,
        width,
        height,
        fill="none",
        stroke=INK,
        stroke_width=1.2,
        radius=0,
        opacity=None,
        extra="",
    ):
        attrs = f'x="{fmt(x)}" y="{fmt(y)}" width="{fmt(width)}" height="{fmt(height)}"'
        attrs += f' fill="{fill}" stroke="{stroke}" stroke-width="{fmt(stroke_width)}"'
        if radius:
            attrs += f' rx="{fmt(radius)}"'
        if opacity is not None:
            attrs += f' fill-opacity="{opacity}"'
        self.add(f"<rect {attrs} {extra}/>")

    def circle(
        self,
        x,
        y,
        radius,
        fill="none",
        stroke=INK,
        stroke_width=1.2,
        opacity=None,
        extra="",
    ):
        attrs = f'cx="{fmt(x)}" cy="{fmt(y)}" r="{fmt(radius)}" fill="{fill}"'
        attrs += f' stroke="{stroke}" stroke-width="{fmt(stroke_width)}"'
        if opacity is not None:
            attrs += f' fill-opacity="{opacity}"'
        self.add(f"<circle {attrs} {extra}/>")

    def path(
        self,
        data,
        fill="none",
        stroke=INK,
        width=1.2,
        dash=None,
        opacity=None,
        extra="",
    ):
        attrs = (
            f'd="{data}" fill="{fill}" stroke="{stroke}" stroke-width="{fmt(width)}"'
        )
        attrs += ' stroke-linejoin="round" stroke-linecap="round"'
        if dash:
            attrs += f' stroke-dasharray="{dash}"'
        if opacity is not None:
            attrs += f' fill-opacity="{opacity}"'
        self.add(f"<path {attrs} {extra}/>")

    def polygon(self, points, fill="none", stroke=INK, width=1.2, opacity=None):
        data = " ".join(f"{fmt(px)},{fmt(py)}" for px, py in points)
        attrs = f'points="{data}" fill="{fill}" stroke="{stroke}"'
        attrs += f' stroke-width="{fmt(width)}" stroke-linejoin="round"'
        if opacity is not None:
            attrs += f' fill-opacity="{opacity}"'
        self.add(f"<polygon {attrs}/>")

    def arrow(
        self,
        x1,
        y1,
        x2,
        y2,
        color=INK,
        width=1.4,
        head=7,
        dash=None,
        both=False,
    ):
        length = math.hypot(x2 - x1, y2 - y1)
        if length < 1e-6:
            return
        ux, uy = (x2 - x1) / length, (y2 - y1) / length
        head = min(head, length * (0.45 if both else 0.7))
        sx, sy = (x1 + ux * head * 0.8, y1 + uy * head * 0.8) if both else (x1, y1)
        ex, ey = x2 - ux * head * 0.8, y2 - uy * head * 0.8
        self.line(sx, sy, ex, ey, color, width, dash)
        self.head(x2, y2, ux, uy, head, color)
        if both:
            self.head(x1, y1, -ux, -uy, head, color)

    def head(self, x, y, ux, uy, size, color):
        bx, by = x - ux * size, y - uy * size
        wing = size * 0.36
        points = [
            (x, y),
            (bx - uy * wing, by + ux * wing),
            (bx + uy * wing, by - ux * wing),
        ]
        self.polygon(points, color, color, 0.6)

    def dot(self, x, y, radius=3, fill=INK, stroke=INK, width=1.3):
        self.circle(x, y, radius, fill, stroke, width)

    def arc(self, x, y, radius, start, end, color=INK, width=1.1):
        x1, y1 = x + radius * math.cos(start), y - radius * math.sin(start)
        x2, y2 = x + radius * math.cos(end), y - radius * math.sin(end)
        sweep = 0 if end > start else 1
        large = 1 if abs(end - start) > math.pi else 0
        data = f"M{fmt(x1)},{fmt(y1)} A{fmt(radius)},{fmt(radius)} 0 {large} {sweep} "
        self.path(data + f"{fmt(x2)},{fmt(y2)}", stroke=color, width=width)

    def svg(self):
        style = "width:100%;height:auto;display:block;font-family:inherit"
        head = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {fmt(self.width)} '
        )
        head += f'{fmt(self.height)}" style="{style}" role="img">'
        return head + "".join(self.parts) + "</svg>"


class Plane:
    def __init__(self, canvas, box, xrange, yrange):
        self.canvas, self.box = canvas, box
        self.x0, self.x1 = xrange
        self.y0, self.y1 = yrange

    def px(self, x):
        left, _, right, _ = self.box
        return left + (x - self.x0) / (self.x1 - self.x0) * (right - left)

    def py(self, y):
        _, top, _, bottom = self.box
        return bottom - (y - self.y0) / (self.y1 - self.y0) * (bottom - top)

    def inside(self, x, y, margin=0.0):
        return (
            self.x0 - margin <= x <= self.x1 + margin
            and self.y0 - margin <= y <= self.y1 + margin
        )

    def clip(self):
        left, top, right, bottom = self.box
        name = uid("clip")
        rect = f'<rect x="{fmt(left)}" y="{fmt(top)}" '
        rect += f'width="{fmt(right - left)}" height="{fmt(bottom - top)}"/>'
        self.canvas.add(f'<clipPath id="{name}">{rect}</clipPath>')
        return f'clip-path="url(#{name})"'

    def axes(
        self,
        xlabel="x",
        ylabel="y",
        grid=False,
        cross=True,
        xticks=None,
        yticks=None,
        xlabels=None,
        ylabels=True,
        size=10,
    ):
        canvas = self.canvas
        left, top, right, bottom = self.box
        xticks = nice_ticks(self.x0, self.x1) if xticks is None else xticks
        yticks = nice_ticks(self.y0, self.y1) if yticks is None else yticks
        ax = self.px(0) if cross and self.x0 <= 0 <= self.x1 else left
        ay = self.py(0) if cross and self.y0 <= 0 <= self.y1 else bottom
        if grid:
            for value in xticks:
                canvas.line(self.px(value), top, self.px(value), bottom, "#dcdcdc", 0.6)
            for value in yticks:
                canvas.line(left, self.py(value), right, self.py(value), "#dcdcdc", 0.6)
        canvas.arrow(left - 6, ay, right + 8, ay, INK, 1.2, 6)
        canvas.arrow(ax, bottom + 6, ax, top - 8, INK, 1.2, 6)
        for value in xticks:
            x = self.px(value)
            canvas.line(x, ay - 2.5, x, ay + 2.5, INK, 1)
            near = abs(x - ax) < 4
            if xlabels is None and not near:
                canvas.text(x, ay + 11, shown(value), size, halo=True)
            elif near and cross and ylabels and abs(ay - self.py(0)) < 1:
                canvas.text(ax - 6, ay + 10, "0", size, "end", halo=True)
        for value in yticks:
            y = self.py(value)
            canvas.line(ax - 2.5, y, ax + 2.5, y, INK, 1)
            if ylabels and abs(y - ay) > 4:
                canvas.text(ax - 6, y, shown(value), size, "end", halo=True)
        if xlabel:
            canvas.text(right + 12, ay - 10, xlabel, size + 1, "end", italic=True)
        if ylabel:
            canvas.text(ax + 8, top - 10, ylabel, size + 1, "start", italic=True)


def begin(compiler, body, line, keys):
    compiler.ensure_section(line)
    head, rest = compiler.split_options(body, known=keys)
    opts = Options.parse(head, compiler.report, line.where)
    rows = [
        ln for ln in rest if ln.text.strip() and not ln.text.strip().startswith(COMMENT)
    ]
    return opts, rows


def end(compiler, opts, line, canvas, keys):
    width = f"{min(86.0, 86.0 * canvas.width / 480):.1f}%"
    compiler.emit_figure(opts, line, canvas.svg(), "draw", width)
    opts.finish(keys)


def pick(opts, *names, default=None):
    found = default
    for name in reversed(names):
        value = opts.get(name)
        if value is not None:
            found = value
    return found


def accent_of(compiler):
    return compiler.cfg.get("accent", "#1f4e79")
