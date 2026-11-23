import ast
import math
import re
from fractions import Fraction
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
    nice_ticks,
    number,
    numbers,
    pick,
    shown,
    split_items,
    text_width,
    uid,
)

NEITHER = {
    "neither",
    "none",
    "outside",
    "nothing",
    "elsewhere",
    "no set",
    "not in any set",
    "rest",
    "other",
}
JOIN = re.compile(r"\s+and\s+|\s*[∩&]\s*|\s+n\s+", re.I)
SHADE_SPLIT = re.compile(
    r"(\band\b|\bor\b|\bnot\b|\bonly\b|\bminus\b|\bexcept\b|[()∩∪'])"
)
VENN_KEYS = FIGURE_KEYS | {"sets", "labels", "shade", "universe", "universal", "box"}


def venn_parts(key):
    key = re.sub(r"\s+(?:only|just)$|^(?:only|just)\s+", "", key.strip(), flags=re.I)
    return [part.strip() for part in JOIN.split(key) if part.strip()]


def venn_names(opts, found):
    given = pick(opts, "sets", "labels")
    if given:
        names = split_items(given)
    else:
        names = []
        for _, key, _ in found:
            if key.lower() in NEITHER:
                continue
            for part in venn_parts(key):
                if part.lower() not in [name.lower() for name in names]:
                    names.append(part)
    for letter in "AB":
        if len(names) < 2 and letter not in names:
            names.append(letter)
    return names


def set_index(token, names):
    lowered = [name.lower() for name in names]
    if token.lower() in lowered:
        return lowered.index(token.lower())
    if len(token) == 1 and 0 <= "abc".find(token.lower()) < len(names):
        return "abc".find(token.lower())
    return None


def venn_mask(key, names, ln, report):
    if key.lower() in NEITHER:
        return 0
    mask = 0
    for part in venn_parts(key):
        index = set_index(part, names)
        if index is None:
            report.error(
                ln.where,
                f"'{part}' is not one of the sets ({', '.join(names)}); "
                "list them with 'sets: Cats, Dogs'",
            )
            return None
        mask |= 1 << index
    return mask


def shade_set(text, names):
    universe = set(range(1 << len(names)))
    tokens = [item.strip() for item in SHADE_SPLIT.split(text.lower()) if item.strip()]
    place = [0]

    def peek():
        return tokens[place[0]] if place[0] < len(tokens) else None

    def take():
        place[0] += 1
        return tokens[place[0] - 1]

    def union():
        result = meet()
        while peek() in {"or", "∪"}:
            take()
            result = result | meet()
        return result

    def meet():
        result = factor()
        while peek() in {"and", "∩", "minus", "except"}:
            word = take()
            right = factor()
            result = result - right if word in {"minus", "except"} else result & right
        return result

    def factor():
        token = peek()
        if token is None:
            raise ValueError("the shade ends too early")
        take()
        if token == "not":
            return universe - factor()
        if token == "(":
            result = union()
            if peek() != ")":
                raise ValueError("a bracket is not closed")
            take()
        elif token in NEITHER:
            result = {0}
        else:
            index = set_index(token, names)
            if index is None:
                raise ValueError(f"'{token}' is not one of the sets")
            result = {mask for mask in universe if mask >> index & 1}
            if peek() == "only":
                take()
                result = {1 << index}
        while peek() == "'":
            take()
            result = universe - result
        return result

    result = union()
    if place[0] != len(tokens):
        raise ValueError(f"unexpected '{tokens[place[0]]}'")
    return result


def venn_spot(mask, centers, radius, box):
    left, top, right, bottom = box
    best, spot = -1e9, (left, top)
    for gx in range(int(left) + 4, int(right), 3):
        for gy in range(int(top) + 4, int(bottom), 3):
            score = min(gx - left, right - gx, gy - top, bottom - gy)
            for index, (cx, cy) in enumerate(centers):
                gap = math.hypot(gx - cx, gy - cy)
                score = min(score, radius - gap if mask >> index & 1 else gap - radius)
            if score > best:
                best, spot = score, (gx, gy)
    return spot, best


def wrap_items(text, width):
    items = [item.strip() for item in text.split(",") if item.strip()]
    if len(items) < 2:
        return [text]
    rows, current = [], ""
    for item in items:
        trial = f"{current}, {item}" if current else item
        if current and len(trial) * 6.2 > width:
            rows.append(current + ",")
            current = item
        else:
            current = trial
    rows.append(current)
    return rows


def venn_shading(canvas, masks, centers, radius, box):
    left, top, right, bottom = box
    names = [uid("vc") for _ in centers]
    for name, (cx, cy) in zip(names, centers):
        shape = f'<circle cx="{fmt(cx)}" cy="{fmt(cy)}" r="{fmt(radius)}"/>'
        canvas.add(f'<clipPath id="{name}">{shape}</clipPath>')
    frame = f'x="{fmt(left)}" y="{fmt(top)}" width="{fmt(right - left)}"'
    frame += f' height="{fmt(bottom - top)}"'
    for mask in sorted(masks):
        inside = [i for i in range(len(centers)) if mask >> i & 1]
        outside = [i for i in range(len(centers)) if not mask >> i & 1]
        cover = ""
        if outside:
            hole = uid("vm")
            holes = "".join(
                f'<circle cx="{fmt(centers[i][0])}" cy="{fmt(centers[i][1])}" '
                f'r="{fmt(radius)}" fill="#000"/>'
                for i in outside
            )
            canvas.add(
                f'<mask id="{hole}" maskUnits="userSpaceOnUse" {frame}>'
                f'<rect {frame} fill="#fff"/>{holes}</mask>'
            )
            cover = f'mask="url(#{hole})"'
        canvas.add("".join(f'<g clip-path="url(#{names[i]})">' for i in inside))
        canvas.add(f'<rect {frame} fill="{canvas.accent}" fill-opacity="0.3" {cover}/>')
        canvas.add("</g>" * len(inside))


def venn_outside_label(canvas, index, count, centers, radius, name):
    cx, cy = centers[index]
    if count == 2:
        x, y, anchor = cx + (-1 if index == 0 else 1) * 30, cy - radius - 12, "middle"
    elif index == 2:
        x, y, anchor = cx + radius * 0.85, cy + radius * 0.85 + 6, "start"
    else:
        sign = -1 if index == 0 else 1
        x, y = cx + sign * radius * 0.85, cy - radius * 0.85 - 6
        anchor = "end" if index == 0 else "start"
    canvas.text(x, y, name, 12.5, anchor, weight="bold")


def venn_values(opts, found, names, report):
    values = {}
    for ln, key, value in found:
        mask = venn_mask(key, names, ln, report)
        if mask is not None:
            values[mask] = value
    return values


def venn_shades(opts, names, line, report):
    masks = set()
    for text in opts.all("shade"):
        try:
            masks |= shade_set(text, names)
        except ValueError as error:
            report.error(
                line.where,
                f"{error} in 'shade: {text}' (try 'A and B', 'A only', 'not A', 'A or B')",
            )
    return masks


def draw_venn(self, body, line):
    opts, rows = begin(self, body, line, VENN_KEYS)
    report = self.report
    found = []
    for ln in rows:
        key, colon, value = ln.text.partition(":")
        if not colon:
            report.error(
                ln.where,
                f"cannot read '{ln.text.strip()[:40]}' (write 'A only: 5' or 'A and B: 3')",
            )
        else:
            found.append((ln, key.strip(), value.strip()))
    names = venn_names(opts, found)
    if len(names) > 3:
        report.error(line.where, "venn supports two or three sets")
        return
    values = venn_values(opts, found, names, report)
    masks = venn_shades(opts, names, line, report)
    count = len(names)
    height, centers, radius = (
        (290, [(190, 160), (290, 160)], 90)
        if count == 2
        else (340, [(190, 140), (290, 140), (240, 226)], 86)
    )
    canvas = Canvas(480, height, accent_of(self))
    box = (20, 30, 460, height - 14)
    frame = (pick(opts, "universe", "universal") or "U").strip()
    drawn = frame.lower() not in {"no", "none", "off"} and opts.flag("box", True)
    opts.get("box")
    if drawn:
        canvas.rect(*box[:2], box[2] - box[0], box[3] - box[1], WHITE, INK, 1.2)
    if masks:
        venn_shading(canvas, masks, centers, radius, box)
    for cx, cy in centers:
        canvas.circle(cx, cy, radius, "none", INK, 1.4)
    if drawn:
        label = "U" if frame.lower() in {"yes", "true", "on"} else frame
        canvas.text(box[0] + 9, box[1] + 13, label, 12.5, "start", italic=True)
    for index, name in enumerate(names):
        venn_outside_label(canvas, index, count, centers, radius, name)
    for mask, value in values.items():
        (x, y), room = venn_spot(mask, centers, radius, box)
        rows_text = wrap_items(value, max(2 * room, 40))
        canvas.lines(x, y, rows_text, 12, halo=True)
    end(self, opts, line, canvas, VENN_KEYS)


TREE_KEYS = FIGURE_KEYS | {"format", "products", "working", "check"}
PROB = re.compile(r"^(?P<label>.+?)\s*(?:[:=]|\()\s*(?P<p>-?[\d./%]+)\s*\)?\s*$")


