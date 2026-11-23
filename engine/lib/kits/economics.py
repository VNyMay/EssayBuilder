import math
import re

from ..util import YES
from . import FIGURE_KEYS
from .drawing import (
    GREY,
    INK,
    PALETTE,
    WIDTH,
    Placer,
    accent_of,
    aliases,
    arrow,
    box,
    canvas,
    circle,
    line,
    n,
    number_of,
    parse_number,
    path,
    polygon,
    read,
    reject,
    settings,
    shade,
    show,
    text,
    tint,
    width_of,
)

FIGURE_NAMES = {key: key for key in FIGURE_KEYS}
AXES = {"x-label": ["x", "xlabel", "x axis"], "y-label": ["y", "ylabel", "y axis"]}
MARKET = {
    "demand": ["demand shift", "d shift", "d"],
    "supply": ["supply shift", "s shift", "s"],
    "tax": ["indirect tax", "per unit tax"],
    "subsidy": ["per unit subsidy"],
    "ceiling": ["price ceiling", "max price", "maximum price"],
    "floor": ["price floor", "min price", "minimum price"],
    "surplus": ["surpluses", "show surplus", "welfare"],
    **AXES,
}
MARKET_NAMES = aliases(MARKET) | FIGURE_NAMES
MARKET_KEYS = set(MARKET_NAMES)
ADAS = {
    "ad": ["aggregate demand", "demand"],
    "sras": ["short run supply", "as", "supply"],
    "lras": ["long run supply", "potential", "growth"],
    "lras-line": ["long run line"],
    **AXES,
}
ADAS_NAMES = aliases(ADAS) | FIGURE_NAMES
ADAS_KEYS = set(ADAS_NAMES)
PPC = {
    "x-max": ["xmax", "max-x", "x intercept"],
    "y-max": ["ymax", "max-y", "y intercept"],
    "shape": ["curve", "opportunity cost"],
    "growth": ["economic growth", "shift"],
    "growth-x": ["growth x"],
    "growth-y": ["growth y"],
    **AXES,
}
PPC_NAMES = aliases(PPC) | FIGURE_NAMES
PPC_KEYS = set(PPC_NAMES)
EXTERNALITY = {
    "type": ["kind", "externality"],
    "gap": ["size", "external cost", "external benefit"],
    **AXES,
}
EXTERNALITY_NAMES = aliases(EXTERNALITY) | FIGURE_NAMES
EXTERNALITY_KEYS = set(EXTERNALITY_NAMES)
LORENZ_KEYS = FIGURE_KEYS | {"areas", "gini"}

UP = {"right", "increase", "up", "rise", "outward", "out", "more", "grow", "yes"}
DOWN = {"left", "decrease", "down", "fall", "inward", "in", "less", "shrink"}
STEP = 12.0
GOLD, GREEN = PALETTE[2], PALETTE[1]
DARK = "#3a3a3a"
HALO = {"stroke": "#ffffff", "stroke_width": 3.5, "paint_order": "stroke"}


def sub(label, size=11.0):
    base, _, small = label.partition("_")
    if not small:
        return label
    return f'{base}<tspan font-size="{n(size * 0.72)}" dy="{n(size * 0.28)}">{small}</tspan>'


def flat(label):
    return label.replace("_", "")


def shift_of(value, report, where, name):
    word = value.strip().lower()
    if word in UP:
        return STEP
    if word in DOWN:
        return -STEP
    if word in {"no", "none", "0"}:
        return 0.0
    number = parse_number(word)
    if number is None:
        report.error(where, f"'{name}' must be right, left or a number, not '{value}'")
        return 0.0
    return number


def linear(a, b):
    return ("lin", a, b)


def vertical(q):
    return ("vert", q, 0.0)


def price_at(curve, q):
    return curve[1] + curve[2] * q


def quantity_at(curve, p):
    return curve[1] if curve[0] == "vert" else (p - curve[1]) / curve[2]


def shift_q(curve, amount):
    if curve[0] == "vert":
        return vertical(curve[1] + amount)
    return linear(curve[1] - curve[2] * amount, curve[2])


def shift_p(curve, amount):
    return linear(curve[1] + amount, curve[2])


def meet(first, second):
    if first[0] == "vert":
        return first[1], price_at(second, first[1])
    if second[0] == "vert":
        return second[1], price_at(first, second[1])
    q = (second[1] - first[1]) / (first[2] - second[2])
    return q, price_at(first, q)


