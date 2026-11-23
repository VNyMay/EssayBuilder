import itertools
import math
import re
from collections import Counter

from ..util import Options
from . import FIGURE_KEYS
from .cs import ExpressionError, evaluate, parse_expression
from .svgcs import (
    BASE_ACCENT,
    INK,
    LINE,
    MUTE,
    PAPER,
    SOFT,
    WIDTH,
    Bad,
    arrow,
    box,
    circle,
    drawn,
    esc,
    fit,
    group,
    head,
    line,
    num,
    number_or_text,
    path,
    polygon,
    polyline,
    positions,
    rect,
    share,
    span,
    text,
    tint,
    words,
)

COMMENT = re.compile(r"^\s*(%%|//(\s|$))")
MARK = {"highlight", "mark", "marked"}


class Context:
    def __init__(self, compiler, opts, lines, line):
        self.compiler, self.opts, self.lines, self.line = compiler, opts, lines, line
        self.accent = compiler.cfg.get("accent") or BASE_ACCENT
        self.where = line.where

    def get(self, *names, default=None):
        for name in names:
            value = self.opts.get(name)
            if value is not None:
                return value
        return default

    def flag(self, *names, default=False):
        for name in names:
            if self.opts.get(name) is not None:
                return self.opts.flag(name, default)
        return default

    def number(self, *names, default=None):
        for name in names:
            if self.opts.get(name) is not None:
                return self.opts.number(name, default)
        return default

    def choice(self, names, allowed, default):
        value = (self.get(*names) or default).strip().lower().replace("_", " ")
        if value in allowed:
            return allowed[value]
        shown = ", ".join(sorted(set(allowed.values())))
        raise Bad(f"'{names[0]}' must be one of: {shown} (not '{value}')", self.where)

    def marks(self, size, base=0, names=("highlight", "mark", "marked")):
        return positions(self.get(*names), size, self.where, base)

    def table(self, rows, pairs, style="grid"):
        from ..parse import Line

        keep = {"caption", "id", "source", "width", "place", "wrap"}
        chosen = [[key, value] for key, value in self.opts.pairs if key in keep]
        chosen.extend(pairs)
        chosen.append(["style", self.get("style") or style])
        table_opts = Options(chosen, self.compiler.report, self.where)
        lines = [Line(self.line.file, self.line.no, row) for row in rows]
        self.compiler.table(table_opts, lines, self.line)


def run(compiler, body, line, keys, build):
    compiler.ensure_section(line)
    head_lines, rest = compiler.split_options(body, known=keys)
    opts = Options.parse(head_lines, compiler.report, line.where)
    lines = [ln for ln in rest if ln.text.strip() and not COMMENT.match(ln.text)]
    ctx = Context(compiler, opts, lines, line)
    try:
        result = build(ctx)
    except Bad as error:
        compiler.report.error(error.where or line.where, error.message)
        result = None
    if result is not None:
        width, inner = result
        compiler.emit_figure(opts, line, inner, "csdraw", default_width=share(width))
    opts.finish(keys)


def need(ctx, message):
    if not ctx.lines:
        raise Bad(message, ctx.where)


def items_of(ctx):
    joined = " ".join(ln.text.strip() for ln in ctx.lines)
    if "->" in joined or "→" in joined:
        parts = re.split(r"\s*(?:->|→)\s*", joined)
        return [part.strip() for part in parts if part.strip()]
    return words(joined) if "," in joined else joined.split()


def list_items(ctx):
    out = []
    for ln in ctx.lines:
        out.extend(words(ln.text) if "," in ln.text else [ln.text.strip()])
    return out


def pointer_map(spec, size, where, base=0):
    found = {}
    for part in words(spec or ""):
        match = re.fullmatch(r"(\w+)\s*[=:]\s*(-?\d+)", part.strip())
        if not match:
            raise Bad(f"cannot read the pointer '{part}' (write i=0, j=3)", where)
        index = int(match.group(2))
        if not base <= index < base + size:
            raise Bad(f"pointer {match.group(1)} is outside the list", where)
        found.setdefault(index, []).append(match.group(1))
    return found


def build_array(ctx):
    need(ctx, "array needs values, for example: 5 3 8 1 9 2")
    rows = [words(ln.text) for ln in ctx.lines]
    base = int(ctx.number("start", "from", default=0))
    name = ctx.get("name", "label", default="")
    if len(rows) > 1:
        return array_grid(ctx, rows, base, name)
    items = rows[0]
    if len(items) > 24:
        raise Bad(
            f"an array can show up to 24 values, this has {len(items)}", ctx.where
        )
    marked = ctx.marks(len(items), base)
    pointers = pointer_map(ctx.get("pointers", "pointer"), len(items), ctx.where, base)
    left = 18 + (span(name, 15) + 14 if name else 0)
    cell = min(64, (WIDTH - left - 18) / len(items))
    top, high = 16, 44
    parts = []
    if name:
        parts.append(text(14, top + high / 2, name, 15, "start", weight=700))
    for i, item in enumerate(items):
        x = left + i * cell
        parts.append(box(x, top, cell, high, item, ctx.accent, i + base in marked))
        if ctx.flag("indices", "index", default=True):
            parts.append(text(x + cell / 2, top + high + 15, i + base, 13, fill=MUTE))
    bottom = top + high + (30 if ctx.flag("indices", "index", default=True) else 8)
    for index, names in pointers.items():
        x = left + (index - base) * cell + cell / 2
        parts.append(arrow(x, bottom + 26, x, bottom + 4, ctx.accent, 1.8, 8))
        parts.append(
            text(x, bottom + 38, ", ".join(names), 14, weight=700, fill=ctx.accent)
        )
    height = bottom + (52 if pointers else 10)
    return drawn(left + len(items) * cell + 18, height, parts)


def array_grid(ctx, rows, base, name):
    cols = max(len(row) for row in rows)
    if cols > 16 or len(rows) > 12:
        raise Bad(
            "a two-dimensional array can show up to 12 rows and 16 columns", ctx.where
        )
    marked = set()
    for part in re.findall(
        r"\(?\s*(\d+)\s*,\s*(\d+)\s*\)?", ctx.get(*MARK, default="")
    ):
        r, c = int(part[0]) - base, int(part[1]) - base
        if not (0 <= r < len(rows) and 0 <= c < cols):
            raise Bad(
                f"position ({part[0]}, {part[1]}) is outside the array", ctx.where
            )
        marked.add((r, c))
    cell, high, left, top = min(58, 560 / cols), 38, 52, 34
    parts = []
    if name:
        parts.append(text(left, 12, name, 15, "start", weight=700))
    for c in range(cols):
        parts.append(
            text(left + c * cell + cell / 2, top - 10, c + base, 13, fill=MUTE)
        )
    for r, row in enumerate(rows):
        parts.append(
            text(left - 12, top + r * high + high / 2, r + base, 12, "end", fill=MUTE)
        )
        for c in range(cols):
            value = row[c] if c < len(row) else ""
            parts.append(
                box(
                    left + c * cell,
                    top + r * high,
                    cell,
                    high,
                    value,
                    ctx.accent,
                    (r, c) in marked,
                )
            )
    return drawn(left + cols * cell + 20, top + len(rows) * high + 12, parts)


def build_linkedlist(ctx):
    need(ctx, "linkedlist needs values, for example: 12 -> 7 -> 31 -> 5")
    items = items_of(ctx)
    if len(items) > 8:
        raise Bad(
            f"a linked list can show up to 8 nodes, this has {len(items)}", ctx.where
        )
    double = ctx.flag("doubly", "double", "doubly-linked")
    ring = ctx.flag("circular", "circle", "ring")
    if double and ring:
        raise Bad("choose doubly or circular, not both", ctx.where)
    marked = ctx.marks(len(items), 1 if ctx.get("start") == "1" else 0)
    show_head = ctx.flag("head", default=True)
    show_tail = ctx.flag("tail")
    left = 96 if double else 28
    data, pointer = (46, 26) if not double else (46, 26)
    node = data + pointer * (2 if double else 1)
    gap = 44 if double else 38
    pitch = node + gap
    top = 40
    high = 44 if double else 40
    middle = top + high / 2
    parts = []
    for i, item in enumerate(items):
        x = left + i * pitch
        back = pointer if double else 0
        parts.append(rect(x, top, node, high, PAPER, INK, 1.4))
        on = i in marked
        if on:
            parts.append(
                rect(x + back, top, data, high, tint(ctx.accent, 0.2), ctx.accent, 2.6)
            )
        parts.append(line(x + back, top, x + back, top + high) if back else "")
        parts.append(line(x + back + data, top, x + back + data, top + high))
        parts.append(
            text(
                x + back + data / 2,
                middle,
                item,
                fit(item, data - 6, 15),
                weight=700 if on else None,
            )
        )
        next_y = middle - 8 if double else middle
        parts.append(circle(x + back + data + pointer / 2, next_y, 3.6, INK, INK, 1))
        if double:
            parts.append(circle(x + pointer / 2, middle + 8, 3.6, INK, INK, 1))
        last = i == len(items) - 1
        sx = x + back + data + pointer / 2
        if not last:
            parts.append(arrow(sx, next_y, x + pitch, next_y, INK, 1.4, 8))
            if double:
                parts.append(
                    arrow(
                        x + pitch + pointer / 2,
                        middle + 8,
                        x + node,
                        middle + 8,
                        INK,
                        1.4,
                        8,
                    )
                )
        elif ring:
            first = left + data / 2
            parts.append(
                path(
                    f"M{num(sx)},{num(middle)} V{top + high + 24} H{num(first)} V{top + high + 3}",
                    width=1.4,
                )
            )
            parts.append(head(first, top + high + 2, -math.pi / 2, 8))
        else:
            parts.append(arrow(sx, next_y, sx + 40, next_y, INK, 1.4, 8))
            parts.append(text(sx + 44, next_y, "null", 14, "start", italic=True))
        if double and i == 0:
            parts.append(
                arrow(x + pointer / 2, middle + 8, x - 38, middle + 8, INK, 1.4, 8)
            )
            parts.append(text(x - 42, middle + 8, "null", 14, "end", italic=True))
    labelled = [(0, "head")] if show_head else []
    if show_tail:
        labelled.append((len(items) - 1, "tail"))
    for index, label in labelled:
        x = left + index * pitch + node / 2
        parts.append(text(x, 14, label, 14, weight=700, fill=ctx.accent))
        parts.append(arrow(x, 24, x, top - 2, ctx.accent, 1.8, 8))
    width = left + len(items) * pitch - gap + (62 if not ring else 24)
    return drawn(width, top + high + (36 if ring else 14), parts)