def parse_prob(text):
    text = text.strip()
    if text.endswith("%"):
        return Fraction(text[:-1]) / 100
    return Fraction(text)


def tree_nodes(rows, report):
    root = {"children": [], "label": "", "p": Fraction(1), "text": ""}
    stack = [(-1, root)]
    for ln in rows:
        raw = ln.text.expandtabs(4)
        indent = len(raw) - len(raw.lstrip())
        match = PROB.match(raw.strip())
        if not match:
            report.error(
                ln.where,
                f"cannot read '{raw.strip()[:40]}' (write 'Rain: 0.3', indent the next level)",
            )
            continue
        try:
            value = parse_prob(match.group("p"))
        except (ValueError, ZeroDivisionError):
            report.error(ln.where, f"'{match.group('p')}' is not a probability")
            continue
        if not 0 <= value <= 1:
            report.error(ln.where, f"'{match.group('p')}' must be between 0 and 1")
            continue
        while stack[-1][0] >= indent:
            stack.pop()
        node = {
            "children": [],
            "label": match.group("label").strip(),
            "p": value,
            "text": match.group("p").strip(),
            "where": ln.where,
        }
        stack[-1][1]["children"].append(node)
        stack.append((indent, node))
    return root


def check_sums(node, report):
    kids = node["children"]
    if kids:
        total = sum(kid["p"] for kid in kids)
        if total != 1:
            name = node["label"] or "the first branches"
            report.warn(
                kids[0]["where"],
                f"the probabilities under '{name}' add to {float(total):.4g}, not 1",
            )
    for kid in kids:
        check_sums(kid, report)


def leaf_paths(node, trail=()):
    for kid in node["children"]:
        path = trail + (kid,)
        if kid["children"]:
            yield from leaf_paths(kid, path)
        else:
            yield path


def format_prob(value, mode):
    if mode == "fraction":
        return str(value.numerator) + (
            f"/{value.denominator}" if value.denominator != 1 else ""
        )
    if mode == "percent":
        return fmt(float(value) * 100, 2) + "%"
    return fmt(float(value), 4)


def tree_mode(opts, root):
    given = (opts.get("format") or "").lower()
    if given in {"fraction", "decimal", "percent"}:
        return given
    texts = [node["text"] for path in leaf_paths(root) for node in path]
    if texts and all("/" in text for text in texts):
        return "fraction"
    return "percent" if any("%" in text for text in texts) else "decimal"


def place_tree(node, state, depth=0):
    node["depth"] = depth
    state["depth"] = max(state["depth"], depth)
    if not node["children"]:
        node["y"] = state["next"]
        state["next"] += 1
        return
    for kid in node["children"]:
        place_tree(kid, state, depth + 1)
    node["y"] = (node["children"][0]["y"] + node["children"][-1]["y"]) / 2


def tree_nodes_flat(node):
    for kid in node["children"]:
        yield kid
        yield from tree_nodes_flat(kid)


def draw_probtree(self, body, line):
    opts, rows = begin(self, body, line, TREE_KEYS)
    root = tree_nodes(rows, self.report)
    if not root["children"]:
        self.report.error(line.where, "probtree is empty (write 'Rain: 0.3' lines)")
        return
    if opts.flag("check", True):
        check_sums(root, self.report)
    mode = tree_mode(opts, root)
    state = {"next": 0, "depth": 0}
    place_tree(root, state)
    depth, count = state["depth"], state["next"]
    products = opts.flag("products", True)
    working = opts.flag("working", False)
    widths = [0.0] * (depth + 1)
    for node in tree_nodes_flat(root):
        widths[node["depth"]] = max(
            widths[node["depth"]], text_width(node["label"]) + 8
        )
    results = []
    for path in leaf_paths(root):
        value = reduce(lambda a, b: a * b, (node["p"] for node in path), Fraction(1))
        text = format_prob(value, mode)
        if working:
            steps = " × ".join(format_prob(node["p"], mode) for node in path)
            text = f"{steps} = {text}" if len(path) > 1 else text
        results.append((path[-1], text))
    out_width = max((text_width(text) for _, text in results), default=0) + 6
    branch = 112.0
    total = lambda gap: 12 + sum(widths) + gap * depth + 18 + out_width
    while branch > 54 and total(branch) > 480:
        branch -= 4
    step = 30 if count <= 4 else 26
    height = 28 + (count - 1) * step
    canvas = Canvas(max(total(branch), 260), height, accent_of(self))
    starts, ends = {}, {0: 12.0}
    for level in range(1, depth + 1):
        starts[level] = ends[level - 1] + branch
        ends[level] = starts[level] + widths[level]
    top = 14

    def y_of(node):
        return top + node["y"] * step

    canvas.dot(12, y_of(root), 3)
    leaf_end = max(ends.values()) + 18

    def draw(node):
        for kid in node["children"]:
            level = kid["depth"]
            x1 = ends[level - 1] + (2 if level > 1 else 4)
            x2 = starts[level] - 3
            y1, y2 = y_of(node), y_of(kid)
            canvas.line(x1, y1, x2, y2, INK, 1.2)
            shift = -7 if y2 < y1 else (8 if y2 > y1 else -7)
            canvas.text(
                (x1 + x2) / 2, (y1 + y2) / 2 + shift, kid["text"], 10.5, halo=True
            )
            canvas.text(starts[level], y2, kid["label"], 11.5, "start")
            draw(kid)

    draw(root)
    for leaf, text in results:
        if products:
            canvas.text(
                leaf_end, y_of(leaf), text, 11.5, "start", canvas.accent, "bold"
            )
    end(self, opts, line, canvas, TREE_KEYS)


NORMAL_KEYS = FIGURE_KEYS | {
    "mean",
    "mu",
    "sd",
    "sigma",
    "shade",
    "variable",
    "unit",
    "axis",
    "label",
    "places",
    "z",
}
BOUND = r"(-?\d+(?:\.\d+)?)"


def normal_cdf(z):
    return 0.5 * (1 + math.erf(z / math.sqrt(2)))


def normal_intervals(text):
    t = clean(text.lower()).replace("≤", "<=").replace("≥", ">=")
    match = re.search(
        rf"(?:outside|tails?|beyond)\s*{BOUND}\s*(?:and|,|to)\s*{BOUND}", t
    )
    if match:
        a, b = sorted(float(item) for item in match.groups())
        return [(-math.inf, a), (b, math.inf)]
    match = re.search(rf"{BOUND}\s*<=?\s*[a-z]\w*\s*<=?\s*{BOUND}", t)
    if match is None:
        match = re.search(rf"{BOUND}\s*(?:and|to|-|,)\s*{BOUND}", t)
    if match:
        a, b = sorted(float(item) for item in match.groups())
        return [(a, b)]
    word = r"(?:below|under|less than|lower than|at most|up to|before)\s*"
    match = re.search(rf"{word}{BOUND}|<=?\s*{BOUND}", t)
    if match:
        return [(-math.inf, float(match.group(1) or match.group(2)))]
    word = r"(?:above|over|more than|greater than|higher than|at least|after)\s*"
    match = re.search(rf"{word}{BOUND}|>=?\s*{BOUND}", t)
    if match:
        return [(float(match.group(1) or match.group(2)), math.inf)]
    return None


def interval_statement(intervals, variable):
    v = variable
    if len(intervals) == 2:
        return (
            f"P({v} < {shown(intervals[0][1], 3)} or {v} > {shown(intervals[1][0], 3)})"
        )
    lo, hi = intervals[0]
    if lo == -math.inf:
        return f"P({v} < {shown(hi, 3)})"
    if hi == math.inf:
        return f"P({v} > {shown(lo, 3)})"
    return f"P({shown(lo, 3)} < {v} < {shown(hi, 3)})"


def area_label(canvas, plane, curve, interval, text, mean, sd):
    lo, hi = max(interval[0], plane.x0), min(interval[1], plane.x1)
    if lo <= mean <= hi and hi - lo > 1.2 * sd:
        spot = plane.py(curve(mean) * 0.42)
        canvas.text(plane.px(mean), spot, text, 12, weight="bold", halo=True)
        return
    if interval[0] == -math.inf:
        mid = hi - 0.5 * sd
    elif interval[1] == math.inf:
        mid = lo + 0.5 * sd
    else:
        mid = (lo + hi) / 2
    mid = min(max(mid, plane.x0), plane.x1)
    half = text_width(text, 12) / 2
    x = min(max(plane.px(mid), 34 + half), 466 - half)
    y = plane.py(0) - 46
    canvas.line(
        plane.px(mid), y + 8, plane.px(mid), plane.py(curve(mid) / 2), canvas.accent, 1
    )
    canvas.text(x, y, text, 12, weight="bold", halo=True)


