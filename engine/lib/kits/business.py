import math
import re

from . import FIGURE_KEYS
from .drawing import (
    GREY,
    INK,
    WIDTH,
    PALETTE,
    Placer,
    accent_of,
    arrow,
    box,
    canvas,
    circle,
    el,
    groups,
    line,
    lines_of_text,
    n,
    parse_number,
    pick,
    polygon,
    read,
    shade,
    show,
    text,
    ticks,
    tint,
    width_of,
    wrap,
)

GANTT_KEYS = FIGURE_KEYS | {"unit", "periods"}
BCG_KEYS = FIGURE_KEYS | {"bubble", "growth-line", "share-line"}
FRAME_KEYS = FIGURE_KEYS
FISH_KEYS = FIGURE_KEYS | {"effect", "problem", "title"}

TOKEN = r"[A-Za-z0-9]+"
MILESTONE = re.compile(rf"^(?:milestone|due)\s*(?:at|on|in)?\s*({TOKEN})$", re.I)
RANGE = re.compile(rf"^({TOKEN})\s*(?:-|–|to|until|through)\s*({TOKEN})$", re.I)
LENGTH = re.compile(rf"^({TOKEN})\s*(?:,|for|\+|lasting)\s*(\d+)(?:\s*[a-z]+)?$", re.I)
AFTER = re.compile(
    r"^after\s+(.+?)(?:\s*(?:,|for|\+|lasting)\s*(\d+)(?:\s*[a-z]+)?)?$", re.I
)

PESTLE = {
    "political": ["politics", "pol", "government"],
    "economic": ["economy", "economics", "eco"],
    "social": ["society", "sociocultural", "socio cultural", "cultural", "soc"],
    "technological": ["technology", "tech"],
    "legal": ["law", "laws", "legislation"],
    "environmental": ["environment", "ecological", "env"],
}
PESTLE_ORDER = [
    "political",
    "economic",
    "social",
    "technological",
    "legal",
    "environmental",
]
STEEP_ORDER = ["social", "technological", "economic", "environmental", "political"]

FORCES = {
    "entrants": [
        "new entrants",
        "threat of new entrants",
        "entry",
        "new entrant",
        "barriers to entry",
    ],
    "suppliers": ["supplier power", "supplier", "bargaining power of suppliers"],
    "rivalry": ["competitive rivalry", "competition", "rivals", "industry rivalry"],
    "buyers": ["buyer power", "customers", "buyer", "bargaining power of buyers"],
    "substitutes": ["threat of substitutes", "substitute", "substitution"],
}
FORCE_TITLES = {
    "entrants": "Threat of new entrants",
    "suppliers": "Supplier power",
    "rivalry": "Competitive rivalry",
    "buyers": "Buyer power",
    "substitutes": "Threat of substitutes",
}
LEVELS = {"high", "medium", "low"}

ANSOFF = {
    "penetration": ["market penetration"],
    "product": ["product development", "new products"],
    "market": ["market development", "new markets"],
    "diversification": ["diversify", "diversifying"],
}
ANSOFF_CELLS = {
    "penetration": ("Market penetration", 0, 0, 0.9, "Lowest risk"),
    "product": ("Product development", 0, 1, 0.8, "Medium risk"),
    "market": ("Market development", 1, 0, 0.8, "Medium risk"),
    "diversification": ("Diversification", 1, 1, 0.66, "Highest risk"),
}

BCG_FIELDS = {
    "share": ["relative share", "relative market share", "market share", "rms", "rs"],
    "growth": ["market growth", "growth rate", "mgr", "market growth rate"],
    "size": ["sales", "revenue", "value", "turnover", "volume", "profit"],
}
STAKE_FIELDS = {"power": ["influence"], "interest": ["concern"]}


def colours(accent):
    return [accent, *PALETTE[1:]]