def clip(curve, xmax, ymax):
    if curve[0] == "vert":
        return (curve[1], 0.0), (curve[1], ymax)
    a, b = curve[1], curve[2]
    low, high = 0.0, xmax
    if b > 0:
        low, high = max(low, -a / b), min(high, (ymax - a) / b)
    elif b < 0:
        low, high = max(low, (ymax - a) / b), min(high, -a / b)
    if high <= low:
        return None
    return (low, a + b * low), (high, a + b * high)


def truth(value):
    return str(value).strip().lower() in YES or str(value).strip().lower() == ""


class Plot:
    def __init__(self, accent, xlabel, ylabel, xmax=100.0, ymax=100.0):
        self.accent = accent
        self.xmax, self.ymax = xmax, ymax
        self.left, self.top, self.right, self.bottom = 58.0, 26.0, 455.0, 296.0
        self.parts = []
        self.placer = Placer(0, 0, WIDTH, self.bottom + 40)
        self.xlabel, self.ylabel = xlabel, ylabel

    def x(self, q):
        return self.left + q / self.xmax * (self.right - self.left)

    def y(self, p):
        return self.bottom - p / self.ymax * (self.bottom - self.top)

    def poly(self, points, fill, stroke="none"):
        shown = [(self.x(q), self.y(p)) for q, p in points]
        self.parts.append(polygon(shown, fill, stroke, 0.8))

    def axes(self):
        self.parts.append(
            arrow(self.left, self.bottom, self.right + 8, self.bottom, INK, 1.4)
        )
        self.parts.append(
            arrow(self.left, self.bottom, self.left, self.top - 8, INK, 1.4)
        )
        self.parts.append(
            text(self.left + 8, self.top - 6, self.ylabel, 11.5, weight="bold")
        )
        self.parts.append(
            text(self.right + 8, self.bottom + 32, self.xlabel, 11.5, "end", "bold")
        )
        self.placer.block(
            self.left,
            self.top - 20,
            self.left + width_of(self.ylabel, 11.5, True) + 14,
            self.top - 2,
        )

    def curve(self, curve, label, colour, sw=2.3, dash=None):
        ends = clip(curve, self.xmax, self.ymax)
        if ends is None:
            return
        (q0, p0), (q1, p1) = ends
        self.parts.append(
            line(self.x(q0), self.y(p0), self.x(q1), self.y(p1), colour, sw, dash)
        )
        if label:
            self.tag(q1, p1, label, colour)

    def tag(self, q, p, label, colour=INK, radius=3.0):
        w = width_of(flat(label), 11.5, True) + 3
        spot = None
        x, y = self.x(q), self.y(p)
        for rect, tx, anchor, ty in self.placer.spots(x, y, radius, w, 14.5, 11.5):
            spot = spot or (rect, tx, anchor, ty)
            if self.placer.free(rect):
                spot = (rect, tx, anchor, ty)
                break
        rect, tx, anchor, ty = spot
        self.placer.rects.append(rect)
        self.parts.append(
            text(tx, ty, sub(label, 11.5), 11.5, anchor, "bold", colour, raw=True)
        )

    def guide(self, q, p, q_label="", p_label="", colour=GREY, upto=None):
        top = self.y(p if upto is None else upto)
        self.parts.append(
            line(self.left, self.y(p), self.x(q), self.y(p), colour, 1, "4 3")
        )
        self.parts.append(
            line(self.x(q), top, self.x(q), self.bottom, colour, 1, "4 3")
        )
        if q_label:
            self.parts.append(
                text(
                    self.x(q),
                    self.bottom + 15,
                    sub(q_label, 10.5),
                    10.5,
                    "middle",
                    fill=INK,
                    raw=True,
                )
            )
        if p_label:
            self.parts.append(
                text(
                    self.left - 6,
                    self.y(p) + 4,
                    sub(p_label, 10.5),
                    10.5,
                    "end",
                    fill=INK,
                    raw=True,
                )
            )

    def dot(self, q, p, label="", colour=INK):
        self.parts.append(circle(self.x(q), self.y(p), 4.2, colour, "#ffffff", 1.3))
        self.placer.block(self.x(q) - 6, self.y(p) - 6, self.x(q) + 6, self.y(p) + 6)
        if label:
            self.tag(q, p, label, colour, 7)

    def note(self, q, p, label, colour=INK, size=10.5, anchor="middle", weight="bold"):
        self.parts.append(
            text(self.x(q), self.y(p) + 4, label, size, anchor, weight, colour, **HALO)
        )

    def shaded_label(self, q, p, label, colour):
        self.parts.append(
            text(self.x(q), self.y(p) + 4, label, 10.5, "middle", "bold", colour)
        )

    def done(self):
        return canvas(self.bottom + 42, self.parts)