def build_stack(ctx):
    need(ctx, "stack needs items from bottom to top, for example: 4, 9, 2")
    items = list_items(ctx)
    push, pop = ctx.get("push"), ctx.flag("pop")
    capacity = int(ctx.number("capacity", "size", default=0))
    if pop and not items:
        raise Bad("cannot pop from an empty stack", ctx.where)
    slots = max(capacity, len(items) + (1 if push else 0), 1)
    cw, high, cx = 120, 38, 150
    arrows = bool(push or pop)
    top = 56 if arrows else 28
    bottom = top + slots * high
    parts = []
    parts.append(
        path(f"M{cx - 70},{top - 8} V{bottom + 8} H{cx + 70} V{top - 8}", width=2.2)
    )
    for k, item in enumerate(items):
        y = bottom - (k + 1) * high
        on = pop and k == len(items) - 1
        parts.append(box(cx - cw / 2, y, cw, high, item, ctx.accent, bool(on)))
    if push:
        y = bottom - (len(items) + 1) * high
        parts.append(
            rect(
                cx - cw / 2,
                y,
                cw,
                high,
                tint(ctx.accent, 0.08),
                ctx.accent,
                2,
                0,
                "6 4",
            )
        )
        parts.append(
            text(
                cx,
                y + high / 2,
                push,
                fit(push, cw - 8, 15),
                fill=ctx.accent,
                weight=700,
            )
        )
        parts.append(
            arrow(
                cx,
                10,
                cx,
                y - 6 if slots == len(items) + 1 else top - 10,
                ctx.accent,
                2,
                9,
            )
        )
        parts.append(text(cx - 12, 22, "push", 14, "end", weight=700, fill=ctx.accent))
    if pop:
        y = bottom - len(items) * high
        parts.append(arrow(cx, y - 2, cx, 10, ctx.accent, 2, 9))
        parts.append(
            text(
                cx + 12,
                22,
                f"pop {items[-1]}",
                14,
                "start",
                weight=700,
                fill=ctx.accent,
            )
        )
    if items and not pop:
        y = bottom - len(items) * high + high / 2
        parts.append(arrow(cx + 122, y, cx + 76, y, INK, 1.4, 8))
        parts.append(text(cx + 126, y, "top", 14, "start", weight=700))
    elif not items:
        parts.append(text(cx, bottom - high / 2, "empty", 14, fill=MUTE, italic=True))
    return drawn(330, bottom + 20, parts)


def build_queue(ctx):
    need(ctx, "queue needs items from front to rear, for example: 4, 9, 2")
    items = list_items(ctx)
    add, remove = ctx.get("enqueue", "add"), ctx.flag("dequeue", "remove")
    capacity = int(ctx.number("capacity", "size", default=0))
    if remove and not items:
        raise Bad("cannot dequeue from an empty queue", ctx.where)
    slots = max(capacity, len(items), 1)
    if slots > 10:
        raise Bad("a queue can show up to 10 items", ctx.where)
    cw, high = 58, 44
    left = 100 if remove else 56
    right = 130 if add else 70
    top = 42
    parts = [
        line(left - 8, top - 6, left + slots * cw + 8, top - 6, width=2.2),
        line(
            left - 8, top + high + 6, left + slots * cw + 8, top + high + 6, width=2.2
        ),
    ]
    for k, item in enumerate(items):
        parts.append(
            box(left + k * cw, top, cw, high, item, ctx.accent, bool(remove and k == 0))
        )
    middle = top + high / 2
    if items:
        for k, label in ((0, "front"), (len(items) - 1, "rear")):
            x = left + k * cw + cw / 2
            parts.append(arrow(x, top + high + 36, x, top + high + 12, INK, 1.4, 8))
            parts.append(text(x, top + high + 48, label, 14, weight=700))
    else:
        parts.append(
            text(left + slots * cw / 2, middle, "empty", 14, fill=MUTE, italic=True)
        )
    if remove:
        parts.append(arrow(left - 8, middle, 12, middle, ctx.accent, 2, 9))
        parts.append(text(60, top - 28, "dequeue", 14, weight=700, fill=ctx.accent))
    if add:
        x = left + slots * cw + 14
        parts.append(
            rect(x + 46, top, cw, high, tint(ctx.accent, 0.08), ctx.accent, 2, 0, "6 4")
        )
        parts.append(
            text(
                x + 46 + cw / 2,
                middle,
                add,
                fit(add, cw - 8, 15),
                fill=ctx.accent,
                weight=700,
            )
        )
        parts.append(arrow(x + 42, middle, x - 6, middle, ctx.accent, 2, 9))
        parts.append(text(x + 18, top - 28, "enqueue", 14, weight=700, fill=ctx.accent))
    return drawn(left + slots * cw + right + (30 if add else 0), top + high + 62, parts)


NULLS = {"_", "-", "null", "none", "nil", "#", "."}
ORDER_NAMES = {
    "level": "level",
    "levels": "level",
    "level order": "level",
    "array": "level",
    "insert": "insert",
    "inserts": "insert",
    "insertion": "insert",
    "bst": "insert",
}
WALKS = {
    "inorder": "In-order",
    "in order": "In-order",
    "in-order": "In-order",
    "preorder": "Pre-order",
    "pre order": "Pre-order",
    "pre-order": "Pre-order",
    "postorder": "Post-order",
    "post order": "Post-order",
    "post-order": "Post-order",
    "levelorder": "Level-order",
    "level-order": "Level-order",
    "breadth first": "Level-order",
}


def tree_from_levels(items, where):
    present = [item.lower() not in NULLS for item in items]
    if not present or not present[0]:
        raise Bad("the first value is the root and cannot be empty", where)
    kids = {}
    for i, item in enumerate(items):
        if not present[i]:
            continue
        if i and not present[(i - 1) // 2]:
            raise Bad(
                f"'{item}' (position {i + 1}) has no parent; "
                "every node needs a parent above it",
                where,
            )
        kids[i] = [
            c if c < len(items) and present[c] else None for c in (2 * i + 1, 2 * i + 2)
        ]
    return items, kids, 0


def tree_from_inserts(ctx, items):
    keys = number_or_text(items)
    kids = {0: [None, None]}
    for i in range(1, len(items)):
        node = 0
        while True:
            if keys[i] == keys[node]:
                ctx.compiler.report.warn(
                    ctx.where, f"'{items[i]}' appears twice and is shown once"
                )
                break
            side = 0 if keys[i] < keys[node] else 1
            if kids[node][side] is None:
                kids[node][side] = i
                kids[i] = [None, None]
                break
            node = kids[node][side]
    return items, kids, 0


def tree_walk(kind, kids, root, label):
    out = []
    if kind == "Level-order":
        queue = [root]
        while queue:
            node = queue.pop(0)
            out.append(label[node])
            queue.extend(child for child in kids[node] if child is not None)
        return out

    def visit(node):
        if node is None:
            return
        left, right = kids[node]
        if kind == "Pre-order":
            out.append(label[node])
        visit(left)
        if kind == "In-order":
            out.append(label[node])
        visit(right)
        if kind == "Post-order":
            out.append(label[node])

    visit(root)
    return out


def tree_layout(kids, root):
    depth, xs, order = {}, {}, []

    def walk(node, level):
        left, right = kids[node]
        if left is not None:
            walk(left, level + 1)
        xs[node] = len(order)
        order.append(node)
        depth[node] = level
        if right is not None:
            walk(right, level + 1)

    walk(root, 0)
    return depth, xs, order


def build_bintree(ctx):
    need(ctx, "bintree needs values, for example: 8 3 10 1 6 _ 14")
    items = words(" ".join(ln.text for ln in ctx.lines))
    if ctx.flag("bst", "insert", "inserts"):
        mode = "insert"
    else:
        mode = ctx.choice(("order", "from", "mode"), ORDER_NAMES, "level")
    if len(items) > 63:
        raise Bad("a tree can show up to 63 values", ctx.where)
    if mode == "insert":
        label, kids, root = tree_from_inserts(ctx, items)
    else:
        label, kids, root = tree_from_levels(items, ctx.where)
    depth, xs, order = tree_layout(kids, root)
    if len(order) > 31:
        raise Bad(f"a tree can show up to 31 nodes, this has {len(order)}", ctx.where)
    chosen = []
    for value in words(ctx.get(*MARK, "path", default="")):
        found = [n for n in order if label[n] == value]
        if not found:
            raise Bad(f"'{value}' is not a value in the tree", ctx.where)
        chosen.append(found[0])
    parent = {c: n for n, pair in kids.items() for c in pair if c is not None}
    walk_name = ctx.get("traversal", "walk")
    kind = WALKS.get((walk_name or "").lower().strip())
    if walk_name and not kind:
        raise Bad(
            "traversal must be inorder, preorder, postorder or levelorder", ctx.where
        )
    count = len(order)
    dx = min(52, (WIDTH - 40) / count)
    radius = 18 if dx >= 40 else max(12, dx * 0.45)
    dy, left = 62, 24 + radius

    def point(node):
        return left + xs[node] * dx, 28 + depth[node] * dy

    parts = []
    for node, pair in kids.items():
        for child in pair:
            if child is None:
                continue
            (x1, y1), (x2, y2) = point(node), point(child)
            lit = node in chosen and child in chosen
            lit = lit and abs(chosen.index(node) - chosen.index(child)) == 1
            colour = ctx.accent if lit else INK
            parts.append(line(x1, y1, x2, y2, colour, 3.2 if lit else 1.4))
    for node in order:
        x, y = point(node)
        on = node in chosen
        face = tint(ctx.accent, 0.2) if on else PAPER
        parts.append(
            circle(x, y, radius, face, ctx.accent if on else INK, 2.6 if on else 1.4)
        )
        size = fit(label[node], radius * 2 - 6, 15)
        parts.append(text(x, y, label[node], size, weight=700 if on else None))
    height = 28 + max(depth.values()) * dy + radius + 14
    width = max(240, 2 * left + (count - 1) * dx)
    if kind:
        shown = ", ".join(tree_walk(kind, kids, root, label))
        parts.append(text(width / 2, height + 12, f"{kind}: {shown}", 14))
        height += 30
    return drawn(width, height, parts)


EDGE = re.compile(
    r"^([\w.]+)\s*(<->|->|<-|--|-)\s*([\w.]+)"
    r"(?:\s*[:,(]\s*(-?\d+(?:\.\d+)?)\)?|\s+(-?\d+(?:\.\d+)?))?$"
)
LONE = re.compile(r"[\w.]+(?:[\s,]+[\w.]+)*")


def read_graph(ctx):
    names, edges = [], []
    force = ctx.flag("directed", "digraph")
    for ln in ctx.lines:
        raw = ln.text.strip()
        match = EDGE.match(raw)
        if match:
            a, mark, b, first, second = match.groups()
            for name in (a, b):
                if name not in names:
                    names.append(name)
            if mark == "<-":
                a, b = b, a
            heads = 2 if mark == "<->" else int(force or mark in {"->", "<-"})
            edges.append((a, b, first or second, heads))
        elif LONE.fullmatch(raw):
            names.extend(n for n in words(raw) if n not in names)
        else:
            raise Bad(
                f"cannot read this line: '{raw[:40]}' (write A - B, A -> B or A - B : 4)",
                ln.where,
            )
    return names, edges


def force_layout(count, edges, index, box_w, box_h):
    pts = [
        [math.sin(2 * math.pi * i / count), -math.cos(2 * math.pi * i / count)]
        for i in range(count)
    ]
    pairs = {(index[a], index[b]) for a, b, *_ in edges if a != b}
    k, temp = 0.8, 0.4
    for _ in range(300):
        push = [[0.0, 0.0] for _ in pts]
        for i, j in itertools.combinations(range(count), 2):
            dx, dy = pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]
            d = math.hypot(dx, dy) or 0.01
            for c, q in ((i, 1), (j, -1)):
                push[c][0] += q * dx / d * k * k / d
                push[c][1] += q * dy / d * k * k / d
        for i, j in pairs:
            dx, dy = pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]
            d = math.hypot(dx, dy) or 0.01
            for c, q in ((i, -1), (j, 1)):
                push[c][0] += q * dx / d * d * d / k
                push[c][1] += q * dy / d * d * d / k
        for c in range(count):
            d = math.hypot(*push[c]) or 0.01
            move = min(d, temp)
            pts[c][0] += push[c][0] / d * move
            pts[c][1] += push[c][1] / d * move
        temp = max(0.01, temp * 0.97)
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    sx = (box_w - 40) / ((max(xs) - min(xs)) or 1)
    sy = (box_h - 40) / ((max(ys) - min(ys)) or 1)
    return [(20 + (x - min(xs)) * sx, 20 + (y - min(ys)) * sy) for x, y in pts]


