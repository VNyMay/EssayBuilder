import math
import re
from functools import reduce

from . import FIGURE_KEYS
from .svgtools import (
    GREY,
    INK,
    WHITE,
    Canvas,
    Plane,
    accent_of,
    begin,
    clean,
    end,
    fmt,
    mix,
    nice_ticks,
    number,
    numbers,
    pick,
    shown,
    split_items,
    text_width,
)

KINDS = {
    "variable resistor": "variable",
    "rheostat": "variable",
    "resistor": "resistor",
    "light bulb": "bulb",
    "bulb": "bulb",
    "lamp": "bulb",
    "switch": "switch",
    "ammeter": "ammeter",
    "voltmeter": "voltmeter",
    "capacitor": "capacitor",
    "cell": "cell",
    "battery": "battery",
    "diode": "diode",
    "motor": "motor",
}
KIND_WORDS = "|".join(sorted((re.escape(k) for k in KINDS), key=len, reverse=True))
ITEM = re.compile(rf"^({KIND_WORDS})s?\b\s*(.*)$", re.I)
CIRCUIT_KEYS = FIGURE_KEYS | {"battery", "cell", "series", "parallel", "voltmeter"}
STATEMENT = re.compile(
    r"^(battery|cell|series|parallel|voltmeter)\b\s*[:=]?\s*(.*)$", re.I
)


def circuit_item(text, report, where):
    match = ITEM.match(text.strip())
    if not match:
        report.error(
            where,
            f"cannot read '{text.strip()[:40]}' (use resistor, bulb, switch, ammeter, "
            "voltmeter, capacitor, cell, diode, motor)",
        )
        return None
    kind, rest = KINDS[match.group(1).lower()], match.group(2).strip()
    state = ""
    word = re.search(r"\b(open|closed)\b", rest, re.I)
    if word:
        state = word.group(1).lower()
        rest = (rest[: word.start()] + rest[word.end() :]).strip()
    name = ""
    named = re.match(r"^([A-Za-z]\w{0,2})\b(?!\s*(?:ohms?|volts?)\b)\s*(.*)$", rest)
    if named and not re.match(r"^(ohms?|volts?|v|ω)$", named.group(1), re.I):
        name, rest = named.group(1), named.group(2)
    value = re.sub(r"\bk?\s*ohms?\b", "Ω", rest, flags=re.I)
    value = re.sub(r"\bvolts?\b", "V", value, flags=re.I).strip()
    if name:
        name = re.sub(r"^([A-Za-z]+)(\d+)$", r"\1_\2", name)
    return {"kind": kind, "name": name, "value": value, "state": state, "text": text}


def circuit_statements(opts, rows):
    out = []
    for key, value in opts.pairs:
        if key in {"battery", "cell", "series", "parallel", "voltmeter"}:
            out.append((key, value, None))
    for ln in rows:
        match = STATEMENT.match(ln.text.strip())
        if match:
            out.append((match.group(1).lower(), match.group(2), ln))
        else:
            out.append(("series", ln.text.strip(), ln))
    return out


def build_circuit(opts, rows, report, line):
    source, chain, meter = {"label": "", "kind": "battery"}, [], None
    for kind, value, ln in circuit_statements(opts, rows):
        where = ln.where if ln else line.where
        if kind in {"battery", "cell"}:
            source = {
                "label": re.sub(r"\bvolts?\b", "V", value, flags=re.I).strip(),
                "kind": kind,
            }
        elif kind == "voltmeter":
            meter = re.sub(
                r"^(?:across|over|parallel to|in parallel with)\s+",
                "",
                value.strip(),
                flags=re.I,
            )
        elif kind == "series":
            for piece in split_items(value, ","):
                item = circuit_item(piece, report, where)
                if item:
                    chain.append(("item", item))
        else:
            branches = []
            for branch in re.split(r"\s*\|\s*|\s*,\s*", value):
                parts = [
                    circuit_item(p, report, where)
                    for p in re.split(r"\s*\+\s*|\s+then\s+", branch)
                    if p.strip()
                ]
                if parts and None not in parts:
                    branches.append(parts)
            if len(branches) < 2:
                report.error(
                    where,
                    "parallel needs two or more branches (parallel: resistor 10 ohm, resistor 20 ohm)",
                )
            else:
                chain.append(("par", branches))
    return source, chain, meter


SLOT = 76
ROW = 62


def wire(canvas, x1, y1, x2, y2):
    canvas.line(x1, y1, x2, y2, INK, 1.6, cap="round")


def draw_symbol(canvas, kind, cx, y, state="", letter=""):
    half = 18
    if kind == "resistor":
        canvas.rect(cx - half, y - 6.5, 2 * half, 13, WHITE, INK, 1.6)
    elif kind == "variable":
        canvas.rect(cx - half, y - 6.5, 2 * half, 13, WHITE, INK, 1.6)
        canvas.arrow(cx - 12, y + 13, cx + 12, y - 13, INK, 1.4, 6)
    elif kind in {"bulb", "ammeter", "voltmeter", "motor"}:
        canvas.circle(cx, y, 12.5, WHITE, INK, 1.6)
        if kind == "bulb":
            offset = 12.5 * math.cos(math.pi / 4)
            canvas.line(cx - offset, y - offset, cx + offset, y + offset, INK, 1.4)
            canvas.line(cx - offset, y + offset, cx + offset, y - offset, INK, 1.4)
        else:
            canvas.text(
                cx,
                y,
                {"ammeter": "A", "voltmeter": "V", "motor": "M"}[kind],
                13,
                weight="bold",
            )
    elif kind == "switch":
        canvas.dot(cx - 15, y, 2.4)
        canvas.dot(cx + 15, y, 2.4)
        if state == "closed":
            canvas.line(cx - 15, y, cx + 15, y, INK, 1.6)
        else:
            canvas.line(cx - 15, y, cx + 12, y - 15, INK, 1.6, cap="round")
    elif kind == "capacitor":
        canvas.line(cx - 4, y - 13, cx - 4, y + 13, INK, 2)
        canvas.line(cx + 4, y - 13, cx + 4, y + 13, INK, 2)
    elif kind == "cell":
        canvas.line(cx - 4, y - 13, cx - 4, y + 13, INK, 2)
        canvas.line(cx + 4, y - 7, cx + 4, y + 7, INK, 3.4)
    elif kind == "diode":
        canvas.polygon(
            [(cx - 8, y - 10), (cx - 8, y + 10), (cx + 8, y)], WHITE, INK, 1.6
        )
        canvas.line(cx + 8, y - 10, cx + 8, y + 10, INK, 1.8)


def symbol_span(kind):
    return {"capacitor": 4, "cell": 4}.get(kind, 18)


def item_label(canvas, item, cx, y):
    parts = [p for p in (item["name"], item["value"]) if p]
    if item["kind"] in {"ammeter", "voltmeter"} and not item["name"]:
        parts = [item["value"]] if item["value"] else []
    if parts:
        canvas.text(cx, y + 25, " ".join(parts), 11, halo=True)


def draw_item(canvas, item, x1, x2, y):
    cx = (x1 + x2) / 2
    span = symbol_span(item["kind"])
    wire(canvas, x1, y, cx - span, y)
    wire(canvas, cx + span, y, x2, y)
    draw_symbol(canvas, item["kind"], cx, y, item["state"])
    item_label(canvas, item, cx, y)
    return cx, span


def draw_battery(canvas, x, top, bottom, source):
    mid = (top + bottom) / 2
    pairs = 1 if source["kind"] == "cell" else 2
    ys = [mid - 8 * pairs + 7 + 16 * i for i in range(pairs)]
    start = ys[0] - 8
    finish = ys[-1] + 10
    wire(canvas, x, top, x, start)
    wire(canvas, x, finish, x, bottom)
    for y in ys:
        canvas.line(x - 13, y, x + 13, y, INK, 2)
        canvas.line(x - 7, y + 8, x + 7, y + 8, INK, 3.6)
    canvas.text(x + 16, ys[0] - 5, "+", 11, "start")
    if source["label"]:
        canvas.text(x - 22, mid, source["label"], 12, "end", weight="bold")


def find_target(chain, meter):
    key = meter.lower().strip()
    for number_, (kind, data) in enumerate(chain):
        if kind == "par" and re.match(r"^(parallel|the parallel|branches)", key):
            return number_, None
        items = [data] if kind == "item" else [i for b in data for i in b]
        for item in items:
            names = {
                item["name"].lower().replace("_", ""),
                item["kind"],
                item["text"].lower().strip(),
            }
            if key.replace(" ", "") in {n.replace(" ", "") for n in names}:
                return number_, item
    return None, None