def base_curves():
    return linear(90.0, -0.8), linear(10.0, 0.8)


def draw_market(opts_values, report, where, accent):
    demand, supply = base_curves()
    d_shift = (
        shift_of(opts_values["demand"], report, where, "demand")
        if "demand" in opts_values
        else 0.0
    )
    s_shift = (
        shift_of(opts_values["supply"], report, where, "supply")
        if "supply" in opts_values
        else 0.0
    )
    tax = number_of(opts_values, "tax", report, where, 0.0) - number_of(
        opts_values, "subsidy", report, where, 0.0
    )
    plot = Plot(
        accent,
        opts_values.get("x-label", "Quantity"),
        opts_values.get("y-label", "Price"),
    )
    d2 = shift_q(demand, d_shift) if d_shift else demand
    s2 = shift_q(supply, s_shift) if s_shift else supply
    moved = bool(d_shift or s_shift)
    start = meet(demand, supply)
    end = meet(d2, s2)
    final_supply = shift_p(s2, tax) if tax else s2
    final = meet(d2, final_supply)
    deep = shade(accent, 0.3)
    surplus = truth(opts_values["surplus"]) if "surplus" in opts_values else False
    if surplus:
        draw_surplus(plot, d2, s2, tax, end, final, accent)
    plot.axes()
    plot.curve(demand, "D_1" if d_shift else "D", accent)
    plot.curve(supply, "S_1" if s_shift else "S", DARK)
    if d_shift:
        plot.curve(d2, "D_2", deep, 2.3, "7 3")
    if s_shift:
        plot.curve(s2, "S_2", GREY, 2.3, "7 3")
    if tax:
        plot.curve(final_supply, "S+tax" if tax > 0 else "S+subsidy", GOLD, 2.3, "7 3")
    numbered = moved or tax
    q_name, p_name = ("Q_1", "P_1") if numbered else ("Q_e", "P_e")
    plot.guide(start[0], start[1], q_name, p_name, GREY)
    plot.dot(*start, "E_1" if numbered else "E")
    if moved:
        plot.guide(end[0], end[1], "Q_2", "P_2", GREY)
        plot.dot(*end, "E_2")
    if tax:
        draw_tax_guides(plot, final, tax)
        if surplus:
            plot.tag(max(final[0], end[0]), end[1], "DWL", DARK, 10)
    if "ceiling" in opts_values or "floor" in opts_values:
        draw_control(
            plot,
            opts_values,
            demand if not moved else d2,
            supply if not moved else s2,
            end,
            report,
            where,
            accent,
        )
    return plot.done()


def draw_surplus(plot, demand, supply, tax, free, final, accent):
    cs_colour, ps_colour = tint(accent, 0.75), tint(GOLD, 0.7)
    d0, s0 = min(price_at(demand, 0), plot.ymax), max(price_at(supply, 0), 0.0)
    q, p = final if tax else free
    pay = price_at(demand, q)
    got = price_at(supply, q)
    plot.poly([(0, d0), (q, pay), (0, pay)], cs_colour)
    plot.poly([(0, got), (q, got), (0, s0)], ps_colour)
    plot.shaded_label(q * 0.28, (d0 + pay * 2) / 3, "CS", shade(accent, 0.4))
    plot.shaded_label(q * 0.28, (s0 + got * 2) / 3, "PS", shade(GOLD, 0.45))
    if tax:
        fiscal = tint(GREEN, 0.65)
        plot.poly([(0, pay), (q, pay), (q, got), (0, got)], fiscal)
        plot.poly([(q, pay), (free[0], free[1]), (q, got)], "#cfcfcf", "#9a9a9a")
        plot.shaded_label(
            q / 2,
            (pay + got) / 2,
            "Tax revenue" if tax > 0 else "Subsidy cost",
            shade(GREEN, 0.45),
        )