def spread(count, edges, index, box_w, box_h, layout):
    if layout == "circle" or count <= 3:
        return [
            (
                box_w / 2 + (box_w / 2 - 20) * math.sin(2 * math.pi * i / count),
                box_h / 2 - (box_h / 2 - 20) * math.cos(2 * math.pi * i / count),
            )
            for i in range(count)
        ]
    return force_layout(count, edges, index, box_w, box_h)


def unit(px, py, qx, qy):
    d = math.hypot(qx - px, qy - py) or 1
    return (qx - px) / d, (qy - py) / d


def graph_edge(a, b, spot, radius, curve, heads, color, width):
    (x1, y1), (x2, y2) = spot[a], spot[b]
    if a == b:
        top = y1 - radius
        d = (
            f"M{num(x1 - 9)},{num(top)} C{num(x1 - 34)},{num(top - 38)} "
            f"{num(x1 + 34)},{num(top - 38)} {num(x1 + 9)},{num(top - 1)}"
        )
        shape = path(d, stroke=color, width=width)
        if heads:
            shape += head(x1 + 9, top - 1, math.pi * 0.62, 9, color)
        return shape, (x1, top - 30)
    length = math.hypot(x2 - x1, y2 - y1) or 1
    cx = (x1 + x2) / 2 - (y2 - y1) / length * curve * 2
    cy = (y1 + y2) / 2 + (x2 - x1) / length * curve * 2
    ux, uy = unit(x1, y1, cx, cy)
    vx, vy = unit(x2, y2, cx, cy)
    sx, sy = x1 + ux * radius, y1 + uy * radius
    ex, ey = x2 + vx * radius, y2 + vy * radius
    size = 10
    ax, ay = (sx + ux * size * 0.8, sy + uy * size * 0.8) if heads == 2 else (sx, sy)
    bx, by = (ex + vx * size * 0.8, ey + vy * size * 0.8) if heads else (ex, ey)
    shape = path(
        f"M{num(ax)},{num(ay)} Q{num(cx)},{num(cy)} {num(bx)},{num(by)}",
        stroke=color,
        width=width,
    )
    if heads:
        shape += head(ex, ey, math.atan2(-vy, -vx), size, color)
    if heads == 2:
        shape += head(sx, sy, math.atan2(-uy, -ux), size, color)
    return shape, (0.25 * sx + 0.5 * cx + 0.25 * ex, 0.25 * sy + 0.5 * cy + 0.25 * ey)


def matrix_parts(ctx, names, edges, weighted, left, top):
    side, parts, link = 34, [], {}
    for a, b, weight, heads in edges:
        value = weight if weight is not None else "1"
        link[(a, b)] = value
        if heads != 1:
            link[(b, a)] = value
    empty = "–" if weighted else "0"
    for i, name in enumerate(names):
        parts.append(
            text(left + side * (i + 1.5), top + side / 2, name, 15, weight=700)
        )
        parts.append(
            text(left + side / 2, top + side * (i + 1.5), name, 15, weight=700)
        )
        for j, other in enumerate(names):
            value = link.get((name, other), empty)
            x, y = left + (j + 1) * side, top + (i + 1) * side
            quiet = value == empty
            parts.append(rect(x, y, side, side, SOFT if quiet else PAPER, LINE, 1))
            parts.append(
                text(x + side / 2, y + side / 2, value, 14, fill=MUTE if quiet else INK)
            )
    return (
        parts,
        left + (len(names) + 1) * side + 16,
        top + (len(names) + 1) * side + 16,
    )


def build_graph(ctx):
    need(ctx, "graph needs edges, for example: A - B : 4")
    names, edges = read_graph(ctx)
    if len(names) > 12:
        raise Bad(
            f"a graph can show up to 12 vertices, this has {len(names)}", ctx.where
        )
    index = {name: i for i, name in enumerate(names)}
    layouts = {"auto": "auto", "circle": "circle", "ring": "circle"}
    layout = ctx.choice(("layout",), layouts, "auto")
    matrix = ctx.flag("matrix", "adjacency", "adjacency-matrix")
    if matrix and len(names) > 9:
        raise Bad("an adjacency matrix can show up to 9 vertices", ctx.where)
    weighted = any(edge[2] is not None for edge in edges)
    box_w, box_h = 360, 230 + 12 * max(0, len(names) - 5)
    found = spread(len(names), edges, index, box_w, box_h, layout)
    spot = {name: (x + 30, y + 30) for name, (x, y) in zip(names, found)}
    chosen = words(ctx.get(*MARK, "path", default=""))
    for name in chosen:
        if name not in index:
            raise Bad(f"'{name}' is not a vertex of the graph", ctx.where)
    lit = {frozenset(pair) for pair in zip(chosen, chosen[1:])}
    seen, parts, labels = set(), [], []
    ordered = {(a, b) for a, b, _, heads in edges if heads == 1}
    for a, b, weight, heads in edges:
        key = (a, b) if heads == 1 else frozenset((a, b))
        if key in seen:
            continue
        seen.add(key)
        curve = 15 if heads == 1 and (b, a) in ordered and a != b else 0
        on = frozenset((a, b)) in lit
        colour = ctx.accent if on else INK
        shape, mid = graph_edge(
            a, b, spot, 19, curve, heads, colour, 3.2 if on else 1.5
        )
        parts.append(shape)
        if weight is not None:
            labels.append(text(mid[0], mid[1], weight, 14, weight=700, halo=True))
    parts.extend(labels)
    for name, (x, y) in spot.items():
        on = name in chosen
        face = tint(ctx.accent, 0.2) if on else PAPER
        parts.append(
            circle(x, y, 19, face, ctx.accent if on else INK, 2.8 if on else 1.6)
        )
        parts.append(text(x, y, name, fit(name, 34, 16), weight=700 if on else None))
    width, height = box_w + 60, box_h + 60
    if matrix:
        top = max(24, 30 + (box_h - (len(names) + 1) * 34) / 2)
        more, right, low = matrix_parts(ctx, names, edges, weighted, width + 14, top)
        parts.extend(more)
        width, height = right, max(height, low)
    return drawn(width, height, parts)


def hash_of(key, size):
    try:
        return int(key) % size, "key mod"
    except ValueError:
        return sum(ord(char) for char in key) % size, "sum of letters mod"


def read_buckets(ctx):
    slots = {}
    for ln in ctx.lines:
        index, _, rest = ln.text.replace("=", ":", 1).partition(":")
        keys = [] if rest.strip() in {"", "-", "_"} else words(rest)
        slots[int(index)] = keys
    return slots, max(slots) + 1


def fill_buckets(ctx, method):
    keys = words(" ".join(ln.text for ln in ctx.lines))
    size = int(ctx.number("size", default=max(7, len(keys) + 2)))
    if not 1 <= size <= 16:
        raise Bad("size must be between 1 and 16", ctx.where)
    if method == "linear" and len(keys) > size:
        raise Bad(f"{len(keys)} keys do not fit in {size} slots", ctx.where)
    slots, clashes, rule = {i: [] for i in range(size)}, {}, ""
    for key in keys:
        home, rule = hash_of(key, size)
        at = home
        while method == "linear" and slots[at]:
            at = (at + 1) % size
        if at != home or slots[at]:
            clashes[key] = home
        slots[at].append(key)
    return slots, size, clashes, f"h(key) = {rule} {size}"


def build_hashtable(ctx):
    need(ctx, "hashtable needs keys, for example: 10 22 31 4 15")
    methods = {
        "chain": "chain",
        "chaining": "chain",
        "linear": "linear",
        "probing": "linear",
        "linear probing": "linear",
        "open": "linear",
    }
    method = ctx.choice(("method", "collisions", "collision"), methods, "chain")
    if all(re.match(r"^\s*\d+\s*[:=]", ln.text) for ln in ctx.lines):
        (slots, size), clashes, rule = read_buckets(ctx), {}, ""
        size = max(size, int(ctx.number("size", default=0)))
    else:
        slots, size, clashes, rule = fill_buckets(ctx, method)
    if size > 16:
        raise Bad("a hash table can show up to 16 slots", ctx.where)
    row, left, top, parts, cell = 34, 20, 14, [], 52
    longest = max((len(keys) for keys in slots.values()), default=1)
    for i in range(size):
        y, keys = top + i * row, slots.get(i, [])
        parts.append(rect(left, y, 44, row, SOFT, INK, 1.4))
        parts.append(text(left + 22, y + row / 2, i, 14, weight=700))
        if method == "linear":
            label = keys[0] if keys else ""
            on = bool(keys) and keys[0] in clashes
            parts.append(box(left + 44, y, 100, row, label, ctx.accent, on))
            if on:
                note = f"{label}: h = {clashes[label]}, slot taken"
                parts.append(
                    text(left + 156, y + row / 2, note, 13, "start", fill=MUTE)
                )
            continue
        parts.append(rect(left + 44, y, 44, row, PAPER, INK, 1.4))
        if not keys:
            parts.append(line(left + 44, y + row, left + 88, y, LINE, 1))
            continue
        parts.append(circle(left + 66, y + row / 2, 3.6, INK, INK, 1))
        reach = left + 66
        for j, key in enumerate(keys):
            x = left + 116 + j * (cell + 28)
            parts.append(arrow(reach, y + row / 2, x, y + row / 2, INK, 1.4, 8))
            on = j > 0 and key in clashes
            parts.append(box(x, y + 3, cell, row - 6, key, ctx.accent, on))
            reach = x + cell
    if method == "linear":
        width = left + 156 + (150 if clashes else 0)
    else:
        width = left + 116 + longest * (cell + 28) + 20 - 28
    height = top + size * row + 14
    if rule:
        parts.append(text(left, height + 12, rule, 14, "start", italic=True))
        height += 30
    return drawn(width, height, parts)