def draw_circuit(self, body, line):
    opts, rows = begin(self, body, line, CIRCUIT_KEYS)
    report = self.report
    source, chain, meter = build_circuit(opts, rows, report, line)
    if not chain:
        report.error(line.where, "circuit needs components (series: switch, bulb)")
        return
    target = None
    if meter:
        target = find_target(chain, meter)
        if target[0] is None:
            report.error(
                line.where, f"voltmeter across '{meter}' matches nothing in the circuit"
            )
            meter = None
    widths = []
    for kind, data in chain:
        if kind == "item":
            widths.append(SLOT)
        else:
            widths.append(34 + max(len(branch) for branch in data) * SLOT)
    rows_needed = max([len(d) for k, d in chain if k == "par"] + [1])
    top = 82 if meter else 46
    drop = max(92, (rows_needed - 1) * ROW + 62)
    bottom = top + drop
    left = 70
    total = sum(widths)
    right = left + total + 26
    canvas = Canvas(max(right + 46, 300), bottom + 28, accent_of(self))
    draw_battery(canvas, left, top, bottom, source)
    wire(canvas, left, bottom, right, bottom)
    wire(canvas, right, top, right, bottom)
    x = left
    spans = []
    for (kind, data), width in zip(chain, widths):
        if kind == "item":
            cx, span = draw_item(canvas, data, x, x + width, top)
            spans.append((cx - span, cx + span))
        else:
            j1, j2 = x + 14, x + width - 14
            wire(canvas, x, top, j1, top)
            wire(canvas, j2, top, x + width, top)
            last = top + (len(data) - 1) * ROW
            wire(canvas, j1, top, j1, last)
            wire(canvas, j2, top, j2, last)
            for number_, branch in enumerate(data):
                y = top + number_ * ROW
                slot = (j2 - j1) / len(branch)
                for index, item in enumerate(branch):
                    draw_item(
                        canvas, item, j1 + index * slot, j1 + (index + 1) * slot, y
                    )
            canvas.dot(j1, top, 2.6)
            canvas.dot(j2, top, 2.6)
            spans.append((j1, j2))
        x += width
    wire(canvas, x, top, right, top)
    if meter:
        index, item = target
        a, b = spans[index]
        cx, y = (a + b) / 2, top - 46
        wire(canvas, a, top, a, y)
        wire(canvas, b, top, b, y)
        wire(canvas, a, y, cx - 12.5, y)
        wire(canvas, cx + 12.5, y, b, y)
        draw_symbol(canvas, "voltmeter", cx, y)
        canvas.dot(a, top, 2.6)
        canvas.dot(b, top, 2.6)
    end(self, opts, line, canvas, CIRCUIT_KEYS)


FBD_KEYS = FIGURE_KEYS | {"object", "resultant", "scale", "unit"}
DIRECTIONS = {
    "up": 90,
    "upward": 90,
    "upwards": 90,
    "north": 90,
    "down": 270,
    "downward": 270,
    "downwards": 270,
    "south": 270,
    "left": 180,
    "west": 180,
    "backward": 180,
    "right": 0,
    "east": 0,
    "forward": 0,
}
FORCE_ROW = re.compile(r"^(?P<name>[^:=]+?)\s*[:=]\s*(?P<rest>.+)$")


def parse_force(ln, report):
    match = FORCE_ROW.match(ln.text.strip())
    if not match:
        report.error(
            ln.where,
            f"cannot read '{ln.text.strip()[:40]}' (write 'Weight: 49 N down')",
        )
        return None
    name, rest = match.group("name").strip(), clean(match.group("rest"))
    angle = None
    found = re.search(r"(?:at|angle|@)\s*(-?\d+(?:\.\d+)?)\s*(?:°|deg\w*)?", rest, re.I)
    if found:
        angle = float(found.group(1))
        rest = rest[: found.start()] + rest[found.end() :]
    else:
        found = re.search(r"(-?\d+(?:\.\d+)?)\s*(?:°|degrees?)", rest, re.I)
        if found:
            angle = float(found.group(1))
            rest = rest[: found.start()] + rest[found.end() :]
    for word in re.findall(r"[a-z]+", rest.lower()):
        if word in DIRECTIONS and angle is None:
            angle = DIRECTIONS[word]
    if angle is None:
        report.error(
            ln.where, f"'{name}' needs a direction (up, down, left, right or 'at 60°')"
        )
        return None
    rest = re.sub(
        r"\b(up|down|left|right|north|south|east|west)\w*\b", "", rest, flags=re.I
    )
    size = re.search(r"(\d+(?:\.\d+)?)\s*([A-Za-zμ]*)", rest)
    magnitude = float(size.group(1)) if size else None
    unit = size.group(2) if size and size.group(2) else ("N" if size else "")
    return {"name": name, "angle": angle, "magnitude": magnitude, "unit": unit}


def edge_distance(shape, angle):
    dx, dy = math.cos(math.radians(angle)), math.sin(math.radians(angle))
    if shape == "box":
        return min(30 / abs(dx) if dx else 1e9, 20 / abs(dy) if dy else 1e9)
    return 14


def draw_fbd(self, body, line):
    opts, rows = begin(self, body, line, FBD_KEYS)
    forces = [f for f in (parse_force(ln, self.report) for ln in rows) if f]
    if not forces:
        self.report.error(line.where, "fbd needs forces such as 'Weight: 49 N down'")
        return
    shape = (
        "box"
        if (opts.get("object") or "box").lower() in {"box", "block", "square"}
        else "dot"
    )
    sized = [f["magnitude"] for f in forces if f["magnitude"]]
    top_size = max(sized) if sized else None
    proportional = opts.flag("scale", True) and top_size is not None
    show_net = opts.flag("resultant", True) and len(sized) == len(forces)
    canvas = Canvas(480 if show_net else 400, 320, accent_of(self))
    cx, cy = 190 if show_net else 200, 160
    if shape == "box":
        canvas.rect(cx - 30, cy - 20, 60, 40, canvas.tint, INK, 1.8)
    else:
        canvas.circle(cx, cy, 14, canvas.tint, INK, 1.8)
    nx = ny = 0.0
    for force in forces:
        theta = math.radians(force["angle"])
        dx, dy = math.cos(theta), -math.sin(theta)
        length = (
            28 + 80 * force["magnitude"] / top_size
            if proportional and force["magnitude"]
            else 78
        )
        start = edge_distance(shape, force["angle"])
        x1, y1 = cx + dx * start, cy + dy * start
        x2, y2 = cx + dx * (start + length), cy + dy * (start + length)
        canvas.arrow(x1, y1, x2, y2, INK, 2.2, 9)
        text = force["name"]
        if force["magnitude"]:
            text += f" {shown(force['magnitude'])} {force['unit']}".rstrip()
        anchor = "start" if dx > 0.3 else ("end" if dx < -0.3 else "middle")
        canvas.text(
            x2 + dx * 8 + (3 if dx > 0.3 else -3 if dx < -0.3 else 0),
            y2 + dy * 9,
            text,
            11.5,
            anchor,
            halo=True,
        )
        if force["magnitude"]:
            nx += force["magnitude"] * math.cos(theta)
            ny += force["magnitude"] * math.sin(theta)
    if show_net:
        x0 = 395
        canvas.line(x0 - 60, 30, x0 - 60, 290, "#bdbdbd", 1, "4 4")
        net = math.hypot(nx, ny)
        canvas.text(x0, 36, "Resultant", 11.5, weight="bold")
        unit = forces[0]["unit"] or "N"
        if net < 1e-6 * max(sized):
            canvas.text(
                x0,
                160,
                f"Net force = 0 {unit}",
                11.5,
                fill=canvas.accent,
                weight="bold",
            )
        else:
            angle = math.degrees(math.atan2(ny, nx)) % 360
            length = 28 + 80 * net / top_size if proportional else 78
            dx, dy = nx / net, -ny / net
            canvas.arrow(
                x0 - dx * length / 2,
                160 - dy * length / 2,
                x0 + dx * length / 2,
                160 + dy * length / 2,
                canvas.accent,
                3,
                10,
            )
            canvas.lines(
                x0,
                160 + 66,
                [f"{shown(net, 3)} {unit}", f"at {shown(angle, 1)}°"],
                11.5,
                fill=canvas.accent,
                weight="bold",
            )
    end(self, opts, line, canvas, FBD_KEYS)