def metrics(content, order, table, report, where):
    found, free = {}, list(order)
    for part in re.split(r"\s*,\s*", content.strip()):
        if not part:
            continue
        value = parse_number(part)
        if value is not None:
            if free:
                found[free.pop(0)] = value
            continue
        match = re.match(
            r"^([A-Za-z][A-Za-z ]*[A-Za-z])\s*[:=]?\s*([^A-Za-z\s]\S*)$", part
        )
        key = pick(match.group(1), table, report, where) if match else None
        value = parse_number(match.group(2)) if match else None
        if key is None or value is None:
            report.error(where, f"cannot read '{part}' (write 'power 8, interest 5')")
            continue
        found[key] = value
        if key in free:
            free.remove(key)
    return found


def named_lines(rest, report):
    for ln in rest:
        stripped = ln.text.strip()
        name, colon, content = stripped.partition(":")
        if not colon or not name.strip():
            report.error(
                ln.where,
                f"cannot read this line: '{stripped[:50]}' (write 'Name: value')",
            )
            continue
        yield ln, name.strip(), content.strip()


def period_of(token, labels):
    if token.isdigit():
        return int(token)
    return labels.get(token.lower())


def gantt_rows(rest, labels, report):
    rows, ends = [], {}
    for ln in rest:
        stripped = ln.text.strip()
        heading = re.match(r"^(?:section|phase|stage|#+)\s*:?\s*(.+)$", stripped, re.I)
        if heading and ":" not in heading.group(1):
            rows.append({"kind": "section", "name": heading.group(1).strip()})
            continue
        name, colon, spec = stripped.partition(":")
        if not colon or not name.strip():
            report.error(
                ln.where,
                f"cannot read '{stripped[:50]}' (write 'Design: 2-4' or "
                "'Launch: milestone 10' or 'Build: after Design, 3')",
            )
            continue
        name, spec = name.strip(), spec.strip()
        row = parse_when(spec, labels, ends)
        if row is None:
            report.error(
                ln.where,
                f"cannot read the timing '{spec}' for '{name}' (use '2-4', '2 for 3', "
                "'after Task, 3' or 'milestone 6')",
            )
            continue
        if isinstance(row, str):
            report.error(
                ln.where, f"'{name}' comes after '{row}', which is not defined above"
            )
            continue
        start, end, kind, dep = row
        if end < start:
            report.error(ln.where, f"'{name}' ends before it starts")
            continue
        ends[name.lower()] = end
        rows.append(
            {"kind": kind, "name": name, "start": start, "end": end, "dep": dep}
        )
    return rows


def parse_when(spec, labels, ends):
    match = MILESTONE.match(spec)
    if match:
        at = period_of(match.group(1), labels)
        return (at, at, "milestone", None) if at else None
    match = AFTER.match(spec)
    if match:
        dep = match.group(1).strip().lower()
        if dep not in ends:
            return match.group(1).strip()
        start = ends[dep] + 1
        return start, start + int(match.group(2) or 1) - 1, "task", dep
    match = RANGE.match(spec)
    if match:
        first, last = (period_of(match.group(i), labels) for i in (1, 2))
        return (first, last, "task", None) if first and last else None
    match = LENGTH.match(spec)
    if match:
        first = period_of(match.group(1), labels)
        return (first, first + int(match.group(2)) - 1, "task", None) if first else None
    single = period_of(spec, labels)
    return (single, single, "task", None) if single else None