SORTS = {
    "bubble": "bubble",
    "bubble sort": "bubble",
    "insertion": "insertion",
    "insertion sort": "insertion",
    "selection": "selection",
    "selection sort": "selection",
}
SORTED_FILL = "#e4e4dd"


def plural(count, word):
    return f"{count} {word}" + ("" if count == 1 else "s")


def sort_steps(kind, items, descending, per_swap):
    keys = number_or_text(items)
    cur = [(keys[i], items[i], i) for i in range(len(items))]
    n = len(cur)

    def late(a, b):
        return a[0] < b[0] if descending else a[0] > b[0]

    rows = [(list(cur), 1 if kind == "insertion" else 0, "Start", "")]
    if kind == "bubble":
        for p in range(n - 1):
            moves = 0
            for j in range(n - 1 - p):
                if late(cur[j], cur[j + 1]):
                    cur[j], cur[j + 1] = cur[j + 1], cur[j]
                    moves += 1
                    if per_swap:
                        rows.append((list(cur), p, f"Swap {len(rows)}", ""))
            if not per_swap:
                rows.append((list(cur), p + 1, f"Pass {p + 1}", plural(moves, "swap")))
            if not moves:
                break
    elif kind == "insertion":
        for i in range(1, n):
            moves, j, held = 0, i - 1, cur[i][1]
            while j >= 0 and late(cur[j], cur[j + 1]):
                cur[j], cur[j + 1] = cur[j + 1], cur[j]
                moves, j = moves + 1, j - 1
                if per_swap:
                    rows.append((list(cur), i + 1, f"Swap {len(rows)}", ""))
            if not per_swap:
                rows.append(
                    (list(cur), i + 1, f"Insert {held}", plural(moves, "shift"))
                )
    else:
        for i in range(n - 1):
            low = i
            for j in range(i + 1, n):
                if late(cur[low], cur[j]):
                    low = j
            if low != i:
                cur[i], cur[low] = cur[low], cur[i]
            note = "1 swap" if low != i else "no swap"
            rows.append((list(cur), i + 1, f"Pass {i + 1}", note))
    state, _, label, note = rows[-1]
    rows[-1] = (state, n, label, note)
    return rows


def build_sorting(ctx):
    need(ctx, "sorting needs values, for example: 5 3 8 1 9 2")
    items = words(" ".join(ln.text for ln in ctx.lines))
    if not 2 <= len(items) <= 14:
        raise Bad("sorting works on 2 to 14 values", ctx.where)
    kind = ctx.choice(("algorithm", "sort", "method"), SORTS, "bubble")
    modes = {"pass": False, "passes": False, "swap": True, "swaps": True, "step": True}
    per_swap = ctx.choice(("steps", "show"), modes, "pass")
    order = ctx.choice(
        ("order",),
        {"ascending": False, "asc": False, "descending": True, "desc": True},
        "ascending",
    )
    rows = sort_steps(kind, items, order, per_swap)
    if len(rows) > 40:
        raise Bad(
            "this sort has too many steps to show; use fewer values or steps: pass",
            ctx.where,
        )
    count = len(items)
    left, high = 86, 34
    cell = min(48, (WIDTH - left - 110) / count)
    top = 34
    parts = [text(14, 12, f"{kind.capitalize()} sort", 15, "start", weight=700)]
    before = None
    for r, (state, done, label, note) in enumerate(rows):
        y = top + r * high
        parts.append(text(14, y + high / 2, label, 13, "start", fill=MUTE))
        for c, (_, shown, uid) in enumerate(state):
            moved = before is not None and before[c][2] != uid
            ranked = c >= count - done if kind == "bubble" else c < done
            fill = SORTED_FILL if ranked and r else PAPER
            parts.append(
                box(
                    left + c * cell,
                    y + 2,
                    cell,
                    high - 4,
                    shown,
                    ctx.accent,
                    moved,
                    15,
                    fill,
                )
            )
        if note:
            parts.append(
                text(
                    left + count * cell + 12, y + high / 2, note, 13, "start", fill=MUTE
                )
            )
        before = state
    legend = top + len(rows) * high + 16
    parts.append(rect(left, legend - 8, 16, 16, tint(ctx.accent, 0.2), ctx.accent, 2.6))
    parts.append(text(left + 24, legend, "moved", 13, "start"))
    parts.append(rect(left + 90, legend - 8, 16, 16, SORTED_FILL, INK, 1.4))
    parts.append(text(left + 114, legend, "in place", 13, "start"))
    return drawn(left + count * cell + 120, legend + 18, parts)


CURVES = {
    "1": ("O(1)", lambda n, top: top * 0.2),
    "logn": ("O(log n)", lambda n, top: math.log2(max(n, 1))),
    "n": ("O(n)", lambda n, top: n),
    "nlogn": ("O(n log n)", lambda n, top: n * math.log2(max(n, 1))),
    "n2": ("O(n²)", lambda n, top: n * n),
    "n3": ("O(n³)", lambda n, top: n**3),
    "2n": ("O(2ⁿ)", lambda n, top: 2.0**n),
    "n!": ("O(n!)", lambda n, top: math.gamma(n + 1)),
}
CURVE_NAMES = {
    "constant": "1",
    "logarithmic": "logn",
    "log": "logn",
    "lgn": "logn",
    "log2n": "logn",
    "linear": "n",
    "linearithmic": "nlogn",
    "quadratic": "n2",
    "cubic": "n3",
    "exponential": "2n",
    "factorial": "n!",
}
DEFAULT_CURVES = "1, log n, n, n log n, n^2, 2^n"
STROKES = [
    (INK, None),
    ("accent", "9 5"),
    (MUTE, "2 4"),
    (INK, "9 5"),
    ("accent", "2 4"),
    (MUTE, None),
]


def curve_key(raw, where):
    s = raw.strip().lower()
    if re.match(r"^o\s*\(", s) and s.endswith(")"):
        s = s[s.index("(") + 1 : -1]
    s = (
        s.replace("²", "2")
        .replace("³", "3")
        .replace("squared", "2")
        .replace("cubed", "3")
    )
    s = re.sub(r"[\s^*()]", "", s)
    s = CURVE_NAMES.get(s, s)
    if s not in CURVES:
        raise Bad(
            f"cannot draw '{raw}' (use 1, log n, n, n log n, n^2, n^3, 2^n or n!)",
            where,
        )
    return s


def curve_points(function, nmax, ymax):
    points, count, previous = [], 160, function(0.0, nmax)
    for step in range(count + 1):
        n = nmax * step / count
        y = function(n, nmax)
        if y > ymax and points:
            frac = (ymax - previous) / ((y - previous) or 1)
            points.append((nmax * (step - 1 + frac) / count, ymax))
            return points, "top"
        points.append((n, min(y, ymax)))
        previous = y
    return points, "right"


def spread_labels(labels, key, gap):
    labels.sort(key=lambda item: item[key])
    for i in range(1, len(labels)):
        least = labels[i - 1][key] + gap(labels[i - 1], labels[i])
        labels[i][key] = max(labels[i][key], least)


def label_gap(a, b):
    return (span(a["text"], 14) + span(b["text"], 14)) / 2 + 4


def build_bigo(ctx):
    names = words(ctx.get("show", "curves", default=DEFAULT_CURVES))
    if not ctx.lines and not names:
        names = words(DEFAULT_CURVES)
    for ln in ctx.lines:
        names.extend(words(ln.text))
    keys = [curve_key(name, ctx.where) for name in names]
    keys = list(dict.fromkeys(keys))
    chosen = ctx.get("highlight", "emphasise")
    strong = curve_key(chosen, ctx.where) if chosen else None
    nmax = ctx.number("max", "n", default=10)
    ymax = ctx.number("ymax", default=4 * nmax)
    if nmax < 2 or ymax <= 0:
        raise Bad("max must be at least 2", ctx.where)
    x0, y0, x1, y1 = 64, 30, 500, 296
    right, top = [], []
    parts = []
    for i, key in enumerate(keys):
        label, function = CURVES[key]
        points, ends = curve_points(function, nmax, ymax)
        color, dash = STROKES[i % len(STROKES)]
        color = ctx.accent if color == "accent" else color
        coords = [
            (x0 + n / nmax * (x1 - x0), y1 - min(y, ymax) / ymax * (y1 - y0))
            for n, y in points
        ]
        width = 4.2 if key == strong else 2.6
        parts.append(polyline(coords, color, width, dash))
        ex, ey = coords[-1]
        item = {"x": ex, "y": ey, "text": label, "color": color}
        (top if ends == "top" else right).append(item)
    spread_labels(right, "y", lambda a, b: 17)
    spread_labels(top, "x", label_gap)
    for item in right:
        parts.append(
            text(
                item["x"] + 14,
                item["y"],
                item["text"],
                14,
                "start",
                weight=700,
                fill=item["color"],
            )
        )
    for item in top:
        parts.append(
            text(item["x"], y0 - 14, item["text"], 14, weight=700, fill=item["color"])
        )
    parts.append(arrow(x0, y1, x1 + 6, y1, INK, 1.6, 9))
    parts.append(arrow(x0, y1, x0, y0 - 10, INK, 1.6, 9))
    parts.append(text((x0 + x1) / 2, y1 + 24, "Input size (n)", 14))
    parts.append(
        group(
            [text(0, 0, "Operations", 14)],
            f"translate({x0 - 20},{(y0 + y1) / 2}) rotate(-90)",
        )
    )
    return drawn(640, y1 + 40, parts)


NUMBER_BASE = {
    "binary": 2,
    "bin": 2,
    "decimal": 10,
    "denary": 10,
    "dec": 10,
    "hex": 16,
    "hexadecimal": 16,
    "octal": 8,
    "oct": 8,
}
BASE_WORD = {2: "binary", 8: "octal", 10: "decimal", 16: "hexadecimal"}
PREFIXES = {"0b": 2, "0x": 16, "0o": 8}