def draw_tax_guides(plot, final, tax):
    q, pay = final
    plot.parts.append(
        line(plot.left, plot.y(pay), plot.x(q), plot.y(pay), GOLD, 1, "4 3")
    )
    plot.parts.append(
        line(plot.left, plot.y(pay - tax), plot.x(q), plot.y(pay - tax), GOLD, 1, "4 3")
    )
    plot.parts.append(
        line(plot.x(q), plot.y(pay), plot.x(q), plot.bottom, GOLD, 1, "4 3")
    )
    plot.parts.append(
        text(plot.left - 6, plot.y(pay) + 4, sub("P_c", 10.5), 10.5, "end", raw=True)
    )
    plot.parts.append(
        text(
            plot.left - 6,
            plot.y(pay - tax) + 4,
            sub("P_p", 10.5),
            10.5,
            "end",
            raw=True,
        )
    )
    plot.parts.append(
        text(plot.x(q), plot.bottom + 15, sub("Q_t", 10.5), 10.5, "middle", raw=True)
    )


def draw_control(plot, values, demand, supply, eq, report, where, accent):
    kind = "ceiling" if "ceiling" in values else "floor"
    raw = values[kind].strip().lower()
    price = (
        eq[1] * (0.65 if kind == "ceiling" else 1.35)
        if raw in {"", "yes", "on"}
        else parse_number(raw)
    )
    if price is None or not 0 < price < plot.ymax:
        report.error(where, f"'{kind}' must be a price between 0 and 100 (or yes)")
        return
    if (kind == "ceiling") != (price < eq[1]):
        report.warn(
            where,
            f"the price {kind} is {'above' if kind == 'ceiling' else 'below'} the equilibrium price, so it has no effect",
        )
    colour = shade(accent, 0.2)
    plot.parts.append(
        line(plot.left, plot.y(price), plot.x(plot.xmax), plot.y(price), colour, 2)
    )
    plot.parts.append(
        text(
            plot.left + 8,
            plot.y(price) - 6,
            f"Price {kind}",
            10.5,
            weight="bold",
            fill=colour,
            **HALO,
        )
    )
    q_demand, q_supply = quantity_at(demand, price), quantity_at(supply, price)
    for q, name in ((q_demand, "Q_d"), (q_supply, "Q_s")):
        plot.parts.append(
            line(plot.x(q), plot.y(price), plot.x(q), plot.bottom, colour, 1, "4 3")
        )
        plot.parts.append(
            text(plot.x(q), plot.bottom + 15, sub(name, 10.5), 10.5, "middle", raw=True)
        )
    plot.parts.append(
        text(
            plot.left - 6,
            plot.y(price) + 4,
            sub("P_c" if kind == "ceiling" else "P_f", 10.5),
            10.5,
            "end",
            raw=True,
        )
    )
    low, high = sorted((q_demand, q_supply))
    gap = "Shortage" if q_demand > q_supply else "Surplus"
    mid = (plot.x(low) + plot.x(high)) / 2
    if high - low > 3:
        plot.parts.append(
            arrow(
                plot.x(low) + 2,
                plot.y(price) + 12,
                plot.x(high) - 2,
                plot.y(price) + 12,
                colour,
                1.2,
                5,
            )
        )
        plot.parts.append(
            arrow(
                plot.x(high) - 2,
                plot.y(price) + 12,
                plot.x(low) + 2,
                plot.y(price) + 12,
                colour,
                1.2,
                5,
            )
        )
        plot.parts.append(
            text(mid, plot.y(price) + 26, gap, 10.5, "middle", "bold", colour, **HALO)
        )