WAVE_KEYS = FIGURE_KEYS | {
    "wavelength",
    "amplitude",
    "period",
    "kind",
    "graph",
    "type",
    "cycles",
}


def unit_of(text):
    found = re.search(r"\d\s*([A-Za-zμ°/]+)\s*$", text or "")
    return found.group(1) if found else ""


def with_value(symbol, name, value):
    return f"{name} {symbol} = {value.strip()}" if value else f"{name} {symbol}"


def draw_wave(self, body, line):
    opts, _ = begin(self, body, line, WAVE_KEYS)
    wavelength, amplitude, period = (
        opts.get(k) for k in ("wavelength", "amplitude", "period")
    )
    kind = (pick(opts, "kind", "graph", "type", default="") or "").lower()
    timed = kind.startswith("time") or (not kind and period and not wavelength)
    cycles = opts.number("cycles", 2.0)
    canvas = Canvas(480, 230, accent_of(self))
    plane = Plane(canvas, (50, 30, 450, 200), (0, cycles + 0.5), (-1.45, 1.45))
    base = plane.py(0)
    canvas.arrow(plane.px(0), plane.py(-1.4), plane.px(0), plane.py(1.45), INK, 1.4, 7)
    canvas.arrow(plane.px(0) - 4, base, plane.px(cycles + 0.5), base, INK, 1.4, 7)
    xs = [i * cycles / 240 for i in range(241)]
    data = "M" + " L".join(
        f"{fmt(plane.px(x))},{fmt(plane.py(math.sin(2 * math.pi * x)))}" for x in xs
    )
    canvas.path(data, "none", canvas.accent, 2.6)
    axis = "Time" if timed else "Distance"
    xunit = unit_of(period if timed else wavelength)
    yunit = unit_of(amplitude)
    canvas.text(
        plane.px(cycles + 0.5),
        base + 16,
        axis + (f" / {xunit}" if xunit else ""),
        11,
        "end",
        italic=True,
    )
    canvas.text(
        34,
        plane.py(0),
        "Displacement" + (f" / {yunit}" if yunit else ""),
        11,
        italic=True,
        angle=-90,
    )
    crest = plane.px(0.25)
    next_crest = plane.px(1.25)
    y_top = plane.py(1.3)
    canvas.line(crest, plane.py(1), crest, y_top - 3, GREY, 1, "3 3")
    canvas.line(next_crest, plane.py(1), next_crest, y_top - 3, GREY, 1, "3 3")
    canvas.arrow(crest, y_top, next_crest, y_top, INK, 1.4, 7, both=True)
    if timed:
        label = with_value("T", "period", period or "")
    else:
        label = with_value("λ", "wavelength", wavelength or "")
    canvas.text((crest + next_crest) / 2, y_top - 9, label, 11.5, weight="bold")
    edge = plane.px(cycles + 0.1)
    canvas.line(crest, plane.py(1), edge, plane.py(1), GREY, 1, "3 3")
    canvas.arrow(edge, base, edge, plane.py(1), INK, 1.4, 7, both=True)
    rows = ["amplitude", f"A = {amplitude.strip()}" if amplitude else "A"]
    canvas.lines(
        edge - 8, plane.py(0.5), rows, 11.5, anchor="end", weight="bold", halo=True
    )
    end(self, opts, line, canvas, WAVE_KEYS)


INCLINE_KEYS = FIGURE_KEYS | {
    "angle",
    "mass",
    "forces",
    "components",
    "friction",
    "object",
    "g",
    "numbers",
}
FORCE_WORDS = {
    "weight": "weight",
    "gravity": "weight",
    "normal": "normal",
    "friction": "friction",
    "push": "push",
    "applied": "push",
    "pull": "push",
    "tension": "push",
}


def draw_incline(self, body, line):
    opts, _ = begin(self, body, line, INCLINE_KEYS)
    angle = opts.number("angle", 30.0)
    if not 5 <= angle <= 75:
        self.report.error(line.where, "incline angle must be between 5 and 75 degrees")
        return
    theta = math.radians(angle)
    mass_text = (opts.get("mass") or "").strip()
    mass = number(mass_text) if mass_text else None
    gravity = opts.number("g", 9.81)
    wanted = [
        FORCE_WORDS.get(w, w)
        for w in re.findall(
            r"[a-z]+", (opts.get("forces") or "weight normal friction").lower()
        )
    ]
    unknown = [w for w in wanted if w not in set(FORCE_WORDS.values())]
    if unknown:
        self.report.error(
            line.where,
            f"unknown force '{unknown[0]}' (use weight, normal, friction, push)",
        )
        return
    canvas = Canvas(480, 300, accent_of(self))
    base = min(310.0, 170 / math.tan(theta))
    x0, y0 = 70.0, 262.0
    x1, y1 = x0 + base, y0 - base * math.tan(theta)
    canvas.polygon([(x0, y0), (x1, y0), (x1, y1)], "#efefef", INK, 1.8)
    up = (math.cos(theta), -math.sin(theta))
    out = (-math.sin(theta), -math.cos(theta))
    along = base / math.cos(theta) * 0.5
    foot = (x0 + up[0] * along, y0 + up[1] * along)
    centre = (foot[0] + out[0] * 19, foot[1] + out[1] * 19)
    shape = (opts.get("object") or "box").lower()
    if shape in {"ball", "circle"}:
        canvas.circle(centre[0], centre[1], 15, canvas.tint, INK, 1.8)
        centre = (foot[0] + out[0] * 15, foot[1] + out[1] * 15)
    else:
        canvas.rect(
            -28,
            -17,
            56,
            34,
            canvas.tint,
            INK,
            1.8,
            extra=f'transform="translate({fmt(centre[0])} {fmt(centre[1])}) rotate({fmt(-angle)})"',
        )
    numbers_on = opts.flag("numbers", mass is not None)
    weight = mass * gravity if mass is not None else None

    def tag(symbol, value):
        return (
            f"{symbol} = {shown(value, 1)} N"
            if numbers_on and value is not None
            else symbol
        )

    canvas.arc(x0, y0, 44, 0, theta, canvas.accent, 1.5)
    canvas.text(
        x0 + 62 * math.cos(theta / 2),
        y0 - 62 * math.sin(theta / 2),
        f"{shown(angle, 1)}°",
        12,
        "start",
        weight="bold",
    )
    length = 78.0
    pushes = {
        "weight": ((0, 1), tag("mg", weight)),
        "normal": (out, tag("N", weight * math.cos(theta) if weight else None)),
        "friction": (
            (
                up
                if (opts.get("friction") or "up").lower() != "down"
                else (-up[0], -up[1])
            ),
            "f",
        ),
        "push": (up, "F"),
    }
    gx, gy = centre
    for name in wanted:
        direction, label = pushes[name]
        ex, ey = gx + direction[0] * length, gy + direction[1] * length
        canvas.arrow(gx, gy, ex, ey, INK, 2.2, 9)
        anchor = (
            "start"
            if direction[0] > 0.3
            else ("end" if direction[0] < -0.3 else "middle")
        )
        canvas.text(
            ex + direction[0] * 8,
            ey + direction[1] * 10,
            label,
            12,
            anchor,
            halo=True,
            italic=True,
        )
    if opts.flag("components", False):
        parts = [
            (
                (-up[0], -up[1]),
                length * math.sin(theta),
                tag("mg sin θ", weight * math.sin(theta) if weight else None),
            ),
            (
                (-out[0], -out[1]),
                length * math.cos(theta),
                tag("mg cos θ", weight * math.cos(theta) if weight else None),
            ),
        ]
        tip = (gx, gy + length)
        for direction, size, label in parts:
            ex, ey = gx + direction[0] * size, gy + direction[1] * size
            canvas.arrow(gx, gy, ex, ey, canvas.accent, 2, 8, "5 3")
            canvas.line(ex, ey, tip[0], tip[1], GREY, 1, "3 3")
            anchor = "start" if direction[0] > 0.3 else "end"
            canvas.text(
                ex + direction[0] * 6,
                ey + direction[1] * 6 + 8,
                label,
                11,
                anchor,
                fill=canvas.accent,
                weight="bold",
                halo=True,
            )
    end(self, opts, line, canvas, INCLINE_KEYS)