def draw_gantt(rows, count, names, unit, accent):
    label_w = min(190, max(width_of(r["name"], 11) for r in rows) + 24)
    label_w = max(label_w, 84)
    chart_x = label_w
    cell = (WIDTH - chart_x - 4) / count
    deep = shade(accent, 0.35)
    parts = [box(0, 0, WIDTH, 24, tint(accent, 0.86))]
    step = 1 if cell >= 26 or (names and cell >= 20) else math.ceil(26 / cell)
    for k in range(count):
        if k % step == 0:
            label = names[k] if k < len(names) else str(k + 1)
            parts.append(
                text(chart_x + (k + 0.5) * cell, 16, label, 10.5, "middle", fill=deep)
            )
    parts.append(
        text(8, 16, unit.capitalize() if unit else "", 10.5, fill=deep, weight="bold")
    )
    y, spots, links, body = 24.0, {}, [], []
    for row in rows:
        if row["kind"] == "section":
            body.append(box(0, y, WIDTH, 22, tint(accent, 0.94)))
            body.append(text(8, y + 15, row["name"], 11, weight="bold", fill=deep))
            y += 22
            continue
        lines = wrap(row["name"], label_w - 20, 11)
        height = max(26, 10 + 13 * len(lines))
        mid = y + height / 2
        body.append(
            lines_of_text(14, mid - 13 * (len(lines) - 1) / 2 + 4, lines, 11, 13)
        )
        left = chart_x + (row["start"] - 1) * cell
        right = chart_x + row["end"] * cell
        if row["kind"] == "milestone":
            cx = chart_x + (row["start"] - 0.5) * cell
            body.append(
                polygon(
                    [(cx, mid - 8), (cx + 8, mid), (cx, mid + 8), (cx - 8, mid)], INK
                )
            )
            left = right = cx
        else:
            body.append(box(left, mid - 7, right - left, 14, accent, r=3))
        spots[row["name"].lower()] = (right, mid)
        if row["dep"] in spots:
            links.append((spots[row["dep"]], (left, mid)))
        body.append(line(0, y + height, WIDTH, y + height, "#ececec", 0.6))
        y += height
    grid = [
        line(chart_x + k * cell, 24, chart_x + k * cell, y, "#e4e4e4", 0.6)
        for k in range(count + 1)
    ]
    for (x1, y1), (x2, y2) in links:
        route = f"M{n(x1)},{n(y1 + 7)} V{n(y2)} H{n(x2 - 3)}"
        body.append(el("path", d=route, fill="none", stroke=GREY, stroke_width=0.9))
        body.append(polygon([(x2, y2), (x2 - 5, y2 - 3), (x2 - 5, y2 + 3)], GREY))
    return canvas(y + 4, parts + grid + body)


def draw_factors(found, order, accent, palette_order):
    shades = colours(accent)
    parts, y = [], 0.0
    tab = 104
    for canon in order:
        entry = found.get(canon)
        if entry is None:
            continue
        colour = shades[palette_order.index(canon) % len(shades)]
        bullets = [wrap(item, WIDTH - tab - 36, 11.5) for item in entry] or [
            ["(none added)"]
        ]
        count = sum(len(chunk) for chunk in bullets)
        height = max(58, 16 + 15 * count)
        parts.append(box(0, y, tab, height, colour, r=3))
        parts.append(
            box(
                tab,
                y,
                WIDTH - tab,
                height,
                tint(colour, 0.91),
                tint(colour, 0.55),
                0.8,
                3,
            )
        )
        parts.append(
            text(
                tab / 2,
                y + height / 2 + 2,
                canon[0].upper(),
                28,
                "middle",
                "bold",
                "#ffffff",
            )
        )
        parts.append(
            text(
                tab / 2,
                y + height / 2 + 17,
                canon.capitalize(),
                10.5,
                "middle",
                None,
                "#ffffff",
            )
        )
        cursor = y + 21
        for chunk in bullets:
            parts.append(circle(tab + 14, cursor - 3.5, 2, colour))
            parts.append(lines_of_text(tab + 24, cursor, chunk, 11.5, 15))
            cursor += 15 * len(chunk)
        y += height + 6
    return canvas(y - 2, parts)


def factor_block(doc, body, line_, order, label):
    opts, rest = read(doc, body, line_, FRAME_KEYS)
    found = {}
    for entry in groups(rest, doc.report):
        canon = pick(entry["name"], PESTLE, doc.report, entry["ln"].where)
        if canon is None:
            continue
        if canon not in order:
            doc.report.error(
                entry["ln"].where,
                f"'{entry['name']}' is not part of {label} (use {', '.join(order)})",
            )
            continue
        found.setdefault(canon, []).extend(entry["items"])
    if not found:
        doc.report.error(
            line_.where,
            f"{label} needs lines such as 'Political: new tax law; election'",
        )
        return
    markup = draw_factors(found, order, accent_of(doc), order)
    show(doc, opts, line_, markup, FRAME_KEYS)