def draw_adas(values, report, where, accent):
    ad1, sras1, lras1 = linear(90.0, -0.8), linear(10.0, 0.8), vertical(50.0)
    shifts = {
        k: shift_of(values[k], report, where, k) if k in values else 0.0
        for k in ("ad", "sras", "lras")
    }
    ad2 = shift_q(ad1, shifts["ad"]) if shifts["ad"] else ad1
    sras2 = shift_q(sras1, shifts["sras"]) if shifts["sras"] else sras1
    lras2 = shift_q(lras1, shifts["lras"]) if shifts["lras"] else lras1
    plot = Plot(
        accent, values.get("x-label", "Real GDP"), values.get("y-label", "Price level")
    )
    deep = shade(accent, 0.3)
    plot.axes()
    show_lras = truth(values["lras-line"]) if "lras-line" in values else True
    plot.curve(ad1, "AD_1" if shifts["ad"] else "AD", accent)
    plot.curve(sras1, "SRAS_1" if shifts["sras"] else "SRAS", DARK)
    if show_lras:
        plot.curve(lras1, "LRAS_1" if shifts["lras"] else "LRAS", GOLD)
    if shifts["ad"]:
        plot.curve(ad2, "AD_2", deep, 2.3, "7 3")
    if shifts["sras"]:
        plot.curve(sras2, "SRAS_2", GREY, 2.3, "7 3")
    if shifts["lras"] and show_lras:
        plot.curve(lras2, "LRAS_2", GOLD, 2.3, "7 3")
    moved = any(shifts.values())
    start = meet(ad1, sras1)
    end = meet(ad2, sras2)
    if show_lras and not moved:
        plot.guide(start[0], start[1], "Y_f", "P_e", GREY)
        plot.dot(*start, "E")
        return plot.done()
    plot.guide(start[0], start[1], "Y_1", "P_1", GREY)
    plot.dot(*start, "E_1")
    if moved and (end[0] != start[0] or end[1] != start[1]):
        plot.guide(end[0], end[1], "Y_2", "P_2", GREY)
        plot.dot(*end, "E_2")
    if show_lras and abs(end[0] - lras2[1]) > 1.5:
        inflation = end[0] > lras2[1]
        low, high = sorted((end[0], lras2[1]))
        y = plot.y(end[1]) - 14
        plot.parts.append(arrow(plot.x(low), y, plot.x(high), y, deep, 1.2, 5))
        plot.parts.append(arrow(plot.x(high), y, plot.x(low), y, deep, 1.2, 5))
        gap = "Inflationary gap" if inflation else "Recessionary gap"
        plot.parts.append(
            text(plot.x(high) + 34, y + 4, gap, 10.5, weight="bold", fill=deep, **HALO)
        )
    return plot.done()


def ppc_path(plot, xm, ym, power, colour, dash=None, sw=2.4):
    points = []
    for k in range(61):
        t = math.pi / 2 * k / 60
        c, s = math.cos(t), math.sin(t)
        points.append((xm * c ** (2 / power), ym * s ** (2 / power)))
    for q, p in points:
        plot.placer.block(plot.x(q) - 4, plot.y(p) - 4, plot.x(q) + 4, plot.y(p) + 4)
    commands = "M" + " L".join(f"{n(plot.x(q))},{n(plot.y(p))}" for q, p in points)
    plot.parts.append(path(commands, "none", colour, sw, dash))
    return points