PROJECTILE_KEYS = FIGURE_KEYS | {"speed", "angle", "height", "g", "show", "values"}


def dimension(canvas, x1, y1, x2, y2, text, offset, anchor="middle"):
    canvas.arrow(x1, y1, x2, y2, INK, 1.3, 6, both=True)
    canvas.text(
        (x1 + x2) / 2 + offset[0],
        (y1 + y2) / 2 + offset[1],
        text,
        11.5,
        anchor,
        weight="bold",
        halo=True,
    )


def draw_projectile(self, body, line):
    opts, _ = begin(self, body, line, PROJECTILE_KEYS)
    speed_text = (opts.get("speed") or "").strip()
    speed = number(speed_text) if speed_text else None
    angle = opts.number("angle", 45.0)
    h0 = number(opts.get("height") or "0") or 0.0
    gravity = opts.number("g", 9.81)
    if not 5 <= angle <= 85 or h0 < 0:
        self.report.error(
            line.where,
            "projectile needs an angle from 5 to 85 degrees and a height of 0 or more",
        )
        return
    shows = {
        w
        for w in re.findall(
            r"[a-z]+", (opts.get("show") or "range height components").lower()
        )
    }
    v = speed if speed else 20.0
    theta = math.radians(angle)
    vx, vy = v * math.cos(theta), v * math.sin(theta)
    flight = (vy + math.sqrt(vy * vy + 2 * gravity * h0)) / gravity
    reach = vx * flight
    peak = h0 + vy * vy / (2 * gravity)
    scale = min(330 / (reach * 1.05), 160 / max(peak, 1e-9), 60)
    canvas = Canvas(480, 270, accent_of(self))
    left, ground = 60.0, 216.0
    exact = speed is not None and opts.flag("values", True)

    def at(x, y):
        return left + x * scale, ground - y * scale

    if h0 > 0:
        canvas.rect(left - 40, ground - h0 * scale, 40, h0 * scale, "#e6e6e6", INK, 1.6)
    canvas.line(left - 40, ground, left + reach * scale + 40, ground, INK, 1.8)
    steps = [flight * i / 120 for i in range(121)]
    data = "M" + " L".join(
        "{},{}".format(*(fmt(c) for c in at(vx * t, h0 + vy * t - gravity * t * t / 2)))
        for t in steps
    )
    canvas.path(data, "none", INK, 1.6, "2 4")
    sx, sy = at(0, h0)
    canvas.dot(sx, sy, 3.6)
    canvas.dot(*at(reach, 0), 3.6)
    arrow_len = 62.0
    ex, ey = sx + arrow_len * math.cos(theta), sy - arrow_len * math.sin(theta)
    canvas.arrow(sx, sy, ex, ey, canvas.accent, 2.8, 10)
    label = f"v = {speed_text}" if exact else "u"
    canvas.text(
        ex - 6, ey - 8, label, 12, "end", fill=canvas.accent, weight="bold", halo=True
    )
    canvas.arc(sx, sy, 30, 0, theta, INK, 1.2)
    canvas.text(sx + 42, sy - 8, f"{shown(angle, 1)}°", 11, "start", halo=True)
    if "components" in shows:
        canvas.arrow(sx, sy, sx + arrow_len * math.cos(theta), sy, GREY, 1.6, 7, "4 3")
        canvas.arrow(sx, sy, sx, sy - arrow_len * math.sin(theta), GREY, 1.6, 7, "4 3")
        canvas.text(
            sx + arrow_len * math.cos(theta) / 2,
            sy + 12,
            "vx",
            11,
            fill="#555",
            italic=True,
        )
        canvas.text(
            sx - 8,
            sy - arrow_len * math.sin(theta) / 2,
            "vy",
            11,
            "end",
            fill="#555",
            italic=True,
        )
    apex = at(vx * (vy / gravity), peak)
    if "height" in shows or "maxheight" in shows:
        canvas.line(apex[0], apex[1], apex[0], ground, GREY, 1, "3 3")
        text = f"H = {shown(peak, 1)} m" if exact else "H"
        canvas.text(
            apex[0] + 6,
            (apex[1] + ground) / 2,
            text,
            11.5,
            "start",
            weight="bold",
            halo=True,
        )
    if "range" in shows:
        text = f"R = {shown(reach, 1)} m" if exact else "R"
        dimension(canvas, sx, ground + 20, at(reach, 0)[0], ground + 20, text, (0, 14))
    if "time" in shows and exact:
        canvas.text(450, 24, f"time of flight = {shown(flight, 2)} s", 11.5, "end")
    end(self, opts, line, canvas, PROJECTILE_KEYS)


def gather(opts, rows, report, aliases):
    found = {}
    for key, value in opts.pairs:
        if key in FIGURE_KEYS:
            continue
        opts.seen.add(key)
        name = aliases.get(re.sub(r"[\s_-]", "", key.lower()))
        if name:
            found.setdefault(name, []).append(value.strip())
        else:
            report.warn(opts.where, f"unknown setting '{key}'")
    for ln in rows:
        key, colon, value = ln.text.partition(":")
        name = aliases.get(re.sub(r"[\s_-]", "", key.lower())) if colon else None
        if name:
            found.setdefault(name, []).append(value.strip())
        else:
            report.error(ln.where, f"cannot read '{ln.text.strip()[:40]}'")
    return found


def value_with_unit(text, default):
    value = number(text)
    if value is None:
        return None, ""
    tail = re.sub(r"^[-+−]?\s*[\d.]+\s*", "", clean(text)).strip()
    return value, tail or default


def signed(value):
    return shown(value).replace("−", "−")


ENERGY_ALIASES = {
    "ea": "ea",
    "activationenergy": "ea",
    "activation": "ea",
    "dh": "dh",
    "deltah": "dh",
    "enthalpy": "dh",
    "enthalpychange": "dh",
    "heat": "dh",
    "catalysed": "cat",
    "catalyzed": "cat",
    "catalyst": "cat",
    "catalysedea": "cat",
    "catalysedactivationenergy": "cat",
    "reactants": "reactants",
    "products": "products",
    "unit": "unit",
    "transitionstate": "ts",
    "axis": "axis",
}


def energy_path(x0, x1, xp, y_start, y_peak, y_end, bend=52):
    data = f"M{fmt(x0)},{fmt(y_start)} L{fmt(x0 + 70)},{fmt(y_start)} "
    data += f"C{fmt(x0 + 70 + bend)},{fmt(y_start)} {fmt(xp - bend)},{fmt(y_peak)} {fmt(xp)},{fmt(y_peak)} "
    data += f"C{fmt(xp + bend)},{fmt(y_peak)} {fmt(x1 - 70 - bend)},{fmt(y_end)} {fmt(x1 - 70)},{fmt(y_end)} "
    return data + f"L{fmt(x1)},{fmt(y_end)}"