def draw_porter(found, accent):
    col_w, gap = 156.0, 26.0
    xs = [0.0, col_w + gap, 2 * (col_w + gap)]
    deep = shade(accent, 0.3)

    def panel(canon, x, y, force_h=None):
        entry = found.get(canon, [])
        level = next((i for i in entry if i.lower() in LEVELS), None)
        items = [i for i in entry if i.lower() not in LEVELS]
        wrapped = [wrap(i, col_w - 26, 11) for i in items]
        need = 34 + sum(13 * len(c) + 3 for c in wrapped) + 8
        return {
            "canon": canon,
            "x": x,
            "y": y,
            "wrapped": wrapped,
            "level": level,
            "need": need,
        }

    cells = {
        "entrants": panel("entrants", xs[1], 0),
        "suppliers": panel("suppliers", xs[0], 0),
        "rivalry": panel("rivalry", xs[1], 0),
        "buyers": panel("buyers", xs[2], 0),
        "substitutes": panel("substitutes", xs[1], 0),
    }
    top = max(cells["entrants"]["need"], 70)
    mid = max(cells[k]["need"] for k in ("suppliers", "rivalry", "buyers"))
    mid = max(mid, 90)
    bottom = max(cells["substitutes"]["need"], 70)
    cells["entrants"].update(y=0, h=top)
    for key in ("suppliers", "rivalry", "buyers"):
        cells[key].update(y=top + gap, h=mid)
    cells["substitutes"].update(y=top + mid + 2 * gap, h=bottom)
    parts = []
    for key, cell in cells.items():
        x, y, h = cell["x"], cell["y"], cell["h"]
        centre = key == "rivalry"
        fill = accent if centre else tint(accent, 0.9)
        ink = "#ffffff" if centre else deep
        parts.append(
            box(
                x,
                y,
                col_w,
                h,
                tint(accent, 0.94) if not centre else tint(accent, 0.8),
                accent,
                1.2,
                4,
            )
        )
        parts.append(box(x, y, col_w, 24, fill, accent, 1.2, 4))
        parts.append(
            text(x + col_w / 2, y + 16, FORCE_TITLES[key], 11, "middle", "bold", ink)
        )
        cursor = y + 40
        for chunk in cell["wrapped"]:
            parts.append(circle(x + 10, cursor - 3.5, 1.8, accent))
            parts.append(lines_of_text(x + 18, cursor, chunk, 11, 13))
            cursor += 13 * len(chunk) + 3
        if cell["level"]:
            parts.append(
                text(
                    x + col_w - 8,
                    y + h - 7,
                    f"{cell['level'].capitalize()} force",
                    9.5,
                    "end",
                    None,
                    GREY,
                    font_style="italic",
                )
            )
    mid_y = top + gap + mid / 2
    centre_x = xs[1] + col_w / 2
    parts.append(arrow(centre_x, top, centre_x, top + gap, accent))
    parts.append(
        arrow(centre_x, top + mid + 2 * gap, centre_x, top + mid + gap, accent)
    )
    parts.append(arrow(xs[0] + col_w, mid_y, xs[1], mid_y, accent))
    parts.append(arrow(xs[2], mid_y, xs[1] + col_w, mid_y, accent))
    return canvas(top + mid + bottom + 2 * gap + 2, parts)


def draw_matrix_axes(parts, left, top, right, bottom, x_title, y_title, x_ends, y_ends):
    parts.append(box(left, top, right - left, bottom - top, "none", INK, 1))
    parts.append(text((left + right) / 2, bottom + 36, x_title, 11.5, "middle", "bold"))
    cy = (top + bottom) / 2
    parts.append(
        text(
            14, cy, y_title, 11.5, "middle", "bold", transform=f"rotate(-90 14 {n(cy)})"
        )
    )
    parts.append(text(left, bottom + 14, x_ends[0], 10.5, fill=GREY))
    parts.append(text(right, bottom + 14, x_ends[1], 10.5, "end", fill=GREY))