def draw_ppc(values, points, report, where, accent):
    xm = number_of(values, "x-max", report, where, 100.0)
    ym = number_of(values, "y-max", report, where, 100.0)
    shape = values.get("shape", "curved").strip().lower()
    power = 1.0 if shape in {"straight", "constant", "linear"} else 2.0
    both = values.get("growth")
    gx, gy = 0.0, 0.0
    if both is not None:
        gx = gy = percent(both, 0.2, report, where)
    if "growth-x" in values:
        gx = percent(values["growth-x"], 0.2, report, where)
    if "growth-y" in values:
        gy = percent(values["growth-y"], 0.2, report, where)
    xm2, ym2 = xm * (1 + gx), ym * (1 + gy)
    xs = [xm2, *(p[1] for p in points)]
    ys = [ym2, *(p[2] for p in points)]
    plot = Plot(
        accent,
        values.get("x-label", "Good X"),
        values.get("y-label", "Good Y"),
        max(xs) * 1.1,
        max(ys) * 1.12,
    )
    plot.axes()
    grown = gx or gy
    deep = shade(accent, 0.3)
    ppc_path(plot, xm, ym, power, accent)
    angle = math.radians(60)
    spot = (xm * math.cos(angle) ** (2 / power), ym * math.sin(angle) ** (2 / power))
    label_x, label_y = plot.x(spot[0]), plot.y(spot[1])
    if grown:
        plot.parts.append(
            text(
                label_x - 9,
                label_y + 14,
                sub("PPC_1", 11.5),
                11.5,
                "end",
                "bold",
                accent,
                raw=True,
            )
        )
        plot.placer.block(label_x - 50, label_y + 2, label_x - 6, label_y + 20)
        ppc_path(plot, xm2, ym2, power, deep, "7 3")
        far = (
            xm2 * math.cos(angle) ** (2 / power),
            ym2 * math.sin(angle) ** (2 / power),
        )
        plot.parts.append(
            text(
                plot.x(far[0]) + 9,
                plot.y(far[1]) - 4,
                sub("PPC_2", 11.5),
                11.5,
                "start",
                "bold",
                deep,
                raw=True,
            )
        )
        plot.placer.block(
            plot.x(far[0]) + 6, plot.y(far[1]) - 18, plot.x(far[0]) + 50, plot.y(far[1])
        )
        mid = math.radians(40)
        a = (xm * math.cos(mid) ** (2 / power), ym * math.sin(mid) ** (2 / power))
        b = (xm2 * math.cos(mid) ** (2 / power), ym2 * math.sin(mid) ** (2 / power))
        plot.parts.append(
            arrow(plot.x(a[0]), plot.y(a[1]), plot.x(b[0]), plot.y(b[1]), GREY, 1.2, 5)
        )
    else:
        plot.parts.append(
            text(label_x + 9, label_y - 4, "PPC", 11.5, "start", "bold", accent)
        )
        plot.placer.block(label_x + 6, label_y - 18, label_x + 40, label_y)
    if "x-max" in values:
        plot.parts.append(
            text(plot.x(xm), plot.bottom + 15, f"{xm:g}", 10.5, "middle", fill=GREY)
        )
    if "y-max" in values:
        plot.parts.append(
            text(plot.left - 6, plot.y(ym) + 4, f"{ym:g}", 10.5, "end", fill=GREY)
        )
    for name, px, py in points:
        status = (px / xm) ** power + (py / ym) ** power
        if status > 1.02:
            plot.parts.append(
                box(plot.x(px) - 4, plot.y(py) - 4, 8, 8, "#ffffff", INK, 1.6)
            )
            note = "unattainable"
        elif status < 0.98:
            plot.parts.append(circle(plot.x(px), plot.y(py), 4.5, "#ffffff", INK, 1.6))
            note = "inefficient"
        else:
            plot.parts.append(circle(plot.x(px), plot.y(py), 4.5, INK, "#ffffff", 1.2))
            note = ""
        plot.placer.block(
            plot.x(px) - 6, plot.y(py) - 6, plot.x(px) + 6, plot.y(py) + 6
        )
        label = f"{name} ({note})" if note else name
        plot.tag(px, py, label, INK, 7)
    return plot.done()


def percent(value, default, report, where):
    word = value.strip().lower()
    if word in {"yes", "on", "true", ""}:
        return default
    if word in {"no", "off", "none"}:
        return 0.0
    number = parse_number(word)
    if number is None:
        report.error(where, f"growth must be a percentage such as 20%, not '{value}'")
        return 0.0
    return number / 100 if "%" in word or number > 1 else number


def point_lines(others, report):
    points = []
    for ln in others:
        name, colon, content = ln.text.strip().partition(":")
        parts = [parse_number(p) for p in re.split(r"[,\s]+", content.strip()) if p]
        if not colon or len(parts) != 2 or None in parts:
            report.error(
                ln.where,
                f"cannot read '{ln.text.strip()[:40]}' (write a point as 'A: 40, 80')",
            )
            continue
        points.append((name.strip(), parts[0], parts[1]))
    return points


KINDS = {
    "negative production": ("supply", -1),
    "positive production": ("supply", 1),
    "negative consumption": ("demand", -1),
    "positive consumption": ("demand", 1),
}
KIND_WORDS = {"negative": "negative production", "positive": "positive consumption"}


def draw_externality(kind, gap, values, accent):
    demand, supply = base_curves()
    side, sign = KINDS[kind]
    social = (
        shift_p(supply, -sign * gap)
        if side == "supply"
        else shift_p(demand, sign * gap)
    )
    plot = Plot(
        accent,
        values.get("x-label", "Quantity"),
        values.get("y-label", "Price / cost / benefit"),
    )
    market = meet(demand, supply)
    if side == "supply":
        optimum = meet(demand, social)
        other = price_at(social, market[0])
    else:
        optimum = meet(social, supply)
        other = price_at(social, market[0])
    plot.poly(
        [(optimum[0], optimum[1]), (market[0], other), (market[0], market[1])],
        "#d4d4d4",
        "#9a9a9a",
    )
    plot.axes()
    if side == "supply":
        d_name, s_name, social_name = "MPB = MSB", "MPC", "MSC"
        plot.curve(demand, d_name, accent)
        plot.curve(supply, s_name, DARK)
        plot.curve(social, social_name, GOLD)
    else:
        plot.curve(demand, "MPB", accent)
        plot.curve(supply, "MPC = MSC", DARK)
        plot.curve(social, "MSB", GOLD)
    plot.guide(market[0], market[1], "Q_m", "P_m", GREY)
    plot.guide(optimum[0], optimum[1], "Q_o", "P_o", GREY)
    plot.dot(*market, "")
    plot.dot(*optimum, "")
    mid_p = (market[1] + optimum[1] + other) / 3
    plot.note(max(market[0], optimum[0]) + 4, mid_p, "Welfare loss", INK, 10.5, "start")
    return plot.done()