def draw_energyprofile(self, body, line):
    opts, rows = begin(self, body, line, FIGURE_KEYS)
    report = self.report
    given = gather(opts, rows, report, ENERGY_ALIASES)
    first = lambda key: (given.get(key) or [None])[0]
    unit = (first("unit") or "kJ mol^{-1}").strip()
    ea, ea_unit = value_with_unit(first("ea") or "", unit)
    dh, dh_unit = value_with_unit(first("dh") or "", unit)
    if ea is None or dh is None:
        report.error(
            line.where,
            "energyprofile needs 'activation energy: 50' and 'delta H: -120'",
        )
        return
    if ea <= max(0.0, dh):
        report.error(
            line.where,
            "the activation energy must be larger than both zero and delta H",
        )
        return
    cat_text = first("cat")
    cat = None
    if cat_text and cat_text.lower() not in {"no", "false", "off"}:
        cat, _ = value_with_unit(cat_text, unit)
        if cat is None:
            cat = ea * 0.6
        elif cat >= ea or cat <= max(0.0, dh):
            report.error(
                line.where,
                "the catalysed activation energy must be smaller than the uncatalysed one",
            )
            return
    canvas = Canvas(520, 290, accent_of(self))
    bottom, top = 236.0, 40.0
    low = min(0.0, dh)
    scale = (bottom - top - 8) / (ea - low)

    def level(value):
        return bottom - (value - low) * scale - 4

    y_r, y_p, y_t = level(0), level(dh), level(ea)
    left, right, xp = 64.0, 392.0, 230.0
    canvas.arrow(left - 8, bottom + 14, left - 8, 22, INK, 1.4, 7)
    canvas.arrow(left - 8, bottom + 14, 500, bottom + 14, INK, 1.4, 7)
    canvas.text(34, (bottom + 22) / 2, "Enthalpy", 11, italic=True, angle=-90)
    canvas.text(500, bottom + 28, "Reaction progress", 11, "end", italic=True)
    canvas.line(left, y_r, right + 14, y_r, GREY, 1, "4 3")
    if cat is not None:
        y_c = level(cat)
        canvas.path(
            energy_path(left, right, xp, y_r, y_c, y_p),
            "none",
            canvas.accent,
            2.2,
            "6 4",
        )
    canvas.path(energy_path(left, right, xp, y_r, y_t, y_p), "none", INK, 2.4)
    reactants, products = first("reactants"), first("products")
    if reactants:
        canvas.text(left + 35, y_r - 11, reactants, 11.5, weight="bold")
    if products:
        canvas.text(right - 35, y_p - 11, products, 11.5, weight="bold")
    canvas.arrow(xp, y_r, xp, y_t, INK, 1.4, 7, both=True)
    canvas.text(
        xp, y_t - 11, f"E_a = {shown(ea)} {ea_unit}", 11.5, weight="bold", halo=True
    )
    if cat is not None:
        canvas.arrow(xp - 26, y_r, xp - 26, y_c, canvas.accent, 1.4, 7, both=True)
        text = f"E_a (catalysed) = {shown(cat)} {ea_unit}"
        canvas.text(xp + 64, y_c + 2, text, 10.5, "start", canvas.accent, "bold")
    canvas.line(right - 20, y_p, right + 14, y_p, GREY, 1, "4 3")
    canvas.arrow(right + 8, y_r, right + 8, y_p, INK, 1.4, 7, both=True)
    word = "exothermic" if dh < 0 else "endothermic"
    canvas.lines(
        right + 16,
        (y_r + y_p) / 2,
        [f"ΔH = {signed(dh)}", dh_unit, word],
        11,
        anchor="start",
        weight="bold",
    )
    if (first("ts") or "").lower() in {"yes", "true", "on"}:
        canvas.text(xp, y_t - 25, "transition state", 10.5, fill=GREY, italic=True)
    end(self, opts, line, canvas, FIGURE_KEYS)


INDICATORS = {
    "methyl orange": (3.1, 4.4),
    "methyl red": (4.4, 6.2),
    "bromothymol blue": (6.0, 7.6),
    "litmus": (5.0, 8.0),
    "phenol red": (6.8, 8.4),
    "phenolphthalein": (8.3, 10.0),
    "thymolphthalein": (9.3, 10.5),
    "bromophenol blue": (3.0, 4.6),
    "bromocresol green": (3.8, 5.4),
}
TITRATION_ALIASES = {
    "type": "type",
    "volume": "volume",
    "concentration": "conc",
    "equivalence": "eq",
    "equivalencepoint": "eq",
    "pk": "pk",
    "pka": "pk",
    "pkb": "pk",
    "indicator": "indicator",
    "half": "half",
    "xmax": "xmax",
}


def titration_ph(strength, acid_side, conc, volume, titrant_conc, added, pk):
    total = volume + added
    kw = 1e-14
    k = 10**-pk if strength == "weak" else None
    anions = conc * volume / total
    titrant = titrant_conc * added / total

    def balance(ph):
        h = 10**-ph
        weak = anions * k / (k + h) if k else anions
        return titrant + h - kw / h - weak

    low, high = -1.0, 15.0
    for _ in range(80):
        middle = (low + high) / 2
        if balance(middle) > 0:
            low = middle
        else:
            high = middle
    ph = (low + high) / 2
    return ph if acid_side else 14 - ph


def parse_titration_type(text):
    words = re.findall(r"(strong|weak)\s+(acid|base)", (text or "").lower())
    if len(words) != 2 or words[0][1] == words[1][1]:
        return None
    return words


def draw_titration(self, body, line):
    opts, rows = begin(self, body, line, FIGURE_KEYS)
    report = self.report
    given = gather(opts, rows, report, TITRATION_ALIASES)
    first = lambda key: (given.get(key) or [None])[0]
    words = parse_titration_type(first("type") or "strong acid with strong base")
    if words is None:
        report.error(
            line.where, "titration type must look like 'weak acid with strong base'"
        )
        return
    (strength, kind), (titrant_strength, _) = words
    if titrant_strength != "strong":
        report.error(line.where, "the second liquid (in the burette) must be strong")
        return
    acid_side = kind == "acid"
    volume = number(first("volume") or "25") or 25.0
    conc = number(first("conc") or "0.1") or 0.1
    eq = number(first("eq") or str(volume)) or volume
    xmax = number(first("xmax") or "") or eq * 2
    titrant_conc = conc * volume / eq
    pk = number(first("pk") or "") or (4.76 if acid_side else 4.75)

    def ph_at(v):
        return min(
            14.0,
            max(
                0.0,
                titration_ph(strength, acid_side, conc, volume, titrant_conc, v, pk),
            ),
        )

    canvas = Canvas(480, 290, accent_of(self))
    plane = Plane(canvas, (62, 24, 448, 232), (0, xmax), (0, 14))
    canvas.text(255, 262, "Volume of titrant added / cm^{3}", 11, italic=True)
    plane.axes(
        "",
        "pH",
        False,
        False,
        nice_ticks(0, xmax, 6),
        list(range(0, 15, 2)),
        size=10.5,
    )
    ys = [(v, ph_at(v)) for v in [xmax * i / 300 for i in range(301)]]
    clip = plane.clip()
    name, band = first("indicator") or "", None
    if name:
        key = name.lower().strip()
        if key in INDICATORS:
            band = INDICATORS[key]
        else:
            pair = numbers(name)
            if len(pair) >= 2:
                band = (min(pair[-2:]), max(pair[-2:]))
                name = re.sub(r"[\d.\s\-–to]+$", "", name).strip() or "indicator"
            else:
                report.error(
                    line.where,
                    f"unknown indicator '{name}' (give a range: 'indicator: methyl red 4.4 to 6.2')",
                )
    if band:
        y1, y2 = plane.py(band[1]), plane.py(band[0])
        canvas.rect(
            plane.px(0),
            y1,
            plane.px(xmax) - plane.px(0),
            y2 - y1,
            canvas.accent,
            "none",
            0,
            opacity=0.14,
        )
        canvas.line(plane.px(0), y1, plane.px(xmax), y1, canvas.accent, 1, "4 3")
        canvas.line(plane.px(0), y2, plane.px(xmax), y2, canvas.accent, 1, "4 3")
        mid = (band[0] + band[1]) / 2
        left_gap = abs(ph_at(xmax * 0.2) - mid)
        right_gap = abs(ph_at(xmax * 0.85) - mid)
        label = f"{name} ({shown(band[0], 1)} to {shown(band[1], 1)})"
        if left_gap >= right_gap:
            canvas.text(
                plane.px(xmax * 0.03),
                (y1 + y2) / 2,
                label,
                10.5,
                "start",
                canvas.accent,
                "bold",
            )
        else:
            canvas.text(
                plane.px(xmax) - 6,
                (y1 + y2) / 2,
                label,
                10.5,
                "end",
                canvas.accent,
                "bold",
            )
    data = "M" + " L".join(f"{fmt(plane.px(v))},{fmt(plane.py(p))}" for v, p in ys)
    canvas.path(data, "none", INK, 2.4, extra=clip)
    eq_ph = ph_at(eq)
    canvas.line(
        plane.px(eq), plane.py(0), plane.px(eq), plane.py(eq_ph), GREY, 1, "4 3"
    )
    canvas.line(
        plane.px(0), plane.py(eq_ph), plane.px(eq), plane.py(eq_ph), GREY, 1, "4 3"
    )
    canvas.dot(plane.px(eq), plane.py(eq_ph), 4.2, WHITE, INK, 2)
    side = 1 if acid_side else -1
    canvas.lines(
        plane.px(eq) + side * 10,
        plane.py(eq_ph) + side * 22,
        ["equivalence point", f"{shown(eq)} cm^{{3}}, pH {shown(eq_ph, 1)}"],
        11,
        anchor="start" if side > 0 else "end",
        weight="bold",
        halo=True,
    )
    half = (first("half") or ("yes" if strength == "weak" else "no")).lower()
    if half in {"yes", "true", "on"} and strength == "weak":
        hp = ph_at(eq / 2)
        canvas.dot(plane.px(eq / 2), plane.py(hp), 3.4, INK)
        note = f"half-equivalence, pH = pK_{'a' if acid_side else 'b'} = {shown(hp, 1)}"
        canvas.text(
            plane.px(eq / 2) + 8,
            plane.py(hp) + (14 if acid_side else -14),
            note,
            10.5,
            "start",
            halo=True,
        )
    end(self, opts, line, canvas, FIGURE_KEYS)