def draw_ansoff(found, accent):
    left, top = 46.0, 28.0
    col_w = (WIDTH - left - 6) / 2
    deep = shade(accent, 0.3)
    parts = []
    sized = {}
    for canon, (title, row, col, amount, risk) in ANSOFF_CELLS.items():
        items = found.get(canon, [])
        wrapped = [wrap(i, col_w - 30, 11.5) for i in items]
        sized[canon] = 44 + sum(15 * len(c) + 3 for c in wrapped)
    row_h = [
        max(sized["penetration"], sized["product"], 96),
        max(sized["market"], sized["diversification"], 96),
    ]
    for col, title in enumerate(["Existing products", "New products"]):
        x = left + col * (col_w + 6)
        parts.append(box(x, 0, col_w, 24, accent, r=3))
        parts.append(text(x + col_w / 2, 16, title, 11.5, "middle", "bold", "#ffffff"))
    for row, title in enumerate(["Existing markets", "New markets"]):
        y = top + sum(row_h[:row]) + row * 6
        parts.append(box(0, y, 36, row_h[row], accent, r=3))
        cy = y + row_h[row] / 2
        parts.append(
            text(
                18,
                cy + 4,
                title,
                11.5,
                "middle",
                "bold",
                "#ffffff",
                transform=f"rotate(-90 18 {n(cy)})",
            )
        )
    for canon, (title, row, col, amount, risk) in ANSOFF_CELLS.items():
        x = left + col * (col_w + 6)
        y = top + sum(row_h[:row]) + row * 6
        parts.append(box(x, y, col_w, row_h[row], tint(accent, amount), accent, 0.9, 3))
        parts.append(text(x + 10, y + 19, title, 12.5, weight="bold", fill=deep))
        parts.append(
            text(
                x + col_w - 10, y + 19, risk, 10, "end", None, GREY, font_style="italic"
            )
        )
        cursor = y + 41
        for item in found.get(canon, []):
            chunk = wrap(item, col_w - 30, 11.5)
            parts.append(circle(x + 14, cursor - 3.5, 2, accent))
            parts.append(lines_of_text(x + 22, cursor, chunk, 11.5, 15))
            cursor += 15 * len(chunk) + 3
    return canvas(top + sum(row_h) + 6, parts)