def lorenz_shares(content, report, where):
    values = [
        parse_number(p) for p in re.split(r"\s*[,;]\s*", content.strip()) if p.strip()
    ]
    if len(values) < 2 or None in values or any(v < 0 for v in values):
        report.error(
            where,
            "give the income shares as numbers, poorest group first (write 'A: 5, 9, 14, 22, 50')",
        )
        return None
    total = sum(values)
    if abs(total - 100) > 1 and abs(total - 1) > 0.01:
        report.warn(
            where, f"the shares add up to {total:g}, so they are rescaled to 100%"
        )
    if values != sorted(values):
        report.warn(
            where,
            "shares must run from the poorest group to the richest, so they were sorted",
        )
        values = sorted(values)
    return [v / total * 100 for v in values]


def gini_of(shares):
    count = len(shares)
    cumulative = [0.0]
    for share in shares:
        cumulative.append(cumulative[-1] + share)
    area = (
        sum((cumulative[i] + cumulative[i + 1]) / 2 for i in range(count)) / count / 100
    )
    return 1 - 2 * area, cumulative


def draw_lorenz(series, accent, areas, show_gini):
    left, top, size = 62.0, 18.0, 290.0
    bottom = top + size
    colours = [accent, GOLD, GREEN, PALETTE[3]]
    dashes = [None, "7 3", "2 3", "10 3 2 3"]
    parts = []

    def px(v):
        return left + v / 100 * size

    def py(v):
        return bottom - v / 100 * size

    single = len(series) == 1
    if single and areas:
        cumulative = series[0]["cumulative"]
        curve = [
            (px(i / (len(cumulative) - 1) * 100), py(c))
            for i, c in enumerate(cumulative)
        ]
        parts.append(
            polygon(
                [(px(0), py(0)), (px(100), py(100)), *reversed(curve[1:-1])],
                tint(accent, 0.8),
            )
        )
        parts.append(
            polygon([(px(0), py(0)), *curve, (px(100), py(0))], tint(GOLD, 0.78))
        )
    for value in range(0, 101, 20):
        parts.append(line(px(value), top, px(value), bottom, "#e6e6e6", 0.7))
        parts.append(line(left, py(value), left + size, py(value), "#e6e6e6", 0.7))
        parts.append(
            text(px(value), bottom + 15, f"{value}", 10.5, "middle", fill=GREY)
        )
        parts.append(text(left - 7, py(value) + 4, f"{value}", 10.5, "end", fill=GREY))
    parts.append(box(left, top, size, size, "none", INK, 1.2))
    parts.append(line(px(0), py(0), px(100), py(100), GREY, 1.6, "5 3"))
    parts.append(
        text(
            left + size / 2,
            bottom + 34,
            "Cumulative % of population",
            11.5,
            "middle",
            "bold",
        )
    )
    parts.append(
        text(
            16,
            top + size / 2,
            "Cumulative % of income",
            11.5,
            "middle",
            "bold",
            transform=f"rotate(-90 16 {n(top + size / 2)})",
        )
    )
    parts.append(
        text(
            px(66),
            py(76),
            "Line of equality",
            10.5,
            "middle",
            fill=GREY,
            transform=f"rotate(-45 {n(px(66))} {n(py(76))})",
        )
    )
    if single and areas:
        parts.append(
            text(px(30), py(66), "A", 15, "middle", "bold", shade(accent, 0.4))
        )
        parts.append(text(px(72), py(24), "B", 15, "middle", "bold", shade(GOLD, 0.45)))
    for k, item in enumerate(series):
        colour, dash = colours[k % 4], dashes[k % 4]
        cumulative = item["cumulative"]
        count = len(cumulative) - 1
        points = [(px(i / count * 100), py(c)) for i, c in enumerate(cumulative)]
        commands = "M" + " L".join(f"{n(x)},{n(y)}" for x, y in points)
        parts.append(path(commands, "none", colour, 2.4, dash))
        for x, y in points[1:-1]:
            parts.append(circle(x, y, 3, colour, "#ffffff", 1.2))
    legend_x, y = left + size + 28, top + 16
    for k, item in enumerate(series):
        colour, dash = colours[k % 4], dashes[k % 4]
        parts.append(line(legend_x, y - 4, legend_x + 26, y - 4, colour, 2.4, dash))
        parts.append(text(legend_x + 32, y, item["name"], 11, weight="bold"))
        if show_gini:
            parts.append(
                text(
                    legend_x + 32, y + 14, f"Gini = {item['gini']:.2f}", 10.5, fill=GREY
                )
            )
            y += 14
        y += 26
    if single and areas:
        parts.append(text(legend_x, y + 6, "Gini = A / (A + B)", 10.5, fill=GREY))
    return canvas(bottom + 44, parts)