PUNNETT_KEYS = FIGURE_KEYS | {"cross", "parents", "traits", "ratios"}
CROSS_SPLIT = re.compile(r"\s+[x×]\s+|\s*×\s*|\s+cross\s+", re.I)


def parse_parent(text, ln, report):
    letters = re.sub(r"[^A-Za-z]", "", text)
    genes = {}
    for letter in letters:
        genes.setdefault(letter.lower(), []).append(letter)
    if not letters or any(len(pair) != 2 for pair in genes.values()):
        report.error(
            ln, f"'{text.strip()}' must have two letters for each gene (Tt, RrYy)"
        )
        return None
    return {
        gene: tuple(sorted(pair, key=lambda c: (c.islower(), c)))
        for gene, pair in genes.items()
    }


def cell_genotype(left, right, genes):
    parts = []
    for gene in genes:
        pair = sorted([left[gene], right[gene]], key=lambda c: (c.islower(), c))
        parts.append("".join(pair))
    return "".join(parts)


def gametes_of(parent, genes):
    out = [{}]
    for gene in genes:
        out = [
            {**g, gene: allele} for g in out for allele in dict.fromkeys(parent[gene])
        ]
    return out


def gamete_text(gamete, genes):
    return "".join(gamete[gene] for gene in genes)


def trait_names(opts, rows, genes, report, line):
    names = {}
    chunks = opts.all("traits") + [ln.text for ln in rows]
    for chunk in chunks:
        for piece in split_items(chunk, ",;"):
            match = re.match(r"^([A-Za-z])\s*[=:]\s*(.+)$", piece)
            if match:
                names[match.group(1)] = match.group(2).strip()
            else:
                report.error(
                    line.where,
                    f"cannot read trait '{piece[:30]}' (write 'T = tall, t = short')",
                )
    return names


def phenotype_label(genotype, genes, names):
    parts = []
    for index, gene in enumerate(genes):
        pair = genotype[2 * index : 2 * index + 2]
        dominant = any(c.isupper() for c in pair)
        letter = pair[0] if dominant else pair[0]
        key = gene.upper() if dominant else gene.lower()
        parts.append(
            names.get(key) or (f"{gene.upper()}_" if dominant else f"{gene}{gene}")
        )
    return " ".join(parts)