def read_value(raw, default, where):
    s = raw.strip().lower().replace("_", "")
    sign = -1 if s.startswith("-") else 1
    s = s.lstrip("+-")
    base = default
    if s[:2] in PREFIXES:
        base, s = PREFIXES[s[:2]], s[2:]
    elif s.startswith("#"):
        base, s = 16, s[1:]
    try:
        return sign * int(s, base)
    except ValueError:
        raise Bad(f"'{raw}' is not a valid {BASE_WORD[base]} number", where) from None


def digits_of(value, base):
    chars, out = "0123456789ABCDEF", ""
    while value:
        value, rest = divmod(value, base)
        out = chars[rest] + out
    return out or "0"


def grouped(bits):
    pad = (-len(bits)) % 4
    bits = "0" * pad + bits
    return " ".join(bits[i : i + 4] for i in range(0, len(bits), 4))


def width_for(values):
    for bits in (8, 16, 32, 64):
        if all(-(1 << (bits - 1)) <= v < (1 << bits) for v in values):
            return bits
    return 64


def twos_value(value, bits, where):
    if not -(1 << (bits - 1)) <= value < (1 << bits):
        raise Bad(f"{value} does not fit in {bits} bits", where)
    return value & ((1 << bits) - 1)


def pipe_rows(rows):
    out = ["| " + " | ".join(rows[0]) + " |", "|" + "---|" * len(rows[0])]
    out.extend("| " + " | ".join(row) + " |" for row in rows[1:])
    return out


def read_values(ctx):
    default = ctx.choice(("from", "input"), NUMBER_BASE, "decimal")
    out = []
    for ln in ctx.lines:
        out.extend(read_value(raw, default, ln.where) for raw in words(ln.text))
    return out


def binary_steps(ctx, values):
    base = ctx.choice(("to", "base"), NUMBER_BASE, "binary")
    if len(values) != 1:
        raise Bad("steps shows one number at a time", ctx.where)
    value = values[0]
    if value < 0:
        raise Bad(
            "steps works with positive numbers (use mode: twos for negatives)",
            ctx.where,
        )
    rows = [["Division", "Quotient", "Remainder"]]
    current, got = value, []
    while current or not got:
        quotient, rest = divmod(current, base)
        shown = f"{rest} ({digits_of(rest, 16)})" if rest > 9 else str(rest)
        rows.append([f"{current} ÷ {base}", str(quotient), shown])
        got.append(digits_of(rest, 16))
        current = quotient
    rows.append(["**Read upwards**", "", "**" + "".join(reversed(got)) + "**"])
    ctx.table(pipe_rows(rows), [["align", "c c c"]])