def draw_bcg(items, accent, share_line, growth_line, bubble):
    left, top, right, bottom = 58.0, 14.0, 508.0, 372.0
    plot_w, plot_h = right - left, bottom - top
    reach = max(
        [share_line * 10]
        + [i["share"] / share_line for i in items]
        + [share_line / i["share"] for i in items]
    )
    decades = 10 ** math.ceil(math.log10(reach) - 1e-9)
    hi, lo = share_line * decades, share_line / decades
    span = math.log10(hi) - math.log10(lo)
    values = [i["growth"] for i in items]
    y_top = max(growth_line * 2, math.ceil(max(values) * 1.15 / 5) * 5)
    y_low = min(0.0, math.floor(min(values) / 5) * 5)

    def px(share):
        return left + (math.log10(hi) - math.log10(share)) / span * plot_w

    def py(growth):
        return bottom - (growth - y_low) / (y_top - y_low) * plot_h

    mid_x, mid_y = px(share_line), py(growth_line)
    deep = shade(accent, 0.3)
    quads = [
        (left, top, mid_x - left, mid_y - top, 0.82, "Stars", "start", left + 8),
        (
            mid_x,
            top,
            right - mid_x,
            mid_y - top,
            0.93,
            "Question marks",
            "end",
            right - 8,
        ),
        (
            left,
            mid_y,
            mid_x - left,
            bottom - mid_y,
            0.93,
            "Cash cows",
            "start",
            left + 8,
        ),
        (mid_x, mid_y, right - mid_x, bottom - mid_y, 0.82, "Dogs", "end", right - 8),
    ]
    parts, placer = [], Placer(left, top, right, bottom)
    for k, (x, y, w, h, amount, name, anchor, tx) in enumerate(quads):
        parts.append(box(x, y, w, h, tint(accent, amount)))
        ty = y + 17 if k < 2 else y + h - 8
        parts.append(text(tx, ty, name, 12, anchor, "bold", deep))
        edge = tx if anchor == "start" else tx - width_of(name, 12, True)
        placer.block(edge - 2, ty - 13, edge + width_of(name, 12, True) + 2, ty + 4)
    parts.append(line(mid_x, top, mid_x, bottom, deep, 1, "4 3"))
    parts.append(line(left, mid_y, right, mid_y, deep, 1, "4 3"))
    draw_matrix_axes(
        parts,
        left,
        top,
        right,
        bottom,
        "Relative market share",
        "Market growth rate (%)",
        ("", ""),
        ("", ""),
    )
    decade_values = [lo * 10**k for k in range(int(round(span)) + 1)]
    for value in decade_values:
        parts.append(
            text(px(value), bottom + 14, f"{value:g}", 10.5, "middle", fill=GREY)
        )
    for value in ticks(y_low, y_top, 5):
        parts.append(
            text(left - 6, py(value) + 4, f"{value:g}", 10.5, "end", fill=GREY)
        )
        parts.append(line(left - 3, py(value), left, py(value), INK, 1))
    biggest = max(i["size"] for i in items)
    drawn = []
    for item in sorted(items, key=lambda i: -i["size"]):
        radius = (
            max(6.0, 34 * math.sqrt(item["size"] / biggest)) if biggest > 0 else 14.0
        )
        x, y = px(item["share"]), py(item["growth"])
        parts.append(circle(x, y, radius, accent, "#ffffff", 1.4, fill_opacity=0.85))
        placer.block(x - radius, y - radius, x + radius, y + radius)
        drawn.append((item, x, y, radius))
    for item, x, y, radius in drawn:
        if width_of(item["name"], 11) + 6 < radius * 1.8:
            parts.append(text(x, y + 4, item["name"], 11, "middle", "bold", "#ffffff"))
        else:
            parts.append(placer.put(x, y, radius, item["name"], 11, "bold"))
    if bubble:
        parts.append(
            text(
                right,
                bottom + 34,
                f"Bubble area: {bubble}",
                10.5,
                "end",
                fill=GREY,
                font_style="italic",
            )
        )
    return canvas(bottom + 44, parts)


def draw_stakeholders(items, accent):
    left, top, right, bottom = 50.0, 14.0, 508.0, 360.0
    plot_w, plot_h = right - left, bottom - top
    deep = shade(accent, 0.3)

    def px(value):
        return left + value / 10 * plot_w

    def py(value):
        return bottom - value / 10 * plot_h

    mid_x, mid_y = px(5), py(5)
    names = [
        (left, top, 0.9, "Keep satisfied", "start", left + 8, top + 17),
        (mid_x, top, 0.78, "Manage closely", "end", right - 8, top + 17),
        (left, mid_y, 0.95, "Monitor", "start", left + 8, bottom - 8),
        (mid_x, mid_y, 0.9, "Keep informed", "end", right - 8, bottom - 8),
    ]
    parts, placer = [], Placer(left, top, right, bottom)
    for k, (x, y, amount, name, anchor, tx, ty) in enumerate(names):
        parts.append(box(x, y, plot_w / 2, plot_h / 2, tint(accent, amount)))
        parts.append(text(tx, ty, name, 12, anchor, "bold", deep))
        w = width_of(name, 12, True)
        edge = tx if anchor == "start" else tx - w
        placer.block(edge - 2, ty - 13, edge + w + 2, ty + 4)
    parts.append(line(mid_x, top, mid_x, bottom, deep, 1, "4 3"))
    parts.append(line(left, mid_y, right, mid_y, deep, 1, "4 3"))
    draw_matrix_axes(
        parts, left, top, right, bottom, "Interest", "Power", ("Low", "High"), ("", "")
    )
    for item in items:
        placer.block(
            px(item["interest"]) - 6,
            py(item["power"]) - 6,
            px(item["interest"]) + 6,
            py(item["power"]) + 6,
        )
    for item in items:
        x, y = px(item["interest"]), py(item["power"])
        parts.append(circle(x, y, 5.5, accent, "#ffffff", 1.4))
        parts.append(placer.put(x, y, 5.5, item["name"], 11))
    return canvas(bottom + 44, parts)