def simplify(counts):
    divisor = reduce(math.gcd, counts) or 1
    return [c // divisor for c in counts]


def wrap_ratio(title, text, width):
    limit = max(int((width - 30) / 6.4), 20)
    rows, current = [], f"{title}  "
    for index, item in enumerate(text.split(" : ")):
        piece = item if current.strip() == title or index == 0 else f" : {item}"
        if index and len(current) + len(piece) > limit and current.strip() != title:
            rows.append(current.rstrip() + " :")
            current = "   " + item
        else:
            current += piece
    rows.append(current.rstrip())
    return rows


def draw_punnett(self, body, line):
    opts, rows = begin(self, body, line, PUNNETT_KEYS)
    report = self.report
    text = pick(opts, "cross", "parents")
    if not text:
        for ln in list(rows):
            match = re.match(
                r"^(?:cross|parents)\s*[:=]\s*(.+)$", ln.text.strip(), re.I
            )
            if match:
                text = match.group(1)
                rows.remove(ln)
    if not text or len(CROSS_SPLIT.split(text.strip())) != 2:
        report.error(line.where, "punnett needs 'cross: Tt x Tt' (or 'RrYy x RrYy')")
        return
    one, two = CROSS_SPLIT.split(text.strip())
    first, second = parse_parent(one, line.where, report), parse_parent(
        two, line.where, report
    )
    if first is None or second is None:
        return
    genes = list(first)
    if set(first) != set(second) or len(genes) > 2:
        report.error(line.where, "both parents need the same one or two genes")
        return
    names = trait_names(opts, rows, genes, report, line)
    across, down = gametes_of(first, genes), gametes_of(second, genes)
    cols, rows_n = len(across), len(down)
    cell = 62 if len(genes) == 2 else 70
    grid_w, grid_h = cols * cell, rows_n * cell
    ratios = opts.flag("ratios", True)
    genotypes = {}
    cells = []
    for r, down_g in enumerate(down):
        for c, across_g in enumerate(across):
            genotype = cell_genotype(across_g, down_g, genes)
            cells.append((r, c, genotype))
            genotypes[genotype] = genotypes.get(genotype, 0) + 1
    phenotypes = {}
    for genotype, count in genotypes.items():
        label = phenotype_label(genotype, genes, names)
        phenotypes[label] = phenotypes.get(label, 0) + count

    def dominance(genotype):
        return -sum(c.isupper() for c in genotype)

    order = sorted(genotypes, key=lambda g: (dominance(g), g))

    def rank(label):
        return min(
            dominance(g) for g in genotypes if phenotype_label(g, genes, names) == label
        )

    pheno_order = sorted(phenotypes, key=lambda p: (rank(p), -phenotypes[p], p))
    width = max(360, 120 + grid_w + 40)
    text_g = " : ".join(
        f"{n} {g}" for g, n in zip(order, simplify([genotypes[g] for g in order]))
    )
    text_p = " : ".join(
        f"{n} {p}"
        for p, n in zip(pheno_order, simplify([phenotypes[p] for p in pheno_order]))
    )
    lines_g = wrap_ratio("Genotypes", text_g, width)
    lines_p = wrap_ratio("Phenotypes", text_p, width)
    extra = 30 + 18 * (len(lines_g) + len(lines_p)) if ratios else 20
    canvas = Canvas(width, 66 + grid_h + extra, accent_of(self))
    left, top = (width - grid_w) / 2 + 26, 62.0
    canvas.text(
        left + grid_w / 2, 12, f"{one.strip()} × {two.strip()}", 13, weight="bold"
    )
    canvas.text(
        left + grid_w / 2, 30, "gametes of parent 1", 10, fill=GREY, italic=True
    )
    canvas.text(
        left - 36,
        top + grid_h / 2,
        "gametes of parent 2",
        10,
        fill=GREY,
        italic=True,
        angle=-90,
    )
    shade = [mix(canvas.accent, 0.5), mix(canvas.accent, 0.22), "#e9e9e9", WHITE]
    ranking = {label: index for index, label in enumerate(pheno_order)}
    for c, gamete in enumerate(across):
        canvas.text(
            left + (c + 0.5) * cell,
            top - 12,
            gamete_text(gamete, genes),
            13,
            weight="bold",
        )
    for r, gamete in enumerate(down):
        canvas.text(
            left - 12,
            top + (r + 0.5) * cell,
            gamete_text(gamete, genes),
            13,
            "end",
            weight="bold",
        )
    for r, c, genotype in cells:
        label = phenotype_label(genotype, genes, names)
        fill = shade[min(ranking[label], 3)]
        canvas.rect(left + c * cell, top + r * cell, cell, cell, fill, INK, 1.3)
        canvas.text(
            left + (c + 0.5) * cell,
            top + (r + 0.5) * cell,
            genotype,
            14 if len(genes) == 1 else 13,
        )
    if ratios:
        y = top + grid_h + 26
        for index, row in enumerate(lines_g + lines_p):
            bold = "bold" if index >= len(lines_g) else None
            canvas.text(width / 2, y + index * 18, row, 12, weight=bold)
    end(self, opts, line, canvas, PUNNETT_KEYS)


PEDIGREE_KEYS = FIGURE_KEYS | {"legend", "generations"}
SEX_WORDS = {
    "male": "m",
    "m": "m",
    "boy": "m",
    "man": "m",
    "female": "f",
    "f": "f",
    "girl": "f",
    "woman": "f",
    "unknown": "u",
}
STATUS_WORDS = {"affected", "carrier", "deceased", "dead"}


def parse_person(text, where, report):
    match = re.match(
        r"^(?P<name>[^()]+?)\s*(?:\((?P<attrs>[^)]*)\))?\s*$", text.strip()
    )
    if not match or not match.group("name").strip():
        report.error(
            where,
            f"cannot read person '{text.strip()[:30]}' (write 'Ann (female, carrier)')",
        )
        return None
    person = {
        "name": match.group("name").strip(),
        "sex": "u",
        "affected": False,
        "carrier": False,
        "dead": False,
    }
    for word in re.findall(r"[a-z]+", (match.group("attrs") or "").lower()):
        if word in SEX_WORDS:
            person["sex"] = SEX_WORDS[word]
        elif word in STATUS_WORDS:
            key = "dead" if word in {"deceased", "dead"} else word
            person[key] = True
        elif word not in {"unaffected", "normal", "healthy", "and"}:
            report.error(
                where,
                f"'{word}' is not understood (use male, female, affected, carrier, deceased)",
            )
    if "(" not in text:
        report.warn(
            where,
            f"'{person['name']}' has no sex given, drawn as a diamond (add '(male)' or '(female)')",
        )
    return person


def pedigree_units(rows, report):
    roots, stack = [], []
    for ln in rows:
        raw = ln.text.expandtabs(4)
        indent = len(raw) - len(raw.lstrip())
        people = [
            parse_person(p, ln.where, report)
            for p in re.split(r"\s+[+&]\s+|\s*\+\s*", raw.strip())
        ]
        if None in people or not people:
            continue
        if len(people) > 2:
            report.error(ln.where, "a couple has two people (A + B)")
            continue
        unit = {"people": people, "children": [], "generation": 0}
        while stack and stack[-1][0] >= indent:
            stack.pop()
        if stack:
            parent = stack[-1][1]
            parent["children"].append(unit)
            unit["generation"] = parent["generation"] + 1
        else:
            roots.append(unit)
        stack.append((indent, unit))
    return roots


COUPLE = 64.0
SLOT_ALONE = 62.0
SLOT_COUPLE = 118.0


def unit_width(unit):
    own = SLOT_COUPLE if len(unit["people"]) == 2 else SLOT_ALONE
    unit["own"] = own
    unit["width"] = max(own, sum(unit_width(child) for child in unit["children"]))
    return unit["width"]


def place_unit(unit, left):
    start = left + (unit["width"] - sum(c["width"] for c in unit["children"])) / 2
    for child in unit["children"]:
        place_unit(child, start)
        start += child["width"]
    couple = len(unit["people"]) == 2
    if unit["children"]:
        first, last = unit["children"][0]["x"], unit["children"][-1]["x"]
        mid = (first + last) / 2
    else:
        mid = left + unit["width"] / 2
    unit["mid"] = mid
    unit["x"] = mid - COUPLE / 2 if couple else mid


def walk_units(unit):
    yield unit
    for child in unit["children"]:
        yield from walk_units(child)


def draw_person(canvas, person, x, y):
    size = 12
    fill = INK if person["affected"] else WHITE
    if person["sex"] == "m":
        canvas.rect(x - size, y - size, 2 * size, 2 * size, fill, INK, 1.8)
    elif person["sex"] == "f":
        canvas.circle(x, y, size, fill, INK, 1.8)
    else:
        canvas.polygon(
            [(x, y - 15), (x + 15, y), (x, y + 15), (x - 15, y)], fill, INK, 1.8
        )
    if person["carrier"]:
        canvas.dot(x, y, 4.2, INK, INK)
    if person["dead"]:
        canvas.line(x - 17, y + 17, x + 17, y - 17, INK, 1.8)
    canvas.text(x, y + 28, person["name"], 11)


def draw_pedigree(self, body, line):
    opts, rows = begin(self, body, line, PEDIGREE_KEYS)
    roots = pedigree_units(rows, self.report)
    if not roots:
        self.report.error(
            line.where,
            "pedigree is empty (write 'Ann (female) + Bob (male, affected)')",
        )
        return
    total, start = 0.0, 0.0
    for root in roots:
        total += unit_width(root)
    for root in roots:
        place_unit(root, start)
        start += root["width"]
    units = [u for root in roots for u in walk_units(root)]
    depth = max(u["generation"] for u in units) + 1
    uses = {
        key: any(p[key] for u in units for p in u["people"])
        for key in ("affected", "carrier", "dead")
    }
    legend = opts.flag("legend", True) and any(uses.values())
    width = max(total + 60, 300)
    shift = 44 + (width - 44 - total) / 2 - 18
    pitch = 104.0
    height = 40 + depth * pitch + (34 if legend else 0)
    canvas = Canvas(width, height, accent_of(self))
    numerals = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII"]
    for generation in range(depth):
        canvas.text(
            16,
            38 + generation * pitch,
            numerals[generation % 8],
            12,
            weight="bold",
            italic=True,
        )
    for unit in units:
        y = 38 + unit["generation"] * pitch
        mid = unit["mid"] + shift
        first = unit["x"] + shift
        if len(unit["people"]) == 2:
            canvas.line(first + 12, y, first + COUPLE - 12, y, INK, 1.8)
        for index, person in enumerate(unit["people"]):
            draw_person(canvas, person, first + index * COUPLE, y)
        if unit["children"]:
            drop = y + 50
            canvas.line(
                mid, y if len(unit["people"]) == 2 else y + 12, mid, drop, INK, 1.8
            )
            xs = [c["x"] + shift for c in unit["children"]]
            canvas.line(min(xs + [mid]), drop, max(xs + [mid]), drop, INK, 1.8)
            for child, cx in zip(unit["children"], xs):
                canvas.line(cx, drop, cx, y + pitch - 15, INK, 1.8)
    if legend:
        y, x = height - 16, 50.0
        items = []
        if uses["affected"]:
            items.append(
                (
                    "affected",
                    lambda cx: canvas.rect(cx - 7, y - 7, 14, 14, INK, INK, 1.4),
                )
            )
        if uses["carrier"]:

            def carrier(cx):
                canvas.rect(cx - 7, y - 7, 14, 14, WHITE, INK, 1.4)
                canvas.dot(cx, y, 2.8)

            items.append(("carrier", carrier))
        if uses["dead"]:

            def dead(cx):
                canvas.rect(cx - 7, y - 7, 14, 14, WHITE, INK, 1.4)
                canvas.line(cx - 10, y + 10, cx + 10, y - 10, INK, 1.4)

            items.append(("deceased", dead))
        for label, painter in items:
            painter(x)
            canvas.text(x + 13, y, label, 10.5, "start")
            x += 40 + text_width(label, 10.5)
    end(self, opts, line, canvas, PEDIGREE_KEYS)


PYRAMID_KEYS = FIGURE_KEYS | {"unit", "shape", "scale", "efficiency", "order"}


def thousands(value):
    return f"{value:,.0f}" if value >= 1000 else fmt(value, 2)


def draw_pyramid(self, body, line):
    opts, rows = begin(self, body, line, PYRAMID_KEYS)
    report = self.report
    levels = []
    for ln in rows:
        name, colon, value = ln.text.rpartition(":")
        amount = number(value.replace(",", "")) if colon else None
        if amount is None or amount <= 0 or not name.strip():
            report.error(
                ln.where,
                f"cannot read '{ln.text.strip()[:40]}' (write 'Producers: 20000')",
            )
            continue
        levels.append((name.strip(), amount))
    if len(levels) < 2:
        report.error(line.where, "pyramid needs at least two levels, producers first")
        return
    if (opts.get("order") or "").lower() in {"top", "top first"}:
        levels.reverse()
    unit = (opts.get("unit") or "").strip()
    shape = (opts.get("shape") or "bars").lower()
    mode = (opts.get("scale") or "linear").lower()
    show_eff = opts.flag("efficiency", False)
    count = len(levels)
    row = 44.0
    label_w = max(text_width(name, 11.5) for name, _ in levels) + 14
    centre = 40 + label_w + 130
    tags = [f"{thousands(v)} {unit}".strip() for _, v in levels]
    reach = centre + 126 + 16 + max(text_width(t, 11.5) for t in tags)
    canvas = Canvas(max(reach, 420), count * row + 28, accent_of(self))
    top_value = max(v for _, v in levels)
    transform = {
        "log": lambda v: math.log10(v)
        + 1
        - math.log10(min(x for _, x in levels))
        + 0.15,
        "sqrt": math.sqrt,
    }.get(mode, lambda v: v)
    scale = 252 / transform(top_value)
    for index, (name, value) in enumerate(levels):
        y = canvas.height - 14 - (index + 1) * row + 4
        if shape == "triangle":
            half_bottom = 126 * (1 - index / count)
            half_top = 126 * (1 - (index + 1) / count)
            canvas.polygon(
                [
                    (centre - half_bottom, y + row - 3),
                    (centre + half_bottom, y + row - 3),
                    (centre + half_top, y + 3),
                    (centre - half_top, y + 3),
                ],
                mix(canvas.accent, 0.15 + 0.5 * (1 - index / max(count - 1, 1)) * 0.5),
                INK,
                1.5,
            )
            canvas.text(
                centre,
                y + row / 2,
                f"{thousands(value)} {unit}".strip(),
                11.5,
                weight="bold",
                halo=True,
            )
        else:
            width = max(transform(value) * scale, 10)
            canvas.rect(
                centre - width / 2,
                y + 3,
                width,
                row - 6,
                mix(canvas.accent, 0.2 + 0.4 * (1 - index / max(count - 1, 1))),
                INK,
                1.5,
            )
            canvas.text(
                centre + width / 2 + 8,
                y + row / 2,
                f"{thousands(value)} {unit}".strip(),
                11.5,
                "start",
                weight="bold",
            )
        canvas.text(40 + label_w - 8, y + row / 2, name, 11.5, "end")
        if show_eff and index + 1 < count:
            share = levels[index + 1][1] / value * 100
            canvas.text(
                40 + label_w - 8,
                y + 3,
                f"{fmt(share, 1)}% passed on",
                10,
                "end",
                GREY,
                italic=True,
            )
    end(self, opts, line, canvas, PYRAMID_KEYS)


WEB_KEYS = FIGURE_KEYS | {"direction"}
EATS = re.compile(
    r"^(.+?)\s+(?:eats|eat|feeds on|feed on|preys on|consumes)\s+(.+)$", re.I
)
EATEN = re.compile(r"^(.+?)\s+(?:is eaten by|are eaten by|is food for)\s+(.+)$", re.I)


def web_edges(rows, report):
    edges, names = [], []

    def note(items):
        for item in items:
            if item not in names:
                names.append(item)
        return items

    for ln in rows:
        text = clean(ln.text).replace("→", "->")
        if "->" in text:
            chain = [note(split_items(part, ",&")) for part in text.split("->")]
            for current, following in zip(chain, chain[1:]):
                edges.extend((a, b) for a in current for b in following)
            continue
        match = EATS.match(text)
        if match:
            eater, food = match.group(1).strip(), note(
                split_items(match.group(2), ",&")
            )
            note([eater])
            edges.extend((f, eater) for f in food)
            continue
        match = EATEN.match(text)
        if match:
            food, eaters = match.group(1).strip(), note(
                split_items(match.group(2), ",&")
            )
            note([food])
            edges.extend((food, e) for e in eaters)
            continue
        report.error(
            ln.where,
            f"cannot read '{text[:40]}' (write 'Grass -> Rabbit, Mouse' or 'Fox eats Rabbit')",
        )
    return list(dict.fromkeys(edges)), names


def web_levels(names, edges, report, where):
    levels = {name: 0 for name in names}
    for _ in range(len(names) + 1):
        changed = False
        for a, b in edges:
            if levels[b] < levels[a] + 1:
                levels[b] = levels[a] + 1
                changed = True
        if not changed:
            return levels
    report.error(where, "the food web loops back on itself (check the arrows)")
    return None


def web_order(names, edges, levels):
    rows = {}
    for name in names:
        rows.setdefault(levels[name], []).append(name)
    position = {name: index for row in rows.values() for index, name in enumerate(row)}

    def weight(name):
        near = [position[b if a == name else a] for a, b in edges if name in (a, b)]
        return sum(near) / len(near) if near else position[name]

    for _ in range(6):
        for level in sorted(rows):
            rows[level].sort(key=weight)
            for index, name in enumerate(rows[level]):
                position[name] = index
    return rows


def box_exit(cx, cy, half_w, half_h, dx, dy):
    scale = min(half_w / abs(dx) if dx else 1e9, half_h / abs(dy) if dy else 1e9)
    return cx + dx * scale, cy + dy * scale


def draw_foodweb(self, body, line):
    opts, rows = begin(self, body, line, WEB_KEYS)
    edges, names = web_edges(rows, self.report)
    if not edges:
        self.report.error(line.where, "foodweb needs arrows such as 'Grass -> Rabbit'")
        return
    levels = web_levels(names, edges, self.report, line.where)
    if levels is None:
        return
    grid = web_order(names, edges, levels)
    depth = max(grid) + 1
    wide = max(len(row) for row in grid.values())
    sizes = {n: (max(text_width(n, 11.5) + 18, 52), 26) for n in names}
    spread = max(480.0, wide * (max(w for w, _ in sizes.values()) + 26))
    pitch = 84.0
    canvas = Canvas(spread, depth * pitch + 20, accent_of(self))
    spot = {}
    for level, row in grid.items():
        y = canvas.height - 38 - level * pitch
        for index, name in enumerate(row):
            spot[name] = ((index + 0.5) * spread / len(row), y)
    for a, b in edges:
        (x1, y1), (x2, y2) = spot[a], spot[b]
        (w1, h1), (w2, h2) = sizes[a], sizes[b]
        skip = levels[b] - levels[a] > 1
        dx, dy = x2 - x1, y2 - y1
        length = math.hypot(dx, dy) or 1
        if skip:
            side = 1 if (x1 + x2) / 2 >= spread / 2 else -1
            cx, cy = (x1 + x2) / 2 + side * 46, (y1 + y2) / 2
            ux1, uy1 = cx - x1, cy - y1
            ux2, uy2 = x2 - cx, y2 - cy
            n1, n2 = math.hypot(ux1, uy1) or 1, math.hypot(ux2, uy2) or 1
            sx, sy = box_exit(x1, y1, w1 / 2 + 2, h1 / 2 + 2, ux1 / n1, uy1 / n1)
            tx, ty = box_exit(x2, y2, w2 / 2 + 6, h2 / 2 + 6, -ux2 / n2, -uy2 / n2)
            canvas.path(
                f"M{fmt(sx)},{fmt(sy)} Q{fmt(cx)},{fmt(cy)} {fmt(tx)},{fmt(ty)}",
                "none",
                INK,
                1.5,
            )
            vx, vy = tx - cx, ty - cy
            norm = math.hypot(vx, vy) or 1
            canvas.head(tx, ty, vx / norm, vy / norm, 8, INK)
        else:
            sx, sy = box_exit(x1, y1, w1 / 2 + 2, h1 / 2 + 2, dx / length, dy / length)
            tx, ty = box_exit(
                x2, y2, w2 / 2 + 3, h2 / 2 + 3, -dx / length, -dy / length
            )
            canvas.arrow(sx, sy, tx, ty, INK, 1.5, 8)
    for name, (x, y) in spot.items():
        w, h = sizes[name]
        fill = mix(canvas.accent, min(0.07 + 0.09 * levels[name], 0.4))
        canvas.rect(x - w / 2, y - h / 2, w, h, fill, INK, 1.5, radius=5)
        canvas.text(x, y, name, 11.5)
    end(self, opts, line, canvas, WEB_KEYS)


class Kit:
    DIRS = {
        "circuit",
        "fbd",
        "wave",
        "incline",
        "projectile",
        "energyprofile",
        "titration",
        "punnett",
        "pedigree",
        "pyramid",
        "foodweb",
    }

    def dir_circuit(self, args, body, line):
        draw_circuit(self, body, line)

    def dir_fbd(self, args, body, line):
        draw_fbd(self, body, line)

    def dir_wave(self, args, body, line):
        draw_wave(self, body, line)

    def dir_incline(self, args, body, line):
        draw_incline(self, body, line)

    def dir_projectile(self, args, body, line):
        draw_projectile(self, body, line)

    def dir_energyprofile(self, args, body, line):
        draw_energyprofile(self, body, line)

    def dir_titration(self, args, body, line):
        draw_titration(self, body, line)

    def dir_punnett(self, args, body, line):
        draw_punnett(self, body, line)

    def dir_pedigree(self, args, body, line):
        draw_pedigree(self, body, line)

    def dir_pyramid(self, args, body, line):
        draw_pyramid(self, body, line)

    def dir_foodweb(self, args, body, line):
        draw_foodweb(self, body, line)
