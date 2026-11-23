import html
import math
import re

INK = "#141414"
MUTE = "#5d5d58"
LINE = "#8c8c86"
SOFT = "#f4f4f0"
PAPER = "#ffffff"
BASE_ACCENT = "#1f4e79"
WIDTH = 640


class Bad(Exception):
    def __init__(self, message, where=None):
        super().__init__(message)
        self.message, self.where = message, where


def num(value):
    return (
        f"{value:.1f}".rstrip("0").rstrip(".")
        if isinstance(value, float)
        else str(value)
    )


def esc(value):
    return html.escape(str(value), quote=True)


def tag(name, content="", **attrs):
    body = "".join(
        f' {key.replace("_", "-")}="{num(value)}"'
        for key, value in attrs.items()
        if value is not None
    )
    return f"<{name}{body}>{content}</{name}>" if content else f"<{name}{body}/>"


def rgb(color):
    digits = str(color).strip().lstrip("#")
    if len(digits) == 3:
        digits = "".join(char * 2 for char in digits)
    try:
        return [int(digits[i : i + 2], 16) for i in (0, 2, 4)]
    except ValueError:
        return rgb(BASE_ACCENT)


def tint(color, amount):
    return "#" + "".join(f"{round(255 - (255 - c) * amount):02x}" for c in rgb(color))


def text(
    x,
    y,
    content,
    size=14,
    anchor="middle",
    fill=INK,
    weight=None,
    italic=False,
    halo=False,
):
    return tag(
        "text",
        esc(content),
        x=x,
        y=y,
        font_size=num(size),
        text_anchor=anchor,
        dominant_baseline="central",
        fill=fill,
        font_weight=weight,
        font_style="italic" if italic else None,
        stroke=PAPER if halo else None,
        stroke_width=4 if halo else None,
        stroke_linejoin="round" if halo else None,
        paint_order="stroke" if halo else None,
    )


def rect(x, y, w, h, fill=PAPER, stroke=INK, width=1.4, radius=0, dash=None):
    return tag(
        "rect",
        x=x,
        y=y,
        width=w,
        height=h,
        rx=radius or None,
        fill=fill,
        stroke=stroke,
        stroke_width=width,
        stroke_dasharray=dash,
    )


def line(x1, y1, x2, y2, stroke=INK, width=1.4, dash=None, cap="butt"):
    return tag(
        "line",
        x1=x1,
        y1=y1,
        x2=x2,
        y2=y2,
        stroke=stroke,
        stroke_width=width,
        stroke_dasharray=dash,
        stroke_linecap=cap,
    )


def circle(x, y, r, fill=PAPER, stroke=INK, width=1.4):
    return tag("circle", cx=x, cy=y, r=r, fill=fill, stroke=stroke, stroke_width=width)


def path(d, fill="none", stroke=INK, width=1.4, dash=None):
    return tag(
        "path",
        d=d,
        fill=fill,
        stroke=stroke,
        stroke_width=width,
        stroke_dasharray=dash,
        stroke_linejoin="round",
        stroke_linecap="round",
    )


def polyline(points, stroke=INK, width=1.4, dash=None):
    d = "M" + " L".join(f"{num(float(x))},{num(float(y))}" for x, y in points)
    return path(d, stroke=stroke, width=width, dash=dash)


def polygon(points, fill=INK, stroke=None, width=1.4):
    shown = " ".join(f"{num(float(x))},{num(float(y))}" for x, y in points)
    return tag("polygon", points=shown, fill=fill, stroke=stroke, stroke_width=width)


def head(x, y, angle, size=9, fill=INK):
    cos, sin = math.cos(angle), math.sin(angle)
    bx, by = x - size * cos, y - size * sin
    wing = size * 0.42
    return polygon(
        [
            (x, y),
            (bx - wing * sin, by + wing * cos),
            (bx + wing * sin, by - wing * cos),
        ],
        fill=fill,
    )


def arrow(x1, y1, x2, y2, stroke=INK, width=1.4, size=9, dash=None):
    angle = math.atan2(y2 - y1, x2 - x1)
    bx, by = x2 - size * 0.8 * math.cos(angle), y2 - size * 0.8 * math.sin(angle)
    return line(x1, y1, bx, by, stroke, width, dash) + head(x2, y2, angle, size, stroke)


def group(parts, transform=None):
    return tag("g", "".join(parts), transform=transform)


def box(x, y, w, h, label, accent, on=False, size=15, fill=PAPER, radius=0, mute=False):
    face = tint(accent, 0.2) if on else fill
    edge = accent if on else INK
    parts = [rect(x, y, w, h, face, edge, 2.6 if on else 1.4, radius)]
    if label != "":
        size = fit(label, w - 8, size)
        parts.append(
            text(
                x + w / 2,
                y + h / 2,
                label,
                size,
                weight=700 if on else None,
                fill=MUTE if mute else INK,
            )
        )
    return "".join(parts)


def fit(content, width, size, floor=8.5):
    return max(floor, min(size, width / max(1, len(str(content))) / 0.6))


def span(content, size):
    return len(str(content)) * size * 0.58


def svg(width, height, parts):
    body = "".join(parts)
    if width > WIDTH:
        scale = WIDTH / width
        body = group([body], f"scale({scale:.4f})")
        width, height = WIDTH, height * scale
    return tag(
        "svg",
        body,
        viewBox=f"0 0 {num(float(width))} {num(float(height))}",
        style="width:100%;height:auto;display:block;font-family:inherit",
        role="img",
    )


def drawn(width, height, parts):
    return min(width, WIDTH), svg(width, height, parts)


def share(width):
    return f"{min(86, max(18, width / WIDTH * 86)):.0f}%"


def words(content):
    parts = content.split(",") if "," in content else content.split()
    return [part.strip() for part in parts if part.strip()]


def number_or_text(items):
    try:
        return [float(item) for item in items]
    except ValueError:
        return list(items)


def positions(spec, size, where=None, base=0):
    found = set()
    for part in re.split(r"\s*,\s*|\s+", (spec or "").strip()):
        if not part:
            continue
        match = re.fullmatch(r"(-?\d+)\s*(?:-|\.\.|to)\s*(-?\d+)", part)
        single = re.fullmatch(r"-?\d+", part)
        if match:
            low, high = int(match.group(1)), int(match.group(2))
            found.update(range(low, high + 1))
        elif single:
            found.add(int(part))
        else:
            raise Bad(
                f"cannot read the position '{part}' (use numbers like 2, 4 or 1-3)",
                where,
            )
    for index in found:
        if not base <= index < base + size:
            raise Bad(
                f"position {index} is outside the list (positions run {base} to {base + size - 1})",
                where,
            )
    return found