def draw_fishbone(cats, effect, accent):
    deep = shade(accent, 0.3)
    longest = max(len(c["items"]) for c in cats)
    reach = max(150.0, 32.0 * longest + 40)
    mid = reach + 28
    spine_end = 410.0
    per = (len(cats) + 1) // 2
    parts = [line(6, mid, spine_end, mid, INK, 3)]
    head = wrap(effect, 92, 12, True)
    parts.append(box(spine_end, mid - 44, WIDTH - spine_end, 88, accent, r=5))
    base = mid - 7 * (len(head) - 1) + 4
    parts.append(
        lines_of_text(
            spine_end + 55,
            base,
            head,
            12,
            14,
            anchor="middle",
            weight="bold",
            fill="#ffffff",
        )
    )
    for index, cat in enumerate(cats):
        sign = 1 if index % 2 == 0 else -1
        slot = index // 2
        ax = spine_end - 15 - (per - 1 - slot) * 115
        tx, ty = ax - 50, mid - sign * reach
        parts.append(line(ax, mid, tx, ty, deep, 2))
        w = width_of(cat["name"], 11.5, True) + 20
        by = ty - 24 if sign > 0 else ty
        parts.append(box(tx - w / 2, by, w, 24, tint(accent, 0.85), accent, 1.2, 4))
        parts.append(text(tx, by + 16, cat["name"], 11.5, "middle", "bold", deep))
        count = len(cat["items"])
        for j, item in enumerate(cat["items"]):
            t = (j + 1) / (count + 1)
            px, py = ax - 50 * t, mid - sign * reach * t
            parts.append(line(px - 10, py, px, py, deep, 1))
            chunk = wrap(item, 96, 10.5)[:2]
            parts.append(
                lines_of_text(
                    px - 13,
                    py + 4 - 6 * (len(chunk) - 1),
                    chunk,
                    10.5,
                    12,
                    anchor="end",
                )
            )
    return canvas(2 * mid, parts)