def draw_normal(self, body, line):
    opts, rows = begin(self, body, line, NORMAL_KEYS)
    report = self.report
    mean = number(pick(opts, "mean", "mu", default="0"))
    sd = number(pick(opts, "sd", "sigma", default="1"))
    if mean is None or sd is None or sd <= 0:
        report.error(line.where, "normal needs 'mean: 100' and a positive 'sd: 15'")
        return
    variable = (opts.get("variable") or "X").strip()
    places = int(opts.number("places", 3))
    groups = []
    for text in opts.all("shade"):
        found = normal_intervals(text)
        if found is None:
            report.error(
                line.where,
                f"cannot read 'shade: {text}' (try '85 to 115', 'below 85', 'above 130', "
                "'outside 70 and 130')",
            )
        else:
            groups.append(found)
    canvas = Canvas(480, 232 if opts.flag("z", False) else 212, accent_of(self))
    low, high = mean - 4 * sd, mean + 4 * sd
    peak = 1 / (sd * math.sqrt(2 * math.pi))
    plane = Plane(canvas, (30, 28, 450, 166), (low, high), (0, peak * 1.08))

    def curve(x):
        return peak * math.exp(-0.5 * ((x - mean) / sd) ** 2)

    def sweep(lo, hi, count=60):
        lo, hi = max(lo, low), min(hi, high)
        return [lo + (hi - lo) * i / count for i in range(count + 1)]

    area_labels = []
    for intervals in groups:
        for lo, hi in intervals:
            xs = sweep(lo, hi)
            points = [(plane.px(x), plane.py(curve(x))) for x in xs]
            data = f"M{fmt(points[0][0])},{fmt(plane.py(0))} " + " ".join(
                f"L{fmt(x)},{fmt(y)}" for x, y in points
            )
            data += f" L{fmt(points[-1][0])},{fmt(plane.py(0))} Z"
            canvas.path(data, canvas.accent, "none", 0, opacity=0.32)
        area = sum(
            normal_cdf((hi - mean) / sd) - normal_cdf((lo - mean) / sd)
            for lo, hi in intervals
        )
        area_labels.append((intervals, area))
    for intervals, area in area_labels:
        for lo, hi in intervals:
            for bound in (lo, hi):
                if low < bound < high:
                    canvas.line(
                        plane.px(bound),
                        plane.py(0),
                        plane.px(bound),
                        plane.py(curve(bound)),
                        canvas.accent,
                        1.4,
                    )
    steps = [low + (high - low) * i / 240 for i in range(241)]
    data = "M" + " L".join(
        f"{fmt(plane.px(x))},{fmt(plane.py(curve(x)))}" for x in steps
    )
    canvas.path(data, "none", INK, 1.8)
    base = plane.py(0)
    canvas.line(plane.px(low) - 6, base, plane.px(high) + 6, base, INK, 1.2)
    canvas.line(plane.px(mean), base, plane.px(mean), plane.py(peak), GREY, 1, "4 3")
    ticks = [mean + k * sd for k in range(-3, 4)]
    for k, value in zip(range(-3, 4), ticks):
        x = plane.px(value)
        canvas.line(x, base - 3, x, base + 3, INK, 1)
        weight = "bold" if k == 0 else None
        canvas.text(x, base + 13, shown(value, 3), 10.5, weight=weight)
        if opts.flag("z", False):
            canvas.text(x, base + 27, shown(k), 9.5, fill=GREY)
    if opts.flag("z", False):
        canvas.text(plane.px(low) - 6, base + 27, "z", 9.5, "end", GREY, italic=True)
    offset = 40 if opts.flag("z", False) else 27
    for intervals, _ in area_labels:
        for lo, hi in intervals:
            for bound in (lo, hi):
                gap = min(abs(bound - tick) for tick in ticks) * (
                    plane.px(1) - plane.px(0)
                )
                if low < bound < high and gap > 14:
                    canvas.text(
                        plane.px(bound),
                        base + offset,
                        shown(bound, 3),
                        10.5,
                        fill=canvas.accent,
                        weight="bold",
                    )
    mode = (opts.get("label") or "area").lower()
    if mode not in {"no", "none", "off"}:
        for intervals, area in area_labels:
            for lo, hi in intervals:
                share = normal_cdf((hi - mean) / sd) - normal_cdf((lo - mean) / sd)
                area_label(canvas, plane, curve, (lo, hi), fmt(share, places), mean, sd)
            if mode == "full":
                statement = (
                    f"{interval_statement(intervals, variable)} = {fmt(area, places)}"
                )
                canvas.text(plane.px(high), 14, statement, 11, "end", weight="bold")
    canvas.text(
        34, 14, f"μ = {shown(mean, 3)},  σ = {shown(sd, 3)}", 10.5, "start", GREY
    )
    caption = pick(opts, "unit", "axis")
    if caption:
        canvas.text(plane.px(high), base + 27, caption, 10.5, "end", italic=True)
    end(self, opts, line, canvas, NORMAL_KEYS)


BOX_KEYS = FIGURE_KEYS | {
    "axis",
    "label",
    "unit",
    "orientation",
    "outliers",
    "values",
    "axis-min",
    "axis-max",
}
FIVE = re.compile(
    r"(minimum|min|lower quartile|q1|median|q2|upper quartile|q3|maximum|max|outliers?)"
    r"\s*[=:]?\s*",
    re.I,
)
CANON = {
    "minimum": "min",
    "min": "min",
    "lower quartile": "q1",
    "q1": "q1",
    "median": "median",
    "q2": "median",
    "upper quartile": "q3",
    "q3": "q3",
    "maximum": "max",
    "max": "max",
}
ORDER = ("min", "q1", "median", "q3", "max")


def median(data):
    mid = len(data) // 2
    return data[mid] if len(data) % 2 else (data[mid - 1] + data[mid]) / 2