class Kit:
    DIRS = {
        "supplydemand",
        "supply-demand",
        "market",
        "ppc",
        "ppf",
        "production-possibilities",
        "adas",
        "ad-as",
        "lorenz",
        "gini",
        "externality",
        "externalities",
    }

    def dir_supplydemand(self, args, body, line):
        opts, rest = read(self, body, line, MARKET_KEYS)
        values, others = settings(opts, rest, MARKET_NAMES)
        reject(others, MARKET_NAMES, self.report)
        show(
            self,
            opts,
            line,
            draw_market(values, self.report, line.where, accent_of(self)),
            MARKET_KEYS,
        )

    dir_supply_demand = dir_supplydemand
    dir_market = dir_supplydemand

    def dir_adas(self, args, body, line):
        opts, rest = read(self, body, line, ADAS_KEYS)
        values, others = settings(opts, rest, ADAS_NAMES)
        reject(others, ADAS_NAMES, self.report)
        show(
            self,
            opts,
            line,
            draw_adas(values, self.report, line.where, accent_of(self)),
            ADAS_KEYS,
        )

    dir_ad_as = dir_adas

    def dir_ppc(self, args, body, line):
        opts, rest = read(self, body, line, PPC_KEYS)
        values, others = settings(opts, rest, PPC_NAMES)
        points = point_lines(others, self.report)
        show(
            self,
            opts,
            line,
            draw_ppc(values, points, self.report, line.where, accent_of(self)),
            PPC_KEYS,
        )

    dir_ppf = dir_ppc
    dir_production_possibilities = dir_ppc

    def dir_externality(self, args, body, line):
        opts, rest = read(self, body, line, EXTERNALITY_KEYS)
        values, others = settings(opts, rest, EXTERNALITY_NAMES)
        reject(others, EXTERNALITY_NAMES, self.report)
        word = " ".join(
            values.get("type", "negative production").lower().replace("-", " ").split()
        )
        word = KIND_WORDS.get(word, word)
        if word not in KINDS:
            self.report.error(
                line.where,
                f"type must be one of: {', '.join(KINDS)} (or negative, positive)",
            )
            return
        gap = number_of(values, "gap", self.report, line.where, 20.0)
        show(
            self,
            opts,
            line,
            draw_externality(word, gap, values, accent_of(self)),
            EXTERNALITY_KEYS,
        )

    dir_externalities = dir_externality

    def dir_lorenz(self, args, body, line):
        opts, rest = read(self, body, line, LORENZ_KEYS)
        series = []
        for ln in rest:
            name, colon, content = ln.text.strip().partition(":")
            shares = lorenz_shares(content, self.report, ln.where) if colon else None
            if shares is None:
                if not colon:
                    self.report.error(
                        ln.where,
                        f"cannot read '{ln.text.strip()[:40]}' (write 'Country A: 5, 9, 14, 22, 50')",
                    )
                continue
            gini, cumulative = gini_of(shares)
            series.append(
                {"name": name.strip(), "cumulative": cumulative, "gini": gini}
            )
        if not series or len(series) > 4:
            self.report.error(
                line.where,
                "lorenz needs 1 to 4 lines such as 'Country A: 5, 9, 14, 22, 50'",
            )
            return
        markup = draw_lorenz(
            series, accent_of(self), opts.flag("areas", True), opts.flag("gini", True)
        )
        show(self, opts, line, markup, LORENZ_KEYS)

    dir_gini = dir_lorenz