class Kit:
    DIRS = {
        "gantt",
        "gantt-chart",
        "pestle",
        "pestel",
        "steep",
        "porter",
        "five-forces",
        "bcg",
        "boston",
        "ansoff",
        "stakeholder",
        "stakeholders",
        "fishbone",
        "ishikawa",
        "cause-effect",
        "mendelow",
    }

    def dir_gantt(self, args, body, line):
        opts, rest = read(self, body, line, GANTT_KEYS)
        names = [p.strip() for p in (opts.get("periods") or "").split(",") if p.strip()]
        labels = {name.lower(): k + 1 for k, name in enumerate(names)}
        rows = gantt_rows(rest, labels, self.report)
        real = [r for r in rows if r["kind"] != "section"]
        if not real:
            self.report.error(line.where, "gantt needs tasks such as 'Design: 2-4'")
            return
        count = max(len(names), max(r["end"] for r in real))
        unit = opts.get("unit") or ("" if names else "Week")
        show(
            self,
            opts,
            line,
            draw_gantt(rows, count, names, unit, accent_of(self)),
            GANTT_KEYS,
        )

    dir_gantt_chart = dir_gantt

    def dir_pestle(self, args, body, line):
        factor_block(self, body, line, PESTLE_ORDER, "PESTLE")

    dir_pestel = dir_pestle

    def dir_steep(self, args, body, line):
        factor_block(self, body, line, STEEP_ORDER, "STEEP")

    def dir_porter(self, args, body, line):
        opts, rest = read(self, body, line, FRAME_KEYS)
        found = {}
        for entry in groups(rest, self.report):
            canon = pick(entry["name"], FORCES, self.report, entry["ln"].where)
            if canon:
                found.setdefault(canon, []).extend(entry["items"])
        if not found:
            self.report.error(
                line.where, "porter needs lines such as 'Rivalry: Tesco; Aldi'"
            )
            return
        show(self, opts, line, draw_porter(found, accent_of(self)), FRAME_KEYS)

    dir_five_forces = dir_porter

    def dir_ansoff(self, args, body, line):
        opts, rest = read(self, body, line, FRAME_KEYS)
        found = {}
        for entry in groups(rest, self.report):
            canon = pick(entry["name"], ANSOFF, self.report, entry["ln"].where)
            if canon:
                found.setdefault(canon, []).extend(entry["items"])
        if not found:
            self.report.error(
                line.where, "ansoff needs lines such as 'Penetration: loyalty card'"
            )
            return
        show(self, opts, line, draw_ansoff(found, accent_of(self)), FRAME_KEYS)

    def dir_bcg(self, args, body, line):
        opts, rest = read(self, body, line, BCG_KEYS)
        items = []
        for ln, name, content in named_lines(rest, self.report):
            data = metrics(
                content, ["share", "growth", "size"], BCG_FIELDS, self.report, ln.where
            )
            if "share" not in data or "growth" not in data:
                self.report.error(
                    ln.where,
                    f"'{name}' needs a share and a growth (write '{name}: share 1.5, growth 12, size 40')",
                )
                continue
            if data["share"] <= 0:
                self.report.error(ln.where, f"'{name}' needs a share above 0")
                continue
            items.append({"name": name, **data, "size": data.get("size", 1.0)})
        if not items:
            self.report.error(
                line.where,
                "bcg needs lines such as 'Latte: share 1.5, growth 12, size 40'",
            )
            return
        share_line = opts.number("share-line", 1.0)
        growth_line = opts.number("growth-line", 10.0)
        markup = draw_bcg(
            items, accent_of(self), share_line, growth_line, opts.get("bubble")
        )
        show(self, opts, line, markup, BCG_KEYS)

    dir_boston = dir_bcg

    def dir_stakeholder(self, args, body, line):
        opts, rest = read(self, body, line, FRAME_KEYS)
        items = []
        for ln, name, content in named_lines(rest, self.report):
            data = metrics(
                content, ["power", "interest"], STAKE_FIELDS, self.report, ln.where
            )
            if len(data) != 2:
                self.report.error(
                    ln.where,
                    f"'{name}' needs power and interest (write '{name}: power 8, interest 3')",
                )
                continue
            if not all(0 <= v <= 10 for v in data.values()):
                self.report.error(
                    ln.where, f"scores for '{name}' must be between 0 and 10"
                )
                continue
            items.append({"name": name, **data})
        if not items:
            self.report.error(
                line.where,
                "stakeholder needs lines such as 'Owners: power 9, interest 8'",
            )
            return
        show(self, opts, line, draw_stakeholders(items, accent_of(self)), FRAME_KEYS)

    dir_stakeholders = dir_stakeholder
    dir_mendelow = dir_stakeholder

    def dir_fishbone(self, args, body, line):
        opts, rest = read(self, body, line, FISH_KEYS)
        effect = opts.get("effect") or opts.get("problem") or opts.get("title")
        if not effect:
            self.report.error(
                line.where, "fishbone needs 'effect: ...' (the problem at the head)"
            )
            return
        cats = [
            {"name": entry["name"], "items": entry["items"]}
            for entry in groups(rest, self.report)
        ]
        if not 1 <= len(cats) <= 6:
            self.report.error(
                line.where,
                "fishbone needs 1 to 6 categories such as 'People: low morale; turnover'",
            )
            return
        show(self, opts, line, draw_fishbone(cats, effect, accent_of(self)), FISH_KEYS)

    dir_ishikawa = dir_fishbone
    dir_cause_effect = dir_fishbone