def five_numbers(values):
    data = sorted(values)
    lower, upper = data[: len(data) // 2], data[(len(data) + 1) // 2 :]
    return [
        data[0],
        median(lower or data),
        median(data),
        median(upper or data),
        data[-1],
    ]


def box_record(ln, text, outliers_on, report):
    found = list(FIVE.finditer(text))
    if found:
        record = {}
        for index, match in enumerate(found):
            stop = found[index + 1].start() if index + 1 < len(found) else len(text)
            chunk = text[match.end() : stop]
            key = match.group(1).lower()
            if key.startswith("outlier"):
                record["out"] = numbers(chunk)
            elif number(chunk) is None:
                report.error(ln.where, f"'{key}' needs a number")
                return None
            else:
                record[CANON[key]] = number(chunk)
        missing = [key for key in ORDER if key not in record]
        if missing:
            report.error(ln.where, f"the summary is missing {', '.join(missing)}")
            return None
    elif text.lower().lstrip().startswith("summary"):
        values = numbers(text.split(None, 1)[1] if " " in text.strip() else "")
        if len(values) != 5:
            report.error(
                ln.where, "summary needs five numbers: min, Q1, median, Q3, max"
            )
            return None
        record = dict(zip(ORDER, values))
    else:
        values = numbers(text)
        if len(values) < 2:
            report.error(ln.where, "a box plot needs at least two data values")
            return None
        low, q1, mid, q3, high = five_numbers(values)
        record = dict(zip(ORDER, (low, q1, mid, q3, high)))
        record["out"] = []
        if outliers_on:
            fence = 1.5 * (q3 - q1)
            inside = [v for v in values if q1 - fence <= v <= q3 + fence]
            record["out"] = sorted(v for v in values if v not in inside)
            record["min"], record["max"] = min(inside), max(inside)
    record.setdefault("out", [])
    values = [record[key] for key in ORDER]
    if values != sorted(values):
        report.error(ln.where, "the five numbers must rise: min, Q1, median, Q3, max")
        return None
    return record


def box_groups(rows, outliers_on, report):
    groups = []
    for ln in rows:
        name, colon, text = ln.text.partition(":")
        if not colon or number(name) is not None and not re.search("[A-Za-z]", name):
            name, text = "", ln.text
        record = box_record(ln, text, outliers_on, report)
        if record is not None:
            record["name"] = name.strip()
            groups.append(record)
    return groups


def draw_boxplot(self, body, line):
    opts, rows = begin(self, body, line, BOX_KEYS)
    groups = box_groups(rows, opts.flag("outliers", True), self.report)
    if not groups:
        self.report.error(
            line.where, "boxplot needs data such as 'Class A: 4, 7, 9, 12'"
        )
        return
    horizontal = (opts.get("orientation") or "horizontal").lower() in {
        "horizontal",
        "h",
    }
    shown_values = opts.flag("values", False)
    caption = pick(opts, "axis", "label", "unit", default="")
    every = [v for g in groups for v in [*(g[k] for k in ORDER), *g["out"]]]
    low, high = min(every), max(every)
    span = (high - low) or 1
    step = nice_ticks(low, high, 7)
    step = step[1] - step[0] if len(step) > 1 else span / 5
    axis_low = opts.number("axis-min")
    axis_high = opts.number("axis-max")
    if axis_low is None:
        axis_low = math.floor((low - 0.04 * span) / step) * step
    if axis_high is None:
        axis_high = math.ceil((high + 0.04 * span) / step) * step
    ticks = [
        t for t in nice_ticks(axis_low, axis_high, 8) if axis_low <= t <= axis_high
    ]
    count = len(groups)
    named = any(g["name"] for g in groups)
    if horizontal:
        label_width = max((text_width(g["name"], 11.5) for g in groups), default=0) + 14
        left, right = 24 + (label_width if named else 0), 456
        top, pitch = 16, 46
        axis = top + count * pitch + 2
        canvas = Canvas(480, axis + (42 if caption else 26), accent_of(self))
    else:
        left, right = 58, 458
        top, pitch = 16, (right - left) / count
        axis = top + 230
        canvas = Canvas(480, axis + (52 if named else 34), accent_of(self))

    def along(value):
        if horizontal:
            return left + (value - axis_low) / (axis_high - axis_low) * (right - left)
        return axis - (value - axis_low) / (axis_high - axis_low) * (axis - top)

    def centre(index):
        return (
            top + (index + 0.5) * pitch if horizontal else left + (index + 0.5) * pitch
        )

    def at(value, index, offset):
        if horizontal:
            return along(value), centre(index) + offset
        return centre(index) + offset, along(value)

    def stroke(a, b, width=1.4, color=INK):
        canvas.line(*a, *b, color, width)

    if horizontal:
        canvas.line(left - 4, axis, right + 4, axis, INK, 1.2)
        for tick in ticks:
            x = along(tick)
            canvas.line(x, axis, x, axis + 4, INK, 1)
            canvas.text(x, axis + 14, shown(tick), 10.5)
        canvas.text((left + right) / 2, axis + 32, caption, 11, italic=True)
    else:
        canvas.line(left - 6, top - 4, left - 6, axis + 4, INK, 1.2)
        for tick in ticks:
            y = along(tick)
            canvas.line(left - 10, y, left - 6, y, INK, 1)
            canvas.text(left - 14, y, shown(tick), 10.5, "end")
        if caption:
            canvas.text(12, (top + axis) / 2, caption, 11, italic=True, angle=-90)
    half = 12 if horizontal else min(22, pitch * 0.28)
    for index, group in enumerate(groups):
        low_v, q1, mid, q3, high_v = (group[k] for k in ORDER)
        corners = [at(q1, index, -half), at(q3, index, -half), at(q3, index, half)]
        corners.append(at(q1, index, half))
        canvas.polygon(corners, canvas.tint, INK, 1.4)
        stroke(at(mid, index, -half), at(mid, index, half), 2.6)
        stroke(at(low_v, index, 0), at(q1, index, 0))
        stroke(at(q3, index, 0), at(high_v, index, 0))
        for value in (low_v, high_v):
            stroke(at(value, index, -half / 2), at(value, index, half / 2))
        for value in group["out"]:
            x, y = at(value, index, 0)
            canvas.circle(x, y, 3.2, WHITE, INK, 1.2)
        if shown_values:
            for key in ORDER:
                x, y = at(group[key], index, -half - 8 if horizontal else 0)
                if horizontal:
                    canvas.text(x, y, shown(group[key]), 9.5, halo=True)
                else:
                    canvas.text(
                        x + half + 6, y, shown(group[key]), 9.5, "start", halo=True
                    )
        if group["name"]:
            if horizontal:
                canvas.text(left - 10, centre(index), group["name"], 11.5, "end")
            else:
                canvas.text(centre(index), axis + 18, group["name"], 11.5)
    end(self, opts, line, canvas, BOX_KEYS)


STEM_KEYS = FIGURE_KEYS | {"unit", "key", "split", "leaf"}


def stem_groups(rows, report):
    groups = []
    for ln in rows:
        name, colon, text = ln.text.partition(":")
        if colon and re.search("[A-Za-z]", name):
            groups.append({"name": name.strip(), "text": text, "line": ln})
        elif groups:
            groups[-1]["text"] += " " + ln.text
        else:
            groups.append({"name": "", "text": ln.text, "line": ln})
    for group in groups:
        group["values"] = numbers(group["text"])
        if any(value < 0 for value in group["values"]):
            report.error(group["line"].where, "stemleaf needs values of zero or more")
    return [group for group in groups if group["values"]]


def stem_rows(values, leaf, split):
    units = [round(value / leaf) for value in values]
    rows = []
    for stem in range(min(units) // 10, max(units) // 10 + 1):
        rows.extend([(stem, 0), (stem, 1)] if split else [(stem, 0)])
    return rows


def stem_leaves(values, leaf, rows, split):
    units = [round(value / leaf) for value in values]
    out = []
    for stem, half in rows:
        digits = sorted(u % 10 for u in units if u // 10 == stem)
        if split:
            digits = [d for d in digits if (d >= 5) == bool(half)]
        out.append(digits)
    return out


def stem_key(rows, leaves, leaf, decimals, unit, double):
    both = [i for i, pair in enumerate(zip(*leaves)) if all(pair)]
    any_row = [i for i, pair in enumerate(zip(*leaves)) if any(pair)]
    index = (both or any_row or [0])[0]
    stem = rows[index][0]
    suffix = f" {unit}" if unit else ""
    parts = []
    for side, digits in enumerate(leaves):
        if digits[index]:
            value = fmt((stem * 10 + digits[index][0]) * leaf, decimals)
            parts.append((digits[index][0], f"{value}{suffix}", side))
    if not double:
        digit, value, _ = parts[0]
        return f"Key: {stem} | {digit} means {value}"
    if len(parts) == 2:
        (left, a, _), (right, b, _) = parts
        return f"Key: {left} | {stem} | {right} means {a} (left), {b} (right)"
    digit, value, side = parts[0]
    text = f"{digit} | {stem}" if side == 0 else f"{stem} | {digit}"
    return f"Key: {text} means {value}"


def draw_stemleaf(self, body, line):
    opts, rows_in = begin(self, body, line, STEM_KEYS)
    groups = stem_groups(rows_in, self.report)
    if not groups or len(groups) > 2:
        self.report.error(
            line.where, "stemleaf needs one list of numbers, or two for back-to-back"
        )
        return
    decimals = 0
    for group in groups:
        for token in re.findall(r"\d+\.(\d+)", group["text"]):
            decimals = max(decimals, len(token))
    leaf = opts.number("leaf", 10.0**-decimals)
    split = opts.flag("split", False)
    pooled = [value for group in groups for value in group["values"]]
    rows = stem_rows(pooled, leaf, split)
    leaves = [stem_leaves(group["values"], leaf, rows, split) for group in groups]
    double = len(groups) == 2
    cell, pitch = 9.0, 16.5
    widest = max(len(digits) for side in leaves for digits in side)
    stem_width = max(len(str(stem)) for stem, _ in rows) * 7.4 + 10
    side_width = max(widest * cell + 14, 48)
    named = any(group["name"] for group in groups)
    top = 30 if named else 14
    key_text = opts.get("key")
    key_on = (key_text or "").lower() not in {"no", "none", "off"}
    total = stem_width + side_width * (2 if double else 1) + 24
    width = max(total + 20, 240)
    height = top + len(rows) * pitch + (36 if key_on else 12)
    canvas = Canvas(width, height, accent_of(self))
    left = (width - total) / 2 + 12 + (side_width if double else 0)
    right = left + stem_width
    bottom = top + len(rows) * pitch - 4
    if double:
        canvas.line(left, top - 6, left, bottom, INK, 1.2)
    canvas.line(right, top - 6, right, bottom, INK, 1.2)
    previous = None
    for index, (stem, _) in enumerate(rows):
        y = top + index * pitch + pitch / 2 - 4
        if stem != previous:
            x, anchor = ((left + right) / 2, "middle") if double else (right - 8, "end")
            canvas.text(x, y, str(stem), 12, anchor)
        previous = stem
        for side, side_leaves in enumerate(leaves):
            for position, digit in enumerate(side_leaves[index]):
                if double and side == 0:
                    x = left - 9 - position * cell - cell / 2 + 2
                else:
                    x = right + 9 + position * cell + cell / 2 - 2
                canvas.text(x, y, str(digit), 12)
    if named:
        if double:
            canvas.text(
                left - side_width / 2, 12, groups[0]["name"], 11.5, weight="bold"
            )
            canvas.text(
                right + side_width / 2, 12, groups[1]["name"], 11.5, weight="bold"
            )
        else:
            canvas.text(right + 9, 12, groups[0]["name"], 11.5, "start", weight="bold")
    if key_on:
        unit = (opts.get("unit") or "").strip()
        message = key_text or stem_key(rows, leaves, leaf, decimals, unit, double)
        canvas.text(width / 2, height - 14, message, 10.5, italic=True)
    end(self, opts, line, canvas, STEM_KEYS)


TRI_KEYS = FIGURE_KEYS | {"vertices", "right", "right-angle", "scale", "labels"}
TRI_ROW = re.compile(r"^(angle\s+|∠\s*)?([A-Za-z]{1,3})\s*[=:]\s*(.+)$", re.I)
TRI_NUMERIC = re.compile(r"[-+]?\d+(?:\.\d+)?\s*(?:°|degrees?|deg)?\s*[A-Za-zμ°]{0,3}")


def triangle_entry(text, names, ln, report):
    match = TRI_ROW.match(text.strip())
    if not match:
        report.error(
            ln.where,
            f"cannot read '{text.strip()[:40]}' (write 'AB = 5 cm', 'a = 5' or 'A = 40°')",
        )
        return None
    word, key, label = match.group(1), match.group(2), match.group(3).strip()
    value = number(label) if TRI_NUMERIC.fullmatch(clean(label)) else None
    upper = [name.upper() for name in names]
    if word:
        vertex = key[1] if len(key) == 3 else key[0]
        if vertex.upper() in upper:
            return "angle", upper.index(vertex.upper()), value, label
    elif len(key) == 1 and key.upper() in upper:
        kind = "angle" if key.isupper() else "side"
        return kind, upper.index(key.upper()), value, label
    elif len(key) == 2 and all(c.upper() in upper for c in key) and key[0] != key[1]:
        opposite = 3 - upper.index(key[0].upper()) - upper.index(key[1].upper())
        return "side", opposite, value, label
    elif len(key) == 3 and key.isupper() and all(c in upper for c in key):
        return "angle", upper.index(key[1]), value, label
    report.error(
        ln.where, f"'{key}' is not a side or angle of triangle {''.join(names)}"
    )
    return None


def sine(degrees):
    return math.sin(math.radians(degrees))


def solve_triangle(sides, angles):
    s, a = dict(sides), dict(angles)
    for _ in range(8):
        if len(a) == 2:
            a[next(i for i in range(3) if i not in a)] = 180 - sum(a.values())
        if len(s) == 3 and len(a) < 3:
            for i in range(3):
                j, k = (i + 1) % 3, (i + 2) % 3
                cosine = (s[j] ** 2 + s[k] ** 2 - s[i] ** 2) / (2 * s[j] * s[k])
                a[i] = math.degrees(math.acos(max(-1, min(1, cosine))))
        for i in range(3):
            if i in s:
                continue
            j, k = (i + 1) % 3, (i + 2) % 3
            if i in a and j in s and k in s:
                cross = 2 * s[j] * s[k] * math.cos(math.radians(a[i]))
                s[i] = math.sqrt(s[j] ** 2 + s[k] ** 2 - cross)
                continue
            for m in (j, k):
                if i in a and m in a and m in s and sine(a[m]) > 1e-9:
                    s[i] = s[m] * sine(a[i]) / sine(a[m])
                    break
        for i in range(3):
            if i in a or i not in s:
                continue
            for m in range(3):
                if m != i and m in a and m in s:
                    ratio = s[i] * sine(a[m]) / s[m]
                    if abs(ratio) <= 1:
                        a[i] = math.degrees(math.asin(ratio))
                        break
    return s, a


def triangle_points(s, a, right):
    if len(s) < 3:
        if len(a) < 3:
            fill = [90, 40, 50] if right is not None else [66, 54, 60]
            order = [0, 1, 2]
            if right is not None:
                order = [right] + [i for i in range(3) if i != right]
            a = {index: fill[pos] for pos, index in enumerate(order)}
        s = {i: sine(a[i]) for i in range(3)}
    base = right if right is not None else 0
    p0, p1, p2 = base, (base + 1) % 3, (base + 2) % 3
    cosine = (s[p1] ** 2 + s[p2] ** 2 - s[p0] ** 2) / (2 * s[p1] * s[p2])
    angle = math.acos(max(-1, min(1, cosine)))
    points = {
        p0: (0.0, 0.0),
        p1: (s[p2], 0.0),
        p2: (s[p1] * math.cos(angle), s[p1] * math.sin(angle)),
    }
    return {i: (x, -y) for i, (x, y) in points.items()}


def unit_toward(origin, target):
    dx, dy = target[0] - origin[0], target[1] - origin[1]
    length = math.hypot(dx, dy) or 1
    return dx / length, dy / length


def triangle_input(opts, rows, names, report, line):
    sides, angles, labels, rights = {}, {}, {}, set()
    for ln in rows:
        entry = triangle_entry(ln.text, names, ln, report)
        if entry is None:
            continue
        kind, index, value, label = entry
        if kind == "angle" and value is not None and abs(value - 90) < 1e-9:
            rights.add(index)
        if value is not None:
            (sides if kind == "side" else angles)[index] = value
        labels[(kind, index)] = label
    upper = [name.upper() for name in names]
    for text in (pick(opts, "right", "right-angle") or "").split(","):
        if not text.strip():
            continue
        if text.strip().upper() not in upper:
            report.error(
                line.where, f"'{text.strip()}' is not a vertex of the triangle"
            )
        else:
            index = upper.index(text.strip().upper())
            rights.add(index)
            angles[index] = 90.0
    return sides, angles, labels, rights


def mark_right(canvas, point, toward_a, toward_b):
    size = 11
    a1 = (point[0] + toward_a[0] * size, point[1] + toward_a[1] * size)
    a2 = (a1[0] + toward_b[0] * size, a1[1] + toward_b[1] * size)
    a3 = (point[0] + toward_b[0] * size, point[1] + toward_b[1] * size)
    data = f"M{fmt(a1[0])},{fmt(a1[1])} L{fmt(a2[0])},{fmt(a2[1])} "
    canvas.path(data + f"L{fmt(a3[0])},{fmt(a3[1])}", width=1.2)


def mark_angle(canvas, point, toward_a, toward_b, text):
    radius = 17
    start = math.atan2(-toward_a[1], toward_a[0])
    delta = math.atan2(-toward_b[1], toward_b[0]) - start
    delta = (delta + math.pi) % (2 * math.pi) - math.pi
    canvas.arc(point[0], point[1], radius, start, start + delta, canvas.accent, 1.4)
    bx, by = toward_a[0] + toward_b[0], toward_a[1] + toward_b[1]
    norm = math.hypot(bx, by) or 1
    gap = radius + (15 if abs(delta) > 0.6 else 24)
    canvas.text(
        point[0] + bx / norm * gap, point[1] + by / norm * gap, text, 11, halo=True
    )


def draw_triangle(self, body, line):
    opts, rows = begin(self, body, line, TRI_KEYS)
    report = self.report
    names = split_items(opts.get("vertices") or "A, B, C")
    if len(names) != 3:
        report.error(line.where, "triangle needs three vertices ('vertices: A, B, C')")
        return
    sides, angles, labels, rights = triangle_input(opts, rows, names, report, line)
    s, a = solve_triangle(sides, angles)
    if len(s) == 3 and not all(
        s[i] < s[(i + 1) % 3] + s[(i + 2) % 3] for i in range(3)
    ):
        report.error(line.where, "these side lengths cannot make a triangle")
        return
    if len(a) == 3 and abs(sum(a.values()) - 180) > 0.6:
        report.error(line.where, f"the angles add to {sum(a.values()):.0f}, not 180")
        return
    if not opts.flag("scale", True):
        s, a = {}, {i: 90.0 for i in rights}
    raw = triangle_points(s, a, min(rights) if rights else None)
    xs, ys = [p[0] for p in raw.values()], [p[1] for p in raw.values()]
    box_w, box_h = (max(xs) - min(xs)) or 1, (max(ys) - min(ys)) or 1
    factor = min(260 / box_w, 150 / box_h)
    width, height = 380, box_h * factor + 84
    canvas = Canvas(width, height, accent_of(self))
    shift_x = (width - box_w * factor) / 2 - min(xs) * factor
    shift_y = 42 - min(ys) * factor
    pts = {i: (x * factor + shift_x, y * factor + shift_y) for i, (x, y) in raw.items()}
    canvas.polygon([pts[0], pts[1], pts[2]], canvas.tint, INK, 1.6)
    centre = (sum(p[0] for p in pts.values()) / 3, sum(p[1] for p in pts.values()) / 3)
    show_labels = opts.flag("labels", True)
    for index, name in enumerate(names):
        x, y = pts[index]
        ux, uy = unit_toward(centre, pts[index])
        canvas.text(x + ux * 14, y + uy * 14, name, 13.5, italic=True, weight="bold")
        j, k = (index + 1) % 3, (index + 2) % 3
        toward_j, toward_k = unit_toward(pts[index], pts[j]), unit_toward(
            pts[index], pts[k]
        )
        if index in rights:
            mark_right(canvas, pts[index], toward_j, toward_k)
        elif ("angle", index) in labels:
            text = labels[("angle", index)] if show_labels else ""
            if re.fullmatch(r"[-+]?\d+(?:\.\d+)?", text):
                text += "°"
            mark_angle(canvas, pts[index], toward_j, toward_k, text)
        if ("side", index) in labels and show_labels:
            mx, my = (pts[j][0] + pts[k][0]) / 2, (pts[j][1] + pts[k][1]) / 2
            ux, uy = unit_toward(centre, (mx, my))
            canvas.text(mx + ux * 15, my + uy * 15, labels[("side", index)], 11.5)
    end(self, opts, line, canvas, TRI_KEYS)


LINE_KEYS = FIGURE_KEYS | {"range", "step", "labels"}
OPERATORS = {"<": False, "<=": True, ">": False, ">=": True}
BOUNDARY = r"[-+]?\s*(?:\d+(?:\.\d+)?|\.\d+|inf\w*)"


def bound_value(text):
    text = text.replace(" ", "")
    if "inf" in text:
        return -math.inf if text.startswith("-") else math.inf
    return float(text)


def meet_segments(first, second):
    lo, lo_closed = first[0], first[1]
    if second[0] > lo or (second[0] == lo and not second[1]):
        lo, lo_closed = second[0], second[1] and (first[0] != second[0] or first[1])
    hi, hi_closed = first[2], first[3]
    if second[2] < hi or (second[2] == hi and not second[3]):
        hi, hi_closed = second[2], second[3] and (first[2] != second[2] or first[3])
    if lo > hi or (lo == hi and not (lo_closed and hi_closed)):
        raise ValueError("no number satisfies both parts")
    return lo, lo_closed, hi, hi_closed


def line_atom(text):
    text = text.strip()
    match = re.fullmatch(r"([\[(])\s*([^,]+?)\s*,\s*([^,]+?)\s*([\])])", text)
    if match:
        a, b = bound_value(match.group(2)), bound_value(match.group(3))
        return a, match.group(1) == "[", b, match.group(4) == "]"
    ops = r"(<=|<|>=|>)"
    var = r"[a-z]\w*"
    match = re.fullmatch(rf"({BOUNDARY})\s*{ops}\s*{var}\s*{ops}\s*({BOUNDARY})", text)
    if match:
        a, first, second, b = match.groups()
        if first.startswith("<") and second.startswith("<"):
            return bound_value(a), OPERATORS[first], bound_value(b), OPERATORS[second]
        if first.startswith(">") and second.startswith(">"):
            return bound_value(b), OPERATORS[second], bound_value(a), OPERATORS[first]
        raise ValueError("the two signs point different ways")
    match = re.fullmatch(rf"{var}\s*{ops}\s*({BOUNDARY})", text)
    if match:
        value, closed = bound_value(match.group(2)), OPERATORS[match.group(1)]
        if match.group(1).startswith("<"):
            return -math.inf, False, value, closed
        return value, closed, math.inf, False
    match = re.fullmatch(rf"({BOUNDARY})\s*{ops}\s*{var}", text)
    if match:
        value, closed = bound_value(match.group(1)), OPERATORS[match.group(2)]
        if match.group(2).startswith("<"):
            return value, closed, math.inf, False
        return -math.inf, False, value, closed
    match = re.fullmatch(rf"(?:{var}\s*=\s*)?({BOUNDARY})", text)
    if match:
        value = bound_value(match.group(1))
        return value, True, value, True
    raise ValueError(f"cannot read '{text[:40]}'")


def line_segments(text):
    t = clean(text).lower().replace("≤", "<=").replace("≥", ">=").replace("=<", "<=")
    t = t.replace("=>", ">=").replace("∞", "inf")
    if re.fullmatch(rf"(?:{BOUNDARY})(?:\s*[,;]\s*(?:{BOUNDARY}))*", t):
        return [(v, True, v, True) for v in numbers(t)]
    segments = []
    for part in re.split(r"\s+or\s+|\s*∪\s*", t):
        pieces = [line_atom(piece) for piece in re.split(r"\s+and\s+|\s*∩\s*", part)]
        merged = pieces[0]
        for other in pieces[1:]:
            merged = meet_segments(merged, other)
        segments.append(merged)
    return segments


def line_entries(rows, report):
    entries = []
    for ln in rows:
        try:
            entries.append((ln.text.strip(), line_segments(ln.text)))
        except ValueError as error:
            report.error(
                ln.where,
                f"{error} (write 'x > 2', '-3 <= x < 4', 'x < 1 or x >= 5' or '1, 3, 5')",
            )
    return entries


def line_range(opts, entries):
    given = numbers(opts.get("range") or "")
    if len(given) == 2:
        return sorted(given)
    finite = [
        v
        for _, segs in entries
        for seg in segs
        for v in (seg[0], seg[2])
        if abs(v) != math.inf
    ]
    low, high = (min(finite), max(finite)) if finite else (0.0, 0.0)
    low, high = math.floor(low) - 1, math.ceil(high) + 1
    if high - low < 6:
        middle = (low + high) / 2
        low, high = math.floor(middle - 3), math.ceil(middle + 3)
    return low, high


def draw_numberline(self, body, line):
    opts, rows = begin(self, body, line, LINE_KEYS)
    entries = line_entries(rows, self.report)
    if not entries:
        self.report.error(line.where, "numberline needs a line such as 'x > 2'")
        return
    low, high = line_range(opts, entries)
    step = opts.number("step")
    ticks = nice_ticks(low, high, 12)
    if step:
        ticks = [low + i * step for i in range(int((high - low) / step) + 1)]
    named = opts.flag("labels", len(entries) > 1)
    label_width = max((text_width(text) for text, _ in entries), default=0) + 16
    left, right, pitch = 28 + (label_width if named else 0), 452, 36
    canvas = Canvas(480, 20 + len(entries) * pitch + 26, accent_of(self))

    def at(value):
        return left + (value - low) / (high - low) * (right - left)

    for index, (text, segments) in enumerate(entries):
        y = 22 + index * pitch
        canvas.arrow(left - 8, y, right + 10, y, INK, 1.2, 6, both=True)
        for tick in ticks:
            canvas.line(at(tick), y - 3.5, at(tick), y + 3.5, INK, 1)
            if index == len(entries) - 1:
                canvas.text(at(tick), y + 15, shown(tick), 10.5)
        if named:
            canvas.text(left - 18, y, text, 11.5, "end")
        for lo, lo_closed, hi, hi_closed in segments:
            x1 = at(max(lo, low)) if lo != -math.inf else left - 8
            x2 = at(min(hi, high)) if hi != math.inf else right + 10
            if lo != hi:
                canvas.line(x1, y, x2, y, canvas.accent, 4)
            if lo == -math.inf:
                canvas.head(left - 8, y, -1, 0, 8, canvas.accent)
            if hi == math.inf:
                canvas.head(right + 10, y, 1, 0, 8, canvas.accent)
            for value, closed in ((lo, lo_closed), (hi, hi_closed)):
                if abs(value) != math.inf:
                    canvas.dot(at(value), y, 4.6, INK if closed else WHITE, INK, 1.6)
    end(self, opts, line, canvas, LINE_KEYS)


PLANE_KEYS = FIGURE_KEYS | {
    "x",
    "y",
    "range",
    "xrange",
    "yrange",
    "grid",
    "step",
    "equal",
    "xlabel",
    "ylabel",
}
FUNCTIONS = {
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "asin": math.asin,
    "acos": math.acos,
    "atan": math.atan,
    "sqrt": math.sqrt,
    "abs": abs,
    "ln": math.log,
    "log": math.log10,
    "exp": math.exp,
}
CONSTANTS = {"pi": math.pi, "e": math.e}
BINARY = {
    ast.Add: lambda a, b: a + b,
    ast.Sub: lambda a, b: a - b,
    ast.Mult: lambda a, b: a * b,
    ast.Div: lambda a, b: a / b,
    ast.Pow: lambda a, b: a**b,
    ast.Mod: lambda a, b: a % b,
}
POINT = r"\(\s*[-+]?\d*\.?\d+\s*,\s*[-+]?\d*\.?\d+\s*\)"
COORD = re.compile(r"\(\s*([-+]?\d*\.?\d+)\s*,\s*([-+]?\d*\.?\d+)\s*\)")


def prepare_expression(text):
    t = clean(text).lower().replace("^", "**").replace("×", "*").replace("÷", "/")
    t = t.replace("²", "**2").replace("³", "**3").replace("·", "*")
    for _ in range(3):
        t = re.sub(r"(\d)\s*([a-z(])", r"\1*\2", t)
        t = re.sub(r"\)\s*([a-z(\d])", r")*\1", t)
        t = re.sub(r"\b(x|pi)\s*(\(|[a-z]{2,}\(|x\b|pi\b)", r"\1*\2", t)
    return t


def check_expression(node):
    if isinstance(node, ast.Constant):
        if not isinstance(node.value, (int, float)):
            raise ValueError("only numbers are allowed")
    elif isinstance(node, ast.Name):
        if node.id != "x" and node.id not in CONSTANTS:
            raise ValueError(f"'{node.id}' is not known (use x, pi, e)")
    elif isinstance(node, ast.BinOp) and type(node.op) in BINARY:
        check_expression(node.left)
        check_expression(node.right)
    elif isinstance(node, ast.UnaryOp) and isinstance(node.op, (ast.USub, ast.UAdd)):
        check_expression(node.operand)
    elif isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
        if node.func.id not in FUNCTIONS or len(node.args) != 1 or node.keywords:
            raise ValueError(f"cannot use '{node.func.id}' here")
        check_expression(node.args[0])
    else:
        raise ValueError("cannot read this expression")


def evaluate_expression(node, x):
    if isinstance(node, ast.Constant):
        return node.value
    if isinstance(node, ast.Name):
        return x if node.id == "x" else CONSTANTS[node.id]
    if isinstance(node, ast.BinOp):
        left, right = evaluate_expression(node.left, x), evaluate_expression(
            node.right, x
        )
        return BINARY[type(node.op)](left, right)
    if isinstance(node, ast.UnaryOp):
        value = evaluate_expression(node.operand, x)
        return -value if isinstance(node.op, ast.USub) else value
    return FUNCTIONS[node.func.id](evaluate_expression(node.args[0], x))


def compile_function(text):
    try:
        tree = ast.parse(prepare_expression(text), mode="eval")
    except SyntaxError:
        raise ValueError(f"cannot read the formula '{text.strip()[:40]}'") from None
    check_expression(tree.body)

    def function(x):
        try:
            value = evaluate_expression(tree.body, x)
        except (ValueError, ZeroDivisionError, OverflowError, TypeError):
            return None
        return (
            value if isinstance(value, (int, float)) and math.isfinite(value) else None
        )

    return function


def span_option(opts, names, report, line):
    text = pick(opts, *names)
    if text is None:
        return None
    found = numbers(text)
    if len(found) != 2 or found[0] >= found[1]:
        report.error(line.where, f"'{names[0]}' needs two numbers such as '-5 to 5'")
        return None
    return found


def auto_span(values):
    if not values:
        return -5.0, 5.0
    low, high = min(values + [0]), max(values + [0])
    pad = max(1.0, (high - low) * 0.12)
    low, high = math.floor(low - pad), math.ceil(high + pad)
    if high - low < 4:
        high = low + 4
    return float(low), float(high)


def make_plane(self, opts, xs, ys, line):
    both = span_option(opts, ("range",), self.report, line)
    x_range = span_option(opts, ("x", "xrange"), self.report, line) or both
    y_range = span_option(opts, ("y", "yrange"), self.report, line) or both
    x_range = x_range or auto_span(xs)
    y_range = y_range or auto_span(ys)
    x_span, y_span = x_range[1] - x_range[0], y_range[1] - y_range[0]
    if opts.flag("equal", True):
        scale = min(380 / x_span, 300 / y_span, 64)
        width, height = scale * x_span, scale * y_span
    else:
        width, height = 380, 250
    total = max(width + 84, 300)
    left = (total - width) / 2
    canvas = Canvas(total, height + 58, accent_of(self))
    plane = Plane(canvas, (left, 28, left + width, 28 + height), x_range, y_range)
    step = opts.number("step") or tick_step(0, max(x_span, y_span), 9)
    xticks = [
        round(i * step, 10)
        for i in range(math.ceil(x_range[0] / step), int(x_range[1] // step) + 1)
    ]
    yticks = [
        round(i * step, 10)
        for i in range(math.ceil(y_range[0] / step), int(y_range[1] // step) + 1)
    ]
    plane.axes(
        (opts.get("xlabel") or "x").strip(),
        (opts.get("ylabel") or "y").strip(),
        opts.flag("grid", True),
        True,
        xticks,
        yticks,
    )
    return canvas, plane


def tick_step(low, high, target):
    ticks = nice_ticks(low, high, target)
    return ticks[1] - ticks[0] if len(ticks) > 1 else 1.0


def plot_curve(canvas, plane, function, color, dash, width=2):
    clip = plane.clip()
    span = plane.y1 - plane.y0
    count = 480
    pieces, current, previous = [], [], None
    for i in range(count + 1):
        x = plane.x0 + (plane.x1 - plane.x0) * i / count
        y = function(x)
        if y is None or abs(y) > 20 * span:
            previous = None
            if current:
                pieces.append(current)
            current = []
            continue
        if previous is not None and abs(y - previous) > 0.6 * span:
            pieces.append(current)
            current = []
        current.append((plane.px(x), plane.py(y)))
        previous = y
    if current:
        pieces.append(current)
    for piece in pieces:
        if len(piece) > 1:
            data = "M" + " L".join(f"{fmt(px)},{fmt(py)}" for px, py in piece)
            canvas.path(data, "none", color, width, dash, extra=clip)


def curve_label_spot(plane, function):
    for i in range(40, 0, -1):
        x = plane.x0 + (plane.x1 - plane.x0) * i / 40
        y = function(x)
        if y is not None and plane.y0 + 0.05 * (plane.y1 - plane.y0) < y < plane.y1:
            return x, y
    return None


def nice_equation(text):
    return re.sub(r"\s*-\s*", " − ", text.strip()).replace("*", "×")


COORD_NAME = r"\([^)]*\)|[A-Za-z]\w*"
STYLES = [(None, None), (INK, "7 4"), (INK, "2.5 3"), (None, "7 4")]


def plane_rows(rows, report):
    items, points = [], {}
    for ln in rows:
        text = ln.text.strip()
        label = None
        if re.match(r"^[^()]*=[^()]*(?:\(.*\))?[^:]*:", text) and not COORD.search(
            text.split(":")[0]
        ):
            text, _, label = text.partition(":")
            text, label = text.strip(), label.strip()
        match = re.match(
            rf"^(?:point\s+)?(?:([A-Za-z]\w*)\s*(?:=|at)?\s*)?({POINT})\s*(?::\s*(.+))?$",
            text,
        )
        if match:
            x, y = (float(v) for v in COORD.match(match.group(2)).groups())
            if match.group(1):
                points[match.group(1)] = (x, y)
            items.append(("point", (x, y), match.group(1) or "", match.group(3)))
            continue
        match = re.match(
            r"^circle\s*(?:centre|center)?\s*("
            + POINT
            + r")\s*,?\s*(?:with\s+)?(?:radius|r)\s*=?\s*(\d*\.?\d+)\s*$",
            text,
            re.I,
        )
        if match:
            x, y = (float(v) for v in COORD.match(match.group(1)).groups())
            items.append(("circle", (x, y), float(match.group(2))))
            continue
        match = re.match(
            r"^(?:polygon|shape|triangle|quadrilateral)\s+(.+)$", text, re.I
        )
        if match:
            items.append(("polygon", re.findall(COORD_NAME, match.group(1)), ln))
            continue
        match = re.match(
            rf"^(?:segment\s+|line\s+)?({COORD_NAME})\s*(?:to|--|->|—|-)\s*({COORD_NAME})$",
            text,
            re.I,
        )
        if match:
            items.append(("segment", [match.group(1), match.group(2)], ln))
            continue
        match = re.match(r"^(?:y|f\s*\(\s*x\s*\))\s*=\s*(.+)$", text, re.I)
        if match:
            items.append(("function", match.group(1), label, ln))
            continue
        match = re.match(r"^x\s*=\s*([-+]?\d*\.?\d+)$", text, re.I)
        if match:
            items.append(("vertical", float(match.group(1)), label, ln))
            continue
        report.error(
            ln.where,
            f"cannot read '{text[:40]}' (write 'A (2, 3)', 'y = 2x + 1', 'A to B' or 'polygon A, B, C')",
        )
    return items, points


def resolve_point(token, points):
    match = COORD.match(token)
    if match:
        return float(match.group(1)), float(match.group(2))
    return points.get(token)


def plane_extent(items, points):
    xs, ys = [], []
    for item in items:
        if item[0] == "point":
            xs.append(item[1][0])
            ys.append(item[1][1])
        elif item[0] == "circle":
            xs += [item[1][0] - item[2], item[1][0] + item[2]]
            ys += [item[1][1] - item[2], item[1][1] + item[2]]
        elif item[0] == "vertical":
            xs.append(item[1])
        elif item[0] in {"segment", "polygon"}:
            for token in item[1]:
                found = resolve_point(token, points)
                if found:
                    xs.append(found[0])
                    ys.append(found[1])
    return xs, ys


def draw_coordplane(self, body, line):
    opts, rows = begin(self, body, line, PLANE_KEYS | {"coords", "labels"})
    items, points = plane_rows(rows, self.report)
    if not items:
        self.report.error(
            line.where, "coordplane is empty (write 'A (2, 3)' or 'y = 2x + 1')"
        )
        return
    xs, ys = plane_extent(items, points)
    canvas, plane = make_plane(self, opts, xs, ys, line)
    show_coords = opts.flag("coords", False)
    show_labels = opts.flag("labels", True)
    accent = canvas.accent
    style_index = 0
    for item in items:
        kind = item[0]
        if kind == "polygon":
            found = [resolve_point(token, points) for token in item[1]]
            if None in found or len(found) < 3:
                self.report.error(
                    item[2].where, "a polygon needs three or more known points"
                )
                continue
            canvas.polygon(
                [(plane.px(x), plane.py(y)) for x, y in found], accent, INK, 1.6, 0.18
            )
        elif kind == "segment":
            found = [resolve_point(token, points) for token in item[1]]
            if None in found:
                names = ", ".join(sorted(points)) or "none yet"
                self.report.error(
                    item[2].where,
                    f"unknown point in '{' to '.join(item[1])}' (known: {names})",
                )
                continue
            (x1, y1), (x2, y2) = found
            canvas.line(
                plane.px(x1), plane.py(y1), plane.px(x2), plane.py(y2), INK, 1.8
            )
        elif kind == "circle":
            (cx, cy), radius = item[1], item[2]
            canvas.add(
                f'<ellipse cx="{fmt(plane.px(cx))}" cy="{fmt(plane.py(cy))}" '
                f'rx="{fmt(radius * (plane.px(1) - plane.px(0)))}" '
                f'ry="{fmt(radius * (plane.py(0) - plane.py(1)))}" fill="none" '
                f'stroke="{accent}" stroke-width="2"/>'
            )
    for item in items:
        kind = item[0]
        if kind not in {"function", "vertical"}:
            continue
        color, dash = STYLES[style_index % len(STYLES)]
        color = color or accent
        style_index += 1
        if kind == "vertical":
            x = item[1]
            canvas.line(
                plane.px(x),
                plane.py(plane.y0),
                plane.px(x),
                plane.py(plane.y1),
                color,
                2,
                dash,
            )
            text = item[2] or f"x = {shown(x)}"
            if show_labels:
                canvas.text(
                    plane.px(x) + 5,
                    plane.py(plane.y1) + 10,
                    text,
                    10.5,
                    "start",
                    halo=True,
                )
            continue
        try:
            function = compile_function(item[1])
        except ValueError as error:
            self.report.error(
                item[3].where,
                f"{error} (write things like 'y = 2x + 1', 'y = x^2 - 3')",
            )
            continue
        plot_curve(canvas, plane, function, color, dash)
        spot = curve_label_spot(plane, function)
        if spot and show_labels:
            text = item[2] or "y = " + nice_equation(item[1])
            canvas.text(
                plane.px(spot[0]) - 4,
                plane.py(spot[1]) - 10,
                text,
                10.5,
                "end",
                halo=True,
            )
    for item in items:
        if item[0] != "point":
            continue
        (x, y), name, label = item[1], item[2], item[3]
        px, py = plane.px(x), plane.py(y)
        canvas.dot(px, py, 3.6)
        text = label or name
        if show_coords or not text:
            suffix = f"({shown(x)}, {shown(y)})"
            text = f"{name} {suffix}".strip() if not label else f"{label} {suffix}"
        flip = px > plane.box[2] - 70
        canvas.text(
            px + (-7 if flip else 7),
            py - 9,
            text,
            11,
            "end" if flip else "start",
            halo=True,
        )
    end(self, opts, line, canvas, PLANE_KEYS | {"coords", "labels"})


VEC_KEYS = PLANE_KEYS | {"components"}
TERM = re.compile(r"\s*([+-])?\s*(\d+(?:\.\d+)?(?:/\d+)?)?\s*\*?\s*([A-Za-z]\w*)")


def ij_vector(text):
    if not re.fullmatch(r"[\s\d.+\-ij]+", text) or not re.search("[ij]", text):
        return None
    out = []
    for letter in "ij":
        match = re.search(rf"([-+]?\s*\d*\.?\d*)\s*{letter}\b", text)
        if not match:
            out.append(0.0)
            continue
        raw = match.group(1).replace(" ", "")
        out.append(
            float(
                {"": 1, "+": 1, "-": -1}.get(raw, raw) if raw in {"", "+", "-"} else raw
            )
        )
    return tuple(out)


def vector_terms(text):
    terms, position = [], 0
    text = text.strip()
    while position < len(text):
        match = TERM.match(text, position)
        if not match or match.end() == position:
            return None
        sign = -1.0 if match.group(1) == "-" else 1.0
        scale = 1.0
        if match.group(2):
            top, _, bottom = match.group(2).partition("/")
            scale = float(top) / float(bottom or 1)
        terms.append((sign * scale, match.group(3)))
        position = match.end()
    return terms


def vector_rows(rows, report):
    vectors, actions = {}, []
    for ln in rows:
        text = ln.text.strip()
        match = re.match(
            rf"^([A-Za-z]\w*)\s*[=:]\s*(.+?)(?:\s+from\s+({POINT}))?\s*$", text
        )
        if match:
            name, value, origin = match.groups()
            pair = COORD.fullmatch(value.strip())
            parsed = (
                (float(pair.group(1)), float(pair.group(2)))
                if pair
                else ij_vector(value)
            )
            if parsed is not None:
                start = COORD.match(origin) if origin else None
                where = (
                    (float(start.group(1)), float(start.group(2)))
                    if start
                    else (0.0, 0.0)
                )
                vectors[name] = (parsed, where)
                continue
            terms = vector_terms(value)
            if terms:
                actions.append((terms, name, ln))
                continue
        terms = vector_terms(text)
        if terms:
            actions.append((terms, None, ln))
            continue
        report.error(
            ln.where,
            f"cannot read '{text[:40]}' (write 'a = (3, 2)' then 'a + b' or '2a - b')",
        )
    return vectors, actions


def side_offset(x1, y1, x2, y2, distance):
    length = math.hypot(x2 - x1, y2 - y1) or 1
    return (y2 - y1) / length * distance, -(x2 - x1) / length * distance


def vector_name(coef, name):
    if coef == 1:
        return name
    if coef == -1:
        return f"−{name}"
    return f"{shown(coef)}{name}"


def draw_vectors(self, body, line):
    opts, rows = begin(self, body, line, VEC_KEYS)
    vectors, actions = vector_rows(rows, self.report)
    if not vectors:
        self.report.error(line.where, "vectors needs definitions such as 'a = (3, 2)'")
        return
    paths, xs, ys = [], [0.0], [0.0]
    for terms, label, ln in actions:
        unknown = [name for _, name in terms if name not in vectors]
        if unknown:
            known = ", ".join(vectors)
            self.report.error(
                ln.where, f"'{unknown[0]}' is not a vector yet (known: {known})"
            )
            continue
        x = y = 0.0
        steps = []
        for coef, name in terms:
            dx, dy = vectors[name][0]
            steps.append((coef, name, (x, y), (x + coef * dx, y + coef * dy)))
            x, y = x + coef * dx, y + coef * dy
            xs.append(x)
            ys.append(y)
        text = label or " ".join(
            (("+ " if c > 0 else "− ") if i else ("" if c > 0 else "−"))
            + vector_name(abs(c), n)
            for i, (c, n) in enumerate(terms)
        )
        paths.append((steps, text, (x, y)))
    for (dx, dy), (ox, oy) in vectors.values():
        xs += [ox, ox + dx]
        ys += [oy, oy + dy]
    canvas, plane = make_plane(self, opts, xs, ys, line)
    show = opts.flag("components", False)
    names = {name: spec for name, spec in vectors.items()}
    for name, ((dx, dy), (ox, oy)) in names.items():
        x1, y1, x2, y2 = (
            plane.px(ox),
            plane.py(oy),
            plane.px(ox + dx),
            plane.py(oy + dy),
        )
        canvas.arrow(x1, y1, x2, y2, INK, 2, 8)
        ox_, oy_ = side_offset(x1, y1, x2, y2, 11)
        text = f"{name} = ({shown(dx)}, {shown(dy)})" if show else name
        canvas.text(
            (x1 + x2) / 2 + ox_,
            (y1 + y2) / 2 + oy_,
            text,
            12.5,
            weight="bold",
            halo=True,
        )
    for steps, text, (tx, ty) in paths:
        for index, (coef, name, start, finish) in enumerate(steps):
            if len(steps) == 1 or (index == 0 and coef == 1):
                continue
            x1, y1 = plane.px(start[0]), plane.py(start[1])
            x2, y2 = plane.px(finish[0]), plane.py(finish[1])
            canvas.arrow(x1, y1, x2, y2, GREY, 1.6, 7, "5 3")
            ox_, oy_ = side_offset(x1, y1, x2, y2, 10)
            canvas.text(
                (x1 + x2) / 2 + ox_,
                (y1 + y2) / 2 + oy_,
                vector_name(coef, name),
                11.5,
                weight="bold",
                fill="#555",
                halo=True,
            )
        x2, y2 = plane.px(tx), plane.py(ty)
        canvas.arrow(plane.px(0), plane.py(0), x2, y2, canvas.accent, 2.8, 9)
        ox_, oy_ = side_offset(plane.px(0), plane.py(0), x2, y2, -12)
        label = f"{text} = ({shown(tx)}, {shown(ty)})" if show else text
        canvas.text(
            (plane.px(0) + x2) / 2 + ox_,
            (plane.py(0) + y2) / 2 + oy_,
            label,
            12.5,
            fill=canvas.accent,
            weight="bold",
            halo=True,
        )
    end(self, opts, line, canvas, VEC_KEYS)


class Kit:
    DIRS = {
        "venn",
        "probtree",
        "normal",
        "boxplot",
        "stemleaf",
        "triangle",
        "numberline",
        "coordplane",
        "vectors",
    }

    def dir_venn(self, args, body, line):
        draw_venn(self, body, line)

    def dir_probtree(self, args, body, line):
        draw_probtree(self, body, line)

    def dir_normal(self, args, body, line):
        draw_normal(self, body, line)

    def dir_boxplot(self, args, body, line):
        draw_boxplot(self, body, line)

    def dir_stemleaf(self, args, body, line):
        draw_stemleaf(self, body, line)

    def dir_triangle(self, args, body, line):
        draw_triangle(self, body, line)

    def dir_numberline(self, args, body, line):
        draw_numberline(self, body, line)

    def dir_coordplane(self, args, body, line):
        draw_coordplane(self, body, line)

    def dir_vectors(self, args, body, line):
        draw_vectors(self, body, line)