def binary_table(ctx, values):
    negative = any(v < 0 for v in values)
    bits = int(ctx.number("bits", default=0)) or (width_for(values) if negative else 0)
    rows = [["Decimal", "Binary", "Hex", "Octal"]]
    for value in values:
        shown = twos_value(value, bits, ctx.where) if bits else value
        if bits:
            binary = format(shown, f"0{bits}b")
        else:
            binary = format(shown, "b")
        hexed = digits_of(shown, 16).rjust(bits // 4 if bits else 1, "0")
        rows.append([str(value), grouped(binary), hexed, digits_of(shown, 8)])
    ctx.table(pipe_rows(rows), [["align", "c c c c"]])


def binary_place(ctx, values):
    signed = ctx.flag("signed") or any(v < 0 for v in values)
    bits = int(ctx.number("bits", default=0)) or (width_for(values) if signed else 8)
    if not 2 <= bits <= 16:
        raise Bad("place values can show 2 to 16 bits", ctx.where)
    heads = [str(1 << (bits - 1 - i)) for i in range(bits)]
    if signed:
        heads[0] = "-" + heads[0]
    rows = [heads + ["Decimal"]]
    for value in values:
        pattern = format(twos_value(value, bits, ctx.where), f"0{bits}b")
        rows.append(list(pattern) + [f"**{value}**"])
    ctx.table(pipe_rows(rows), [["align", " ".join("c" * (bits + 1))]])


def binary_twos(ctx, values):
    bits = int(ctx.number("bits", default=0)) or width_for(values)
    rows = [["Decimal", "Positive", "Invert", "Add 1"]]
    for value in values:
        twos_value(value, bits, ctx.where)
        plain = format(abs(value), f"0{bits}b")
        if value >= 0:
            rows.append([str(value), grouped(plain), "–", "–"])
            continue
        flipped = "".join("1" if c == "0" else "0" for c in plain)
        final = format(twos_value(value, bits, ctx.where), f"0{bits}b")
        rows.append(
            [str(value), grouped(plain), grouped(flipped), f"**{grouped(final)}**"]
        )
    ctx.table(pipe_rows(rows), [["align", "c c c c"]])


def build_binary(ctx):
    need(ctx, "binary needs numbers, for example: 13 200 0xFF or -5")
    modes = {
        "table": "table",
        "convert": "table",
        "conversion": "table",
        "steps": "steps",
        "working": "steps",
        "division": "steps",
        "place": "place",
        "place values": "place",
        "twos": "twos",
        "two's complement": "twos",
        "twos complement": "twos",
    }
    mode = ctx.choice(("mode", "show"), modes, "table")
    values = read_values(ctx)
    if not values:
        raise Bad("binary needs numbers, for example: 13 200 0xFF", ctx.where)
    if len(values) > 16:
        raise Bad("binary shows up to 16 numbers", ctx.where)
    {
        "table": binary_table,
        "steps": binary_steps,
        "place": binary_place,
        "twos": binary_twos,
    }[mode](ctx, values)
    return None


def build_trace(ctx):
    need(ctx, "trace needs a header row and value rows, for example: i | total")
    rows = []
    for ln in ctx.lines:
        raw = ln.text.strip().strip("|")
        rows.append([cell.strip() for cell in raw.split("|")])
    size = max(len(row) for row in rows)
    rows = [row + [""] * (size - len(row)) for row in rows]
    mode = (ctx.get("highlight", "changes") or "").strip().lower()
    marking = mode in {"changes", "change", "yes", "true", "on"} or ctx.flag("changes")
    if marking:
        last = [None] * size
        for r in range(1, len(rows)):
            for c in range(size):
                value = rows[r][c]
                if not value:
                    continue
                if r > 1 and last[c] is not None and value != last[c]:
                    rows[r][c] = f"**{value}**"
                last[c] = value
    if ctx.flag("steps", "numbers"):
        rows[0].insert(0, "Step")
        for r in range(1, len(rows)):
            rows[r].insert(0, str(r))
        size += 1
    ctx.table(pipe_rows(rows), [["align", " ".join("c" * size)]])
    return None


OSI = [
    (
        7,
        "Application",
        "Network services for the user's software",
        "Data",
        "HTTP, HTTPS, FTP, SMTP, DNS",
        "Gateway",
    ),
    (
        6,
        "Presentation",
        "Formats, encrypts and compresses data",
        "Data",
        "TLS, SSL, JPEG, MPEG",
        "Gateway",
    ),
    (
        5,
        "Session",
        "Opens, manages and closes sessions",
        "Data",
        "NetBIOS, RPC, SIP",
        "Gateway",
    ),
    (
        4,
        "Transport",
        "End-to-end delivery, ports and reliability",
        "Segment",
        "TCP, UDP",
        "Firewall",
    ),
    (
        3,
        "Network",
        "Logical addressing and routing",
        "Packet",
        "IP, ICMP, OSPF",
        "Router",
    ),
    (
        2,
        "Data link",
        "Frames and physical (MAC) addressing",
        "Frame",
        "Ethernet, Wi-Fi, ARP",
        "Switch",
    ),
    (
        1,
        "Physical",
        "Sends raw bits over the medium",
        "Bit",
        "Cables, radio, DSL, Bluetooth",
        "Hub, cable",
    ),
]
TCPIP = [
    (
        4,
        "Application",
        "Services used by programs",
        "Data",
        "HTTP, HTTPS, FTP, SMTP, DNS",
        "Gateway",
    ),
    (
        3,
        "Transport",
        "End-to-end delivery, ports and reliability",
        "Segment",
        "TCP, UDP",
        "Firewall",
    ),
    (2, "Internet", "Logical addressing and routing", "Packet", "IP, ICMP", "Router"),
    (
        1,
        "Network access",
        "Frames and bits on the local link",
        "Frame",
        "Ethernet, Wi-Fi, ARP",
        "Switch",
    ),
]
EXTRA = {
    "function": 2,
    "pdu": 3,
    "data unit": 3,
    "devices": 5,
    "device": 5,
    "protocols": 4,
}
COLUMN_HEAD = {2: "Function", 3: "Data unit", 4: "Example protocols", 5: "Devices"}


def build_osi(ctx):
    model = ctx.choice(
        ("model",),
        {"osi": OSI, "tcpip": TCPIP, "tcp/ip": TCPIP, "tcp ip": TCPIP},
        "osi",
    )
    shown = [4]
    for name in words(ctx.get("show", "columns", default="protocols")):
        key = name.lower()
        if key not in EXTRA:
            raise Bad(
                f"cannot show '{name}' (use function, pdu, protocols, devices)",
                ctx.where,
            )
        if EXTRA[key] not in shown:
            shown.append(EXTRA[key])
    shown.sort()
    rows = {r[0]: list(r) for r in model}
    names = {r[1].lower(): r[0] for r in model}
    for ln in ctx.lines:
        name, sep, rest = ln.text.partition(":")
        if not sep or name.strip().lower() not in names:
            raise Bad(
                f"cannot read '{ln.text.strip()[:40]}' (write a layer name, a colon and its protocols)",
                ln.where,
            )
        rows[names[name.strip().lower()]][4] = rest.strip()
    marked = set()
    for part in words(ctx.get(*MARK, default="")):
        number = int(part) if part.isdigit() else names.get(part.lower())
        if number not in rows:
            raise Bad(f"'{part}' is not a layer of this model", ctx.where)
        marked.add(number)
    table = [["Layer", "Name"] + [COLUMN_HEAD[c] for c in shown]]
    for number in sorted(rows, reverse=True):
        row = rows[number]
        cells = [str(number), row[1]] + [row[c] for c in shown]
        table.append([f"**{cell}**" for cell in cells] if number in marked else cells)
    ctx.table(pipe_rows(table), [["align", "c l " + " ".join("l" * len(shown))]])
    return None


BUBBLED = {"NAND", "NOR", "XNOR", "NOT"}
BASE_GATE = {"NAND": "AND", "NOR": "OR", "XNOR": "XOR"}
SLOT = 58


def gate_tree(node):
    if node[0] == "var":
        return {"op": "VAR", "name": node[1], "kids": [], "node": node}
    if node[0] == "not":
        return {"op": "NOT", "kids": [gate_tree(node[1])], "node": node}
    if node[1] == "IMPLIES":
        flip = {"op": "NOT", "kids": [gate_tree(node[2])], "node": ("not", node[2])}
        return {"op": "OR", "kids": [flip, gate_tree(node[3])], "node": node}
    return {
        "op": node[1],
        "kids": [gate_tree(node[2]), gate_tree(node[3])],
        "node": node,
    }


def or_curve(x0, w):
    span_w = w - x0
    first = f"M{num(x0)},-24 C{num(x0 + span_w * 0.45)},-24 "
    second = f"{num(x0 + span_w * 0.8)},-14 {num(x0 + span_w)},0 "
    third = f"C{num(x0 + span_w * 0.8)},14 {num(x0 + span_w * 0.45)},24 {num(x0)},24 "
    return first + second + third + f"Q{num(x0 + span_w * 0.22)},0 {num(x0)},-24 Z"


def gate_shape(op, stroke=INK):
    inverted = op in BUBBLED
    base = BASE_GATE.get(op, op)
    w = 56 if inverted else 64
    parts, pin = [], 0
    if base == "AND":
        d = f"M0,-24 H{w - 24} A24,24 0 0 1 {w - 24},24 H0 Z"
        parts.append(path(d, PAPER, stroke, 2))
    elif base == "OR":
        parts.append(path(or_curve(0, w), PAPER, stroke, 2))
        pin = 5
    elif base == "XOR":
        parts.append(path(or_curve(8, w), PAPER, stroke, 2))
        parts.append(path(f"M0,-24 Q{num((w - 8) * 0.22)},0 0,24", "none", stroke, 2))
        pin = 5
    else:
        w = 44
        parts.append(path("M0,-20 L44,0 L0,20 Z", PAPER, stroke, 2))
    if inverted:
        parts.append(circle(w + 5, 0, 5, PAPER, stroke, 2))
    return "".join(parts), pin, w + (10 if inverted else 0)


def pin_rows(op):
    return (0,) if op == "NOT" else (-12, 12)


def circuit(ctx, name, expression, values):
    root = gate_tree(expression)
    if root["op"] == "VAR":
        raise Bad("logic needs at least one operator, for example: A AND B", ctx.where)
    leaves, gates = [], []

    def place(g, depth):
        g["depth"] = depth
        if g["op"] == "VAR":
            g["row"] = len(leaves)
            leaves.append(g)
            return
        for kid in g["kids"]:
            place(kid, depth + 1)
        g["row"] = sum(kid["row"] for kid in g["kids"]) / len(g["kids"])
        gates.append(g)

    place(root, 0)
    if len(leaves) > 12 or len(gates) > 16:
        raise Bad("a circuit can show up to 12 inputs and 16 gates", ctx.where)
    order = []
    for leaf in leaves:
        if leaf["name"] not in order:
            order.append(leaf["name"])
    top = 30
    levels = max(g["depth"] for g in gates)
    label_w = max(span(n, 16) for n in order) + (34 if values else 6)
    rail0 = label_w + 26
    first = rail0 + 16 * len(order) + 26
    pitch = 118

    def gate_x(g):
        return first + (levels - g["depth"]) * pitch

    def row_y(g):
        return top + g["row"] * SLOT

    def lit(g):
        return values is not None and evaluate(g["node"], values)

    def style(g):
        if values is None:
            return INK, 1.8
        return (ctx.accent, 2.8) if lit(g) else (INK, 1.4)

    wires, bodies = [], []
    shapes = {}
    for g in gates:
        shapes[id(g)] = gate_shape(g["op"], style(g)[0] if values is not None else INK)
    uses = {}
    for g in gates:
        pins = pin_rows(g["op"])
        pin_x = gate_x(g) + shapes[id(g)][1]
        for kid, offset in zip(g["kids"], pins):
            target = (pin_x, row_y(g) + offset)
            if kid["op"] == "VAR":
                uses.setdefault(kid["name"], []).append((row_y(kid), target, kid))
                continue
            start = (gate_x(kid) + shapes[id(kid)][2], row_y(kid))
            color, width = style(kid)
            mid = pin_x - 16
            wires.append(
                polyline(
                    [start, (mid, start[1]), (mid, target[1]), target], color, width
                )
            )
            if values is not None:
                wires.append(
                    text(
                        start[0] + 10,
                        start[1] - 11,
                        int(lit(kid)),
                        12,
                        "start",
                        fill=color,
                        weight=700,
                    )
                )
    for number, label in enumerate(order):
        rail = rail0 + number * 16
        group_uses = uses[label]
        ys = [item[0] for item in group_uses]
        value = values[label] if values is not None else None
        color, width = (ctx.accent, 2.8) if value else (INK, 1.4 if values else 1.8)
        shown = f"{label} = {int(value)}" if values is not None else label
        wires.append(
            text(
                12, ys[0], shown, 16, "start", weight=700, fill=color if values else INK
            )
        )
        wires.append(line(12 + span(shown, 16) + 4, ys[0], rail, ys[0], color, width))
        if len(group_uses) > 1:
            wires.append(line(rail, min(ys), rail, max(ys), color, width))
        for y, target, _ in group_uses:
            mid = target[0] - 16
            wires.append(
                polyline([(rail, y), (mid, y), (mid, target[1]), target], color, width)
            )
            if len(group_uses) > 1:
                wires.append(circle(rail, y, 3.6, color, color, 1))
    for g in gates:
        shape, _, _ = shapes[id(g)]
        bodies.append(group([shape], f"translate({num(gate_x(g))},{num(row_y(g))})"))
    out_x = gate_x(root) + shapes[id(root)][2]
    color, width = style(root)
    wires.append(line(out_x, row_y(root), out_x + 38, row_y(root), color, width))
    shown = f"{name} = {int(lit(root))}" if values is not None else name
    wires.append(
        text(
            out_x + 46,
            row_y(root),
            shown,
            16,
            "start",
            weight=700,
            fill=color if values else INK,
        )
    )
    width = out_x + 46 + span(shown, 16) + 14
    height = top + (len(leaves) - 1) * SLOT + 40
    return wires + bodies, width, height


def read_inputs(spec, found, where):
    values = {}
    for part in words(spec):
        match = re.fullmatch(r"(\w+)\s*[=:]\s*(1|0|true|false|t|f)", part.strip(), re.I)
        if not match:
            raise Bad(f"cannot read '{part}' (write A=1, B=0)", where)
        values[match.group(1)] = match.group(2).lower() in {"1", "true", "t"}
    missing = [n for n in found if n not in values]
    if missing:
        raise Bad(f"inputs need a value for {', '.join(missing)}", where)
    return values


def build_logic(ctx):
    need(ctx, "logic needs an expression, for example: (A AND B) OR NOT C")
    circuits = []
    for ln in ctx.lines:
        raw = ln.text.strip()
        label, expression = "", raw
        if re.match(r"^\w+\s*=[^=]", raw):
            label, _, expression = raw.partition("=")
        try:
            circuits.append((label.strip(), ln, parse_expression(expression)))
        except ExpressionError as error:
            raise Bad(
                f"{error} in '{raw[:40]}' (write things like A AND B, NOT (A OR C), A XOR B)",
                ln.where,
            ) from None
    spec = ctx.get("inputs", "values", "set")
    parts, width, height = [], 0, 0
    for number, (label, ln, tree) in enumerate(circuits):
        names = []
        stack = [tree]
        while stack:
            node = stack.pop(0)
            if node[0] == "var" and node[1] not in names:
                names.append(node[1])
            stack.extend(node[1:] if node[0] == "not" else node[2:])
        values = read_inputs(spec, names, ln.where) if spec else None
        name = label or ("Q" if len(circuits) == 1 else f"Q{number + 1}")
        shapes, w, h = circuit(ctx, name, tree, values)
        parts.append(group(shapes, f"translate(0,{num(height)})"))
        width, height = max(width, w), height + h
    return drawn(width, height, parts)


KINDS = {
    "router": "router",
    "modem": "router",
    "gateway": "router",
    "access point": "router",
    "wifi": "router",
    "ap": "router",
    "switch": "switch",
    "hub": "switch",
    "server": "server",
    "database": "server",
    "pc": "pc",
    "computer": "pc",
    "desktop": "pc",
    "workstation": "pc",
    "client": "pc",
    "laptop": "laptop",
    "notebook": "laptop",
    "printer": "printer",
    "cloud": "cloud",
    "internet": "cloud",
    "firewall": "firewall",
}
KIND_NAMES = {
    "router": "Router",
    "switch": "Switch",
    "server": "Server",
    "pc": "PC",
    "laptop": "Laptop",
    "printer": "Printer",
    "cloud": "Internet",
    "firewall": "Firewall",
}
TOPOLOGIES = {
    "star": "star",
    "bus": "bus",
    "ring": "ring",
    "mesh": "mesh",
    "tree": "tree",
    "hierarchy": "tree",
    "hybrid": "tree",
}


def glyph(kind, stroke=INK):
    def box_(x, y, w, h, fill=PAPER, r=0):
        return rect(x, y, w, h, fill, stroke, 1.6, r)

    if kind == "router":
        parts = [
            line(-16, -4, -16, -20, stroke, 1.6),
            line(16, -4, 16, -20, stroke, 1.6),
        ]
        parts += [
            circle(-16, -21, 2.5, stroke, stroke, 1),
            circle(16, -21, 2.5, stroke, stroke, 1),
        ]
        parts += [box_(-27, -4, 54, 20, PAPER, 3)]
        parts += [circle(x, 6, 2.4, stroke, stroke, 1) for x in (-14, -4, 6, 16)]
    elif kind == "switch":
        parts = [box_(-29, -10, 58, 22, PAPER, 2)]
        parts += [rect(x, -3, 7, 8, SOFT, stroke, 1.2) for x in range(-22, 20, 10)]
    elif kind == "server":
        parts = []
        for y in (-22, -9, 4):
            parts += [
                box_(-18, y, 36, 13, PAPER, 1.5),
                circle(11, y + 6.5, 2.2, stroke, stroke, 1),
            ]
            parts.append(line(-12, y + 6.5, 0, y + 6.5, LINE, 1.4))
    elif kind == "pc":
        parts = [
            box_(-21, -22, 42, 28, PAPER, 2),
            rect(-17, -18, 34, 20, SOFT, stroke, 1),
        ]
        parts += [line(0, 6, 0, 12, stroke, 1.6), line(-11, 12, 11, 12, stroke, 2.2)]
    elif kind == "laptop":
        parts = [
            box_(-18, -20, 36, 24, PAPER, 2),
            rect(-14, -16, 28, 16, SOFT, stroke, 1),
        ]
        parts.append(
            polygon([(-26, 7), (26, 7), (30, 13), (-30, 13)], PAPER, stroke, 1.6)
        )
    elif kind == "printer":
        parts = [box_(-12, -20, 24, 14, PAPER), box_(-24, -8, 48, 20, PAPER, 3)]
        parts += [box_(-13, 5, 26, 11, PAPER), circle(16, -1, 2.2, stroke, stroke, 1)]
    elif kind == "cloud":
        d = "M-22,12 C-36,12 -36,-6 -20,-6 C-18,-20 4,-22 8,-8 C20,-16 34,-4 24,8 C32,14 24,12 22,12 Z"
        parts = [path(d, PAPER, stroke, 1.8)]
    else:
        parts = [box_(-26, -20, 52, 34, PAPER)]
        parts += [line(-26, -9, 26, -9, stroke, 1.4), line(-26, 2, 26, 2, stroke, 1.4)]
        parts += [line(0, -20, 0, -9, stroke, 1.4), line(-13, -9, -13, 2, stroke, 1.4)]
        parts += [line(13, -9, 13, 2, stroke, 1.4), line(0, 2, 0, 14, stroke, 1.4)]
    return "".join(parts)


def draw_device(device, x, y, above=False):
    back = rect(-36, -28, 72, 56, PAPER, "none", 0)
    size = fit(device["label"], 96, 14)
    label = text(0, -40 if above else 42, device["label"], size, halo=True)
    return group([back, glyph(device["kind"]), label], f"translate({num(x)},{num(y)})")


DEFAULT_NAME = {
    "pc": "PC",
    "ap": "Access point",
    "access point": "Access point",
    "wifi": "Wi-Fi",
    "cloud": "Internet",
}


def split_device(content):
    flat = content.replace(":", " ", 1)
    tokens = flat.lower().split()
    for size in (2, 1):
        name = " ".join(tokens[:size])
        if len(tokens) >= size and name in KINDS:
            rest = flat.split(None, size)
            return name, (rest[size] if len(rest) > size else "").strip()
    return None, ""


def split_labels(rest):
    return [part.strip() for part in rest.split(",") if part.strip()] or [""]


def read_devices(ctx):
    devices = []
    for ln in ctx.lines:
        raw = ln.text.expandtabs(4).rstrip()
        content = raw.strip()
        kind, rest = split_device(content)
        if kind is None:
            names = ", ".join(sorted(KIND_NAMES))
            raise Bad(
                f"cannot read '{content[:30]}' (start with a device: {names})", ln.where
            )
        count = re.fullmatch(r"[x×]\s*(\d+)", rest, re.I)
        labels = [""] * int(count.group(1)) if count else split_labels(rest)
        if len(labels) > 12:
            raise Bad("a line can add up to 12 devices", ln.where)
        for label in labels:
            devices.append(
                {
                    "kind": KINDS[kind],
                    "label": label,
                    "name": DEFAULT_NAME.get(kind, kind.title()),
                    "indent": len(raw) - len(raw.lstrip()),
                }
            )
    auto = [d for d in devices if not d["label"]]
    totals = Counter(d["name"] for d in auto)
    seen = Counter()
    for d in auto:
        seen[d["name"]] += 1
        number = f" {seen[d['name']]}" if totals[d["name"]] > 1 else ""
        d["label"] = d["name"] + number
    return devices


def ellipse_spots(count, cx, cy, rx, ry, start=-math.pi / 2):
    return [
        (
            cx + rx * math.cos(start + 2 * math.pi * i / count),
            cy + ry * math.sin(start + 2 * math.pi * i / count),
        )
        for i in range(count)
    ]


def tree_spots(devices, ctx):
    stack, kids, roots = [], {id(d): [] for d in devices}, []
    for d in devices:
        while stack and stack[-1]["indent"] >= d["indent"]:
            stack.pop()
        (kids[id(stack[-1])] if stack else roots).append(d)
        stack.append(d)
    leaf = [0]
    spots, links = {}, []

    def walk(d, depth):
        children = kids[id(d)]
        for c in children:
            walk(c, depth + 1)
            links.append((d, c))
        if children:
            x = sum(spots[id(c)][0] for c in children) / len(children)
        else:
            x = leaf[0]
            leaf[0] += 1
        spots[id(d)] = (x, depth)

    for r in roots:
        walk(r, 0)
    if len(roots) > 1:
        raise Bad(
            "a tree network needs one device at the top; indent the others under it",
            ctx.where,
        )
    depth = max(v[1] for v in spots.values())
    step = min(110, 560 / max(1, leaf[0]))
    placed = {k: (50 + x * step + 36, 40 + d * 104) for k, (x, d) in spots.items()}
    return (
        placed,
        links,
        2 * 50 + max(1, leaf[0] - 1) * step + 72,
        40 + depth * 104 + 70,
    )


def build_network(ctx):
    need(ctx, "network needs devices, for example: switch, then pc x3")
    devices = read_devices(ctx)
    kind = ctx.choice(("topology", "type", "layout"), TOPOLOGIES, "star")
    dash = "6 4" if ctx.flag("wireless", "wifi") else None
    colour = INK
    if len(devices) < 2:
        raise Bad("a network needs at least two devices", ctx.where)
    parts, cables = [], []
    if kind == "tree":
        spots, links, width, height = tree_spots(devices, ctx)
        for a, b in links:
            (x1, y1), (x2, y2) = spots[id(a)], spots[id(b)]
            mid = (y1 + y2) / 2
            cables.append(
                polyline(
                    [(x1, y1 + 54), (x1, mid), (x2, mid), (x2, y2 - 28)],
                    colour,
                    1.8,
                    dash,
                )
            )
        spot_list = [spots[id(d)] for d in devices]
    elif kind == "bus":
        count = len(devices)
        columns = (count + 1) // 2
        step = min(120, 560 / columns)
        width, height = 2 * 40 + columns * step, 330
        mid = height / 2
        cables.append(line(24, mid, width - 24, mid, colour, 3.4))
        for x in (24, width - 24):
            cables.append(line(x, mid - 9, x, mid + 9, colour, 3.4))
        spot_list = []
        for i in range(count):
            x = 40 + (i // 2 + 0.5) * step
            y = 70 if i % 2 == 0 else height - 70
            spot_list.append((x, y))
            edge = y + 28 if y < mid else y - 28
            cables.append(line(x, edge, x, mid, colour, 1.8, dash))
    else:
        count = len(devices)
        if kind == "mesh" and count > 8:
            raise Bad("a mesh can show up to 8 devices", ctx.where)
        if count > 12:
            raise Bad("this topology can show up to 12 devices", ctx.where)
        width, height, rx, ry = 640, 360, 230, 122
        if kind == "star":
            spot_list = [(width / 2, height / 2)] + ellipse_spots(
                count - 1, width / 2, height / 2, rx, ry
            )
            cables = [line(*spot_list[0], *s, colour, 1.8, dash) for s in spot_list[1:]]
        else:
            spot_list = ellipse_spots(count, width / 2, height / 2, rx, ry)
            pairs = (
                list(itertools.combinations(range(count), 2))
                if kind == "mesh"
                else [(i, (i + 1) % count) for i in range(count)]
            )
            cables = [
                line(*spot_list[a], *spot_list[b], colour, 1.8, dash) for a, b in pairs
            ]
    parts.extend(cables)
    for device, (x, y) in zip(devices, spot_list):
        above = kind != "tree" and y < height / 2 - 10
        parts.append(draw_device(device, x, y, above))
    return drawn(width, height, parts)


WIRE_KINDS = {
    "window": "window",
    "screen": "window",
    "page": "window",
    "dialog": "window",
    "panel": "panel",
    "box": "panel",
    "card": "panel",
    "group": "panel",
    "row": "row",
    "header": "header",
    "heading": "header",
    "title": "header",
    "label": "label",
    "text": "text",
    "paragraph": "text",
    "button": "button",
    "input": "input",
    "textbox": "input",
    "field": "input",
    "select": "select",
    "dropdown": "select",
    "checkbox": "checkbox",
    "check": "checkbox",
    "image": "image",
    "picture": "image",
    "img": "image",
    "table": "table",
    "grid": "table",
    "nav": "nav",
    "menu": "nav",
    "navbar": "nav",
    "link": "link",
    "divider": "divider",
    "line": "divider",
}
WIRE_NAMES = (
    "window, panel, row, header, label, text, button, input, select, "
    "checkbox, image, table, nav, link, divider"
)
GAP = 12


def read_wire(ctx):
    root = {"kind": "frame", "text": "", "kids": []}
    stack = [(-1, root)]
    for ln in ctx.lines:
        raw = ln.text.expandtabs(4).rstrip()
        indent, content = len(raw) - len(raw.lstrip()), raw.strip()
        first, _, rest = content.replace(":", " ", 1).partition(" ")
        kind = WIRE_KINDS.get(first.lower())
        if kind is None:
            raise Bad(
                f"cannot read '{content[:30]}' (start with one of: {WIRE_NAMES})",
                ln.where,
            )
        node = {"kind": kind, "text": rest.strip(), "kids": [], "where": ln.where}
        while stack[-1][0] >= indent:
            stack.pop()
        stack[-1][1]["kids"].append(node)
        stack.append((indent, node))
    return root


def wrapped(content, width, size):
    per = max(8, int(width / (size * 0.56)))
    lines, current = [], ""
    for word in content.split():
        if current and len(current) + len(word) + 1 > per:
            lines.append(current)
            current = word
        else:
            current = f"{current} {word}".strip()
    return lines + [current] if current else lines


def stack_kids(ctx, node, x, y, w):
    parts, cursor = [], y
    for kid in node["kids"]:
        more, high = draw_wire(ctx, kid, x, cursor, w)
        parts.extend(more)
        cursor += high + GAP
    return parts, max(0, cursor - y - GAP)


def wire_window(ctx, node, x, y, w):
    title = node["text"]
    inner, high = stack_kids(ctx, node, x + 18, y + 30 + 18, w - 36)
    total = 30 + 18 + high + 18
    parts = [rect(x, y, w, total, PAPER, INK, 2, 6)]
    parts.append(
        path(
            f"M{x},{y + 30} V{y + 6} Q{x},{y} {x + 6},{y} H{x + w - 6} Q{x + w},{y} {x + w},{y + 6} V{y + 30} Z",
            tint(ctx.accent, 0.16),
            INK,
            2,
        )
    )
    parts += [circle(x + 16 + 14 * i, y + 15, 4, PAPER, INK, 1.2) for i in range(3)]
    if title:
        parts.append(text(x + w / 2, y + 15, title, 14, weight=700))
    return parts + inner, total


def wire_panel(ctx, node, x, y, w):
    title = 22 if node["text"] else 0
    inner, high = stack_kids(ctx, node, x + 12, y + 12 + title, w - 24)
    total = 24 + title + high
    parts = [rect(x, y, w, total, PAPER, LINE, 1.6, 6)]
    if node["text"]:
        parts.append(text(x + 12, y + 18, node["text"], 14, "start", weight=700))
    return parts + inner, total


def wire_row(ctx, node, x, y, w):
    count = len(node["kids"])
    if not count:
        return [], 0
    cell = (w - GAP * (count - 1)) / count
    parts, high = [], 0
    for i, kid in enumerate(node["kids"]):
        more, h = draw_wire(ctx, kid, x + i * (cell + GAP), y, cell)
        parts.extend(more)
        high = max(high, h)
    return parts, high


def wire_header(ctx, node, x, y, w):
    return [text(x, y + 15, node["text"] or "Heading", 21, "start", weight=700)], 30


def wire_label(ctx, node, x, y, w):
    return [text(x, y + 10, node["text"] or "Label", 14, "start")], 20


def wire_text(ctx, node, x, y, w):
    if node["text"]:
        rows = wrapped(node["text"], w, 14)
        parts = [
            text(x, y + 10 + 20 * i, row, 14, "start") for i, row in enumerate(rows)
        ]
        return parts, 20 * len(rows)
    widths = (1, 0.96, 0.62)
    parts = [
        rect(x, y + 5 + 16 * i, w * f, 7, "#dcdcd5", "none", 0, 3.5)
        for i, f in enumerate(widths)
    ]
    return parts, 16 * len(widths)


def wire_button(ctx, node, x, y, w):
    label = node["text"] or "Button"
    width = min(w, max(100, span(label, 15) + 40))
    parts = [rect(x, y, width, 34, ctx.accent, ctx.accent, 1.6, 5)]
    parts.append(text(x + width / 2, y + 17, label, 15, fill=PAPER, weight=700))
    return parts, 34


def wire_input(ctx, node, x, y, w):
    label = node["text"]
    secret = label.lower().startswith("password")
    shown = "••••••••" if secret else label
    parts = [rect(x, y, w, 34, PAPER, INK, 1.6, 4)]
    if shown:
        parts.append(text(x + 12, y + 17, shown, 14, "start", fill=MUTE))
    return parts, 34


def wire_select(ctx, node, x, y, w):
    parts, high = wire_input(ctx, node, x, y, w)
    parts.append(
        polygon([(x + w - 26, y + 14), (x + w - 14, y + 14), (x + w - 20, y + 21)], INK)
    )
    return parts, high


def wire_checkbox(ctx, node, x, y, w):
    label = node["text"]
    ticked = re.match(r"^\[\s*[xX✓]\s*\]\s*", label) is not None
    label = re.sub(r"^\[\s*[xX✓ ]?\s*\]\s*", "", label)
    parts = [rect(x, y + 2, 18, 18, PAPER, INK, 1.6, 3)]
    if ticked:
        parts.append(
            polyline([(x + 4, y + 11), (x + 8, y + 16), (x + 15, y + 6)], INK, 2.4)
        )
    parts.append(text(x + 28, y + 11, label or "Option", 14, "start"))
    return parts, 22


def wire_image(ctx, node, x, y, w):
    high = 90
    parts = [rect(x, y, w, high, SOFT, LINE, 1.6)]
    parts += [
        line(x, y, x + w, y + high, LINE, 1.2),
        line(x, y + high, x + w, y, LINE, 1.2),
    ]
    parts.append(
        text(x + w / 2, y + high / 2, node["text"] or "Image", 14, fill=MUTE, halo=True)
    )
    return parts, high


def wire_table(ctx, node, x, y, w):
    heads = words(node["text"]) or ["Column 1", "Column 2", "Column 3"]
    cell, row = w / len(heads), 28
    parts = [rect(x, y, w, row, tint(ctx.accent, 0.16), INK, 1.6)]
    for i, name in enumerate(heads):
        parts.append(
            text(x + i * cell + 10, y + row / 2, name, 14, "start", weight=700)
        )
    for r in range(1, 4):
        parts.append(rect(x, y + r * row, w, row, PAPER, LINE, 1.2))
        for i in range(len(heads)):
            parts.append(
                rect(
                    x + i * cell + 10,
                    y + r * row + 11,
                    cell * 0.5,
                    6,
                    "#dcdcd5",
                    "none",
                    0,
                    3,
                )
            )
    return parts, row * 4


def wire_nav(ctx, node, x, y, w):
    names = words(node["text"]) or ["Home", "About", "Contact"]
    parts = [rect(x, y, w, 34, SOFT, LINE, 1.6)]
    cursor = x + 14
    for i, name in enumerate(names):
        parts.append(
            text(cursor, y + 17, name, 14, "start", weight=700 if i == 0 else None)
        )
        if i == 0:
            parts.append(
                line(cursor, y + 28, cursor + span(name, 14), y + 28, ctx.accent, 2.4)
            )
        cursor += span(name, 14) + 26
    return parts, 34


def wire_link(ctx, node, x, y, w):
    label = node["text"] or "Link"
    parts = [text(x, y + 10, label, 14, "start", fill=ctx.accent)]
    parts.append(line(x, y + 19, x + span(label, 14), y + 19, ctx.accent, 1.4))
    return parts, 22


def wire_divider(ctx, node, x, y, w):
    return [line(x, y + 4, x + w, y + 4, LINE, 1.4)], 8


WIRE_DRAW = {
    "window": wire_window,
    "panel": wire_panel,
    "row": wire_row,
    "header": wire_header,
    "label": wire_label,
    "text": wire_text,
    "button": wire_button,
    "input": wire_input,
    "select": wire_select,
    "checkbox": wire_checkbox,
    "image": wire_image,
    "table": wire_table,
    "nav": wire_nav,
    "link": wire_link,
    "divider": wire_divider,
}


def draw_wire(ctx, node, x, y, w):
    return WIRE_DRAW[node["kind"]](ctx, node, x, y, w)


def build_wireframe(ctx):
    need(ctx, "wireframe needs an indented list, for example: window Login")
    root = read_wire(ctx)
    top = root["kids"]
    if len(top) == 1 and top[0]["kind"] == "window":
        node = top[0]
    else:
        node = {"kind": "window", "text": "", "kids": top}
    width = 440
    parts, high = wire_window(ctx, node, 10, 10, width)
    return drawn(width + 20, high + 20, parts)


TABLE_KEYS = FIGURE_KEYS | {"place", "style"}
ARRAY_KEYS = FIGURE_KEYS | {
    "highlight",
    "mark",
    "marked",
    "pointers",
    "pointer",
    "start",
    "from",
    "indices",
    "index",
    "name",
    "label",
}
LIST_KEYS = FIGURE_KEYS | {
    "doubly",
    "double",
    "doubly-linked",
    "circular",
    "circle",
    "ring",
    "head",
    "tail",
    "highlight",
    "mark",
    "marked",
    "start",
}
STACK_KEYS = FIGURE_KEYS | {"push", "pop", "capacity", "size"}
QUEUE_KEYS = FIGURE_KEYS | {"enqueue", "add", "dequeue", "remove", "capacity", "size"}
TREE_KEYS = FIGURE_KEYS | {
    "order",
    "from",
    "mode",
    "bst",
    "insert",
    "inserts",
    "highlight",
    "mark",
    "marked",
    "path",
    "traversal",
    "walk",
}
GRAPH_KEYS = FIGURE_KEYS | {
    "directed",
    "digraph",
    "layout",
    "matrix",
    "adjacency",
    "adjacency-matrix",
    "highlight",
    "mark",
    "marked",
    "path",
}
HASH_KEYS = FIGURE_KEYS | {"method", "collisions", "collision", "size"}
SORT_KEYS = FIGURE_KEYS | {"algorithm", "sort", "method", "steps", "show", "order"}
BIGO_KEYS = FIGURE_KEYS | {
    "show",
    "curves",
    "highlight",
    "emphasise",
    "max",
    "n",
    "ymax",
}
BINARY_KEYS = TABLE_KEYS | {
    "mode",
    "show",
    "from",
    "input",
    "to",
    "base",
    "bits",
    "signed",
}
TRACE_KEYS = TABLE_KEYS | {"highlight", "changes", "steps", "numbers"}
OSI_KEYS = TABLE_KEYS | {"model", "show", "columns", "highlight", "mark", "marked"}


class Kit:
    DIRS = {
        "array",
        "linkedlist",
        "linked-list",
        "stack",
        "queue",
        "bintree",
        "binary-tree",
        "binarytree",
        "graph",
        "hashtable",
        "hash-table",
        "sorting",
        "sort",
        "bigo",
        "big-o",
        "binary",
        "trace",
        "osi",
        "logic",
        "gates",
        "network",
        "topology",
        "wireframe",
        "mockup",
    }

    def dir_array(self, args, body, line):
        run(self, body, line, ARRAY_KEYS, build_array)

    def dir_linkedlist(self, args, body, line):
        run(self, body, line, LIST_KEYS, build_linkedlist)

    dir_linked_list = dir_linkedlist

    def dir_stack(self, args, body, line):
        run(self, body, line, STACK_KEYS, build_stack)

    def dir_queue(self, args, body, line):
        run(self, body, line, QUEUE_KEYS, build_queue)

    def dir_bintree(self, args, body, line):
        run(self, body, line, TREE_KEYS, build_bintree)

    dir_binary_tree = dir_bintree
    dir_binarytree = dir_bintree

    def dir_graph(self, args, body, line):
        run(self, body, line, GRAPH_KEYS, build_graph)

    def dir_hashtable(self, args, body, line):
        run(self, body, line, HASH_KEYS, build_hashtable)

    dir_hash_table = dir_hashtable

    def dir_sorting(self, args, body, line):
        run(self, body, line, SORT_KEYS, build_sorting)

    dir_sort = dir_sorting

    def dir_bigo(self, args, body, line):
        run(self, body, line, BIGO_KEYS, build_bigo)

    dir_big_o = dir_bigo

    def dir_binary(self, args, body, line):
        run(self, body, line, BINARY_KEYS, build_binary)

    def dir_trace(self, args, body, line):
        run(self, body, line, TRACE_KEYS, build_trace)

    def dir_osi(self, args, body, line):
        run(self, body, line, OSI_KEYS, build_osi)

    def dir_logic(self, args, body, line):
        run(self, body, line, LOGIC_KEYS, build_logic)

    dir_gates = dir_logic

    def dir_network(self, args, body, line):
        run(self, body, line, NETWORK_KEYS, build_network)

    dir_topology = dir_network

    def dir_wireframe(self, args, body, line):
        run(self, body, line, WIRE_KEYS, build_wireframe)

    dir_mockup = dir_wireframe


LOGIC_KEYS = FIGURE_KEYS | {"inputs", "values", "set"}
NETWORK_KEYS = FIGURE_KEYS | {"topology", "type", "layout", "wireless", "wifi"}
WIRE_KEYS = FIGURE_KEYS
