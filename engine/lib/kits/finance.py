import math
import re

from ..util import Options
from . import FIGURE_KEYS
from .drawing import (
    GREY,
    INK,
    accent_of,
    aliases,
    box,
    canvas,
    circle,
    fmt,
    keep_apart,
    line,
    lines_of_text,
    n,
    nice_step,
    number_of,
    parse_number,
    polygon,
    read,
    reject,
    settings,
    shade,
    show,
    text,
    ticks,
    tint,
    wrap,
)

TABLE_KEYS = {"caption", "id", "source", "width", "place", "wrap"}
FIGURE_NAMES = {key: key for key in FIGURE_KEYS}

BREAKEVEN = {
    "fixed": ["fixed costs", "fixed cost", "fc", "overheads"],
    "variable": ["variable cost", "variable costs", "variable cost per unit", "vc"],
    "price": ["selling price", "price per unit", "sp"],
    "output": ["units", "sales", "forecast", "expected sales", "expected output"],
    "max": ["maximum", "axis"],
    "currency": ["symbol"],
}
BREAKEVEN_NAMES = aliases(BREAKEVEN) | FIGURE_NAMES
BREAKEVEN_KEYS = set(BREAKEVEN_NAMES)

TREE = {"decision": ["title", "question"], "currency": ["symbol"]}
TREE_NAMES = aliases(TREE) | FIGURE_NAMES
TREE_KEYS = set(TREE_NAMES)

CASH = {
    "opening": ["opening balance", "opening cash", "start", "starting balance"],
    "months": ["periods", "columns", "headers", "period", "month"],
    "currency": ["symbol"],
}
CASH_NAMES = aliases(CASH) | {key: key for key in TABLE_KEYS}
CASH_KEYS = set(CASH_NAMES)
INFLOW = {
    "cash in",
    "inflows",
    "cash inflows",
    "receipts",
    "income",
    "sales",
    "revenue",
    "revenues",
}
OUTFLOW = {
    "cash out",
    "outflows",
    "cash outflows",
    "payments",
    "expenses",
    "costs",
    "spending",
}

APPRAISAL = {
    "investment": ["initial investment", "cost", "outlay", "initial cost", "capital"],
    "rate": [
        "discount rate",
        "discount",
        "interest rate",
        "interest",
        "cost of capital",
    ],
    "cashflows": [
        "cash flows",
        "returns",
        "net cash flow",
        "net cash flows",
        "inflows",
        "profits",
    ],
    "currency": ["symbol"],
}
APPRAISAL_NAMES = aliases(APPRAISAL) | {key: key for key in TABLE_KEYS}
APPRAISAL_KEYS = set(APPRAISAL_NAMES)

COST = re.compile(
    r"^(.*?)[\s,]*\(?\s*(?:cost|costs|invest|investment)\s*[:=]?\s*(\S+?)\s*\)?$", re.I
)
CHANCE = re.compile(r"^(.*?)[\s,]*\(?\s*(\d*\.?\d+\s*%?)\s*\)?$")


def draw_breakeven(fixed, variable, price, output, top, symbol, accent):
    margin = price - variable
    point = fixed / margin
    left, edge, bottom, head = 66.0, 420.0, 296.0, 14.0
    width, height = edge - left, bottom - head
    most = max(point * 2, output * 1.25 if output else 0)
    step = nice_step(most, 5)
    most = top or math.ceil(most / step) * step
    ceiling = max(price * most, fixed + variable * most) * 1.04

    def px(units):
        return left + units / most * width

    def py(value):
        return bottom - value / ceiling * height

    revenue, cost = lambda q: price * q, lambda q: fixed + variable * q
    deep = shade(accent, 0.3)
    parts = [
        polygon(
            [(px(0), py(0)), (px(0), py(fixed)), (px(point), py(revenue(point)))],
            "#e9e9e9",
        ),
        polygon(
            [
                (px(point), py(revenue(point))),
                (px(most), py(cost(most))),
                (px(most), py(revenue(most))),
            ],
            tint(accent, 0.82),
        ),
    ]
    for value in ticks(0, most, 5):
        parts.append(line(px(value), bottom, px(value), bottom + 4, INK, 1))
        parts.append(
            text(px(value), bottom + 17, fmt(value), 10.5, "middle", fill=GREY)
        )
    for value in ticks(0, ceiling, 5):
        parts.append(line(left - 4, py(value), left, py(value), INK, 1))
        parts.append(line(left, py(value), edge, py(value), "#ececec", 0.6))
        parts.append(
            text(left - 7, py(value) + 4, fmt(value, symbol), 10.5, "end", fill=GREY)
        )
    parts.append(line(left, head, left, bottom, INK, 1.2))
    parts.append(line(left, bottom, edge, bottom, INK, 1.2))
    parts.append(line(px(0), py(fixed), px(most), py(fixed), GREY, 1.6, "5 3"))
    parts.append(line(px(0), py(0), px(most), py(revenue(most)), accent, 2.4))
    parts.append(line(px(0), py(fixed), px(most), py(cost(most)), "#3a3a3a", 2.4))
    names = [
        (py(revenue(most)), "Revenue", accent),
        (py(cost(most)), "Total costs", "#3a3a3a"),
        (py(fixed), "Fixed costs", GREY),
    ]
    spread = keep_apart([y for y, _, _ in names], 14, head + 6, bottom)
    for (y, label, colour), place in zip(names, spread):
        parts.append(text(edge + 6, place + 4, label, 11, weight="bold", fill=colour))
    bx, by = px(point), py(revenue(point))
    parts.append(line(bx, by, bx, bottom, deep, 1, "4 3"))
    parts.append(line(left, by, bx, by, deep, 1, "4 3"))
    parts.append(circle(bx, by, 4.5, INK, "#ffffff", 1.4))
    whole = math.ceil(point - 1e-9)
    halo = {"stroke": "#ffffff", "stroke_width": 3.5, "paint_order": "stroke"}
    parts.append(text(bx - 12, by - 36, "Break-even", 11, "end", "bold", deep, **halo))
    parts.append(
        text(bx - 12, by - 23, f"{fmt(whole)} units", 11, "end", fill=deep, **halo)
    )
    parts.append(
        text(
            bx - 12,
            by - 10,
            fmt(revenue(point), symbol, decimals=0),
            11,
            "end",
            fill=deep,
            **halo,
        )
    )
    early = point * 0.3
    parts.append(
        text(
            px(early),
            py((revenue(early) + cost(early)) / 2) + 4,
            "Loss",
            11.5,
            "middle",
            "bold",
            GREY,
            **halo,
        )
    )
    mid = (point + most) / 2
    parts.append(
        text(
            px(mid),
            py((revenue(mid) + cost(mid)) / 2) + 4,
            "Profit",
            11.5,
            "middle",
            "bold",
            deep,
        )
    )
    title = bottom + (58 if output else 44)
    parts.append(
        text((left + edge) / 2, title, "Output (units)", 11.5, "middle", "bold")
    )
    parts.append(
        text(
            14,
            (head + bottom) / 2,
            "Costs and revenue",
            11.5,
            "middle",
            "bold",
            transform=f"rotate(-90 14 {n((head + bottom) / 2)})",
        )
    )
    summary = f"Contribution per unit {fmt(margin, symbol)}   |   Break-even {fmt(whole)} units"
    total = title + 18
    if output:
        safe = output - point
        parts.append(
            line(px(output), py(revenue(output)), px(output), bottom, accent, 1, "4 3")
        )
        parts.append(
            circle(px(output), py(revenue(output)), 3.5, accent, "#ffffff", 1.2)
        )
        summary += f"   |   Margin of safety {fmt(math.floor(safe + 1e-9))} units ({safe / output * 100:.0f}%)"
        parts.append(line(px(point), bottom + 28, px(output), bottom + 28, deep, 1.2))
        for x, direction in ((px(point), 1), (px(output), -1)):
            parts.append(
                polygon(
                    [
                        (x, bottom + 28),
                        (x + 5 * direction, bottom + 25),
                        (x + 5 * direction, bottom + 31),
                    ],
                    deep,
                )
            )
        parts.append(
            text(
                (px(point) + px(output)) / 2,
                bottom + 41,
                "Margin of safety",
                10,
                "middle",
                None,
                deep,
            )
        )
    parts.append(text(WIDTH_MID, total + 8, summary, 10.5, "middle", fill=INK))
    return canvas(total + 16, parts)


WIDTH_MID = 260.0


def tree_lines(rest, report):
    options = []
    for ln in rest:
        raw = ln.text.rstrip()
        stripped = raw.strip()
        name, colon, value = stripped.rpartition(":")
        if not colon:
            name, value = stripped, ""
        if raw[:1] in (" ", "\t") and options:
            outcome = parse_outcome(name.strip(), value.strip(), report, ln.where)
            if outcome:
                options[-1]["outcomes"].append(outcome)
            continue
        cost, label = 0.0, name.strip()
        match = COST.match(label)
        if match and match.group(1).strip():
            label, cost = match.group(1).strip(), parse_number(match.group(2)) or 0.0
        pay = parse_number(value) if value.strip() else None
        if value.strip() and pay is None:
            report.error(ln.where, f"cannot read the payoff '{value.strip()}'")
            continue
        options.append(
            {"name": label, "cost": cost, "pay": pay, "outcomes": [], "ln": ln}
        )
    return options


def parse_outcome(left, value, report, where):
    pay = parse_number(value)
    match = CHANCE.match(left)
    if pay is None or not match or not match.group(1).strip():
        report.error(
            where,
            f"cannot read '{left}: {value}' (write 'Strong demand (0.6): 500000')",
        )
        return None
    chance = match.group(2).strip()
    prob = parse_number(chance)
    if "%" not in chance and prob is not None and prob > 1:
        report.error(where, f"probability '{chance}' must be 0 to 1 or a percentage")
        return None
    prob = prob / 100 if "%" in chance else prob
    return {"name": match.group(1).strip(" ,"), "prob": prob, "pay": pay}


def evaluate(options, report):
    for option in options:
        if option["outcomes"]:
            total = sum(o["prob"] for o in option["outcomes"])
            if abs(total - 1) > 0.001:
                report.error(
                    option["ln"].where,
                    f"the probabilities for '{option['name']}' add up to {total:g}, not 1",
                )
            option["emv"] = sum(o["prob"] * o["pay"] for o in option["outcomes"])
        elif option["pay"] is not None:
            option["emv"] = option["pay"]
        else:
            report.error(
                option["ln"].where,
                f"'{option['name']}' needs outcomes (indented lines) or a payoff",
            )
            option["emv"] = 0.0
        option["net"] = option["emv"] - option["cost"]
    best = max(o["net"] for o in options)
    for option in options:
        option["best"] = abs(option["net"] - best) < 1e-9


def draw_tree(options, title, symbol, accent):
    row = 40.0
    root_x, split_x, node_x, bend_x, leaf_x = 92.0, 122.0, 262.0, 288.0, 404.0
    deep = shade(accent, 0.3)
    heights = [max(56.0, len(o["outcomes"]) * row) for o in options]
    tops, y = [], 4.0
    for h in heights:
        tops.append(y)
        y += h + 8
    total = y - 4
    centres = [t + h / 2 for t, h in zip(tops, heights)]
    root_y = (centres[0] + centres[-1]) / 2
    parts = []
    label = wrap(title, 80, 11.5, True)
    parts.append(
        lines_of_text(
            root_x - 14,
            root_y + 4 - 7 * (len(label) - 1),
            label,
            11.5,
            14,
            anchor="end",
            weight="bold",
        )
    )
    parts.append(box(root_x - 7, root_y - 7, 14, 14, INK))
    parts.append(line(root_x + 7, root_y, split_x, root_y, GREY, 1.4))
    parts.append(line(split_x, centres[0], split_x, centres[-1], GREY, 1.4))
    for option, top, height, cy in zip(options, tops, heights, centres):
        colour = accent if option["best"] else GREY
        weight = 2.6 if option["best"] else 1.4
        outcomes = option["outcomes"]
        end = node_x if outcomes else leaf_x
        parts.append(line(split_x, cy, end, cy, colour, weight))
        name = option["name"] + (
            f" (cost {fmt(option['cost'], symbol)})" if option["cost"] else ""
        )
        chunk = wrap(name, end - split_x - 6, 11, True)
        parts.append(
            lines_of_text(
                split_x + 4,
                cy - 6 - 13 * (len(chunk) - 1),
                chunk,
                11,
                13,
                weight="bold",
            )
        )
        below = [f"EMV {fmt(option['emv'], symbol)}"]
        if option["cost"]:
            below.append(f"Net {fmt(option['net'], symbol)}")
        if outcomes:
            parts.append(
                circle(
                    node_x, cy, 7, accent if option["best"] else "#ffffff", colour, 1.6
                )
            )
        for k, item in enumerate(below):
            parts.append(
                text(
                    split_x + 4,
                    cy + 15 + 13 * k,
                    item,
                    10.5,
                    weight="bold" if option["best"] else None,
                    fill=deep if option["best"] else INK,
                )
            )
        if option["best"]:
            tag = "Best choice"
            parts.append(
                text(
                    split_x + 4,
                    cy + 15 + 13 * len(below),
                    tag,
                    10,
                    fill=accent,
                    font_style="italic",
                )
            )
        if not outcomes:
            parts.append(
                text(leaf_x + 8, cy + 4, fmt(option["emv"], symbol), 11, weight="bold")
            )
            continue
        spacing = height / len(outcomes)
        leaf_ys = [top + spacing * (k + 0.5) for k in range(len(outcomes))]
        parts.append(line(node_x + 7, cy, bend_x, cy, colour, weight))
        parts.append(line(bend_x, leaf_ys[0], bend_x, leaf_ys[-1], colour, weight))
        for outcome, ly in zip(outcomes, leaf_ys):
            parts.append(
                line(bend_x, ly, leaf_x, ly, colour, 1.4 if not option["best"] else 1.8)
            )
            chance = f"{outcome['prob']:g}"
            chunk = wrap(f"{outcome['name']} ({chance})", leaf_x - bend_x - 6, 10.5)
            parts.append(
                lines_of_text(
                    bend_x + 4, ly - 4 - 12 * (len(chunk) - 1), chunk, 10.5, 12
                )
            )
            parts.append(
                text(leaf_x + 8, ly + 4, fmt(outcome["pay"], symbol), 11, weight="bold")
            )
    return canvas(total + 8, parts)


def split_values(content):
    return [part.strip() for part in re.split(r"\s*[,;]\s*", content) if part.strip()]


def table_pairs(opts, count):
    pairs = [[key, value] for key, value in opts.pairs if key in TABLE_KEYS]
    pairs.append(["align", " ".join(["l"] + ["r"] * count)])
    return pairs


def emit_table(doc, opts, line_, rows, keys):
    from ..parse import Line

    pairs = table_pairs(opts, len(rows[0]) - 1)
    table_opts = Options(pairs, doc.report, line_.where)
    opts.seen.add("align")
    opts.finish(keys | {"align"})
    lines = [Line(line_.file, line_.no, "| " + " | ".join(row) + " |") for row in rows]
    lines.insert(1, Line(line_.file, line_.no, "|" + "---|" * len(rows[0])))
    doc.table(table_opts, lines, line_)


def bold(text_):
    return f"**{text_}**" if text_ else ""


def cashflow_items(others, report):
    items, section = [], None
    for ln in others:
        stripped = ln.text.strip()
        sign = None
        if stripped[:1] in "+-" and len(stripped) > 1:
            sign, stripped = ("in" if stripped[0] == "+" else "out"), stripped[
                1:
            ].strip()
        name, colon, content = stripped.partition(":")
        name, content = name.strip(), content.strip()
        key = name.lower()
        if not colon:
            report.error(
                ln.where,
                f"cannot read '{stripped[:50]}' (write 'Wages: 500, 500, 600')",
            )
            continue
        if not content:
            section = "in" if key in INFLOW else "out" if key in OUTFLOW else None
            if section is None:
                report.error(
                    ln.where,
                    f"'{name}' has no figures (headings are 'Cash in:' and 'Cash out:')",
                )
            continue
        kind = (
            sign
            or section
            or ("in" if key in INFLOW else "out" if key in OUTFLOW else None)
        )
        if kind is None:
            report.error(
                ln.where,
                f"is '{name}' cash in or cash out? put it under 'Cash in:' or 'Cash out:'",
            )
            continue
        values = [parse_number(v) for v in split_values(content)]
        if None in values or not values:
            report.error(
                ln.where,
                f"the figures for '{name}' must be numbers separated by commas",
            )
            continue
        items.append({"kind": kind, "name": name, "values": values, "ln": ln})
    return items


def cashflow_rows(items, labels, opening, symbol):
    count = len(labels)
    money = lambda v: fmt(v, "", True)
    rows = [[symbol] + labels, [bold("Opening balance")] + [money(0)] * count]
    inflow = [i for i in items if i["kind"] == "in"]
    outflow = [i for i in items if i["kind"] == "out"]
    cash_in = [sum(i["values"][k] for i in inflow) for k in range(count)]
    cash_out = [sum(i["values"][k] for i in outflow) for k in range(count)]
    for group, title, total, sums in (
        (inflow, "Cash in", "Total cash in", cash_in),
        (outflow, "Cash out", "Total cash out", cash_out),
    ):
        if len(group) > 1:
            rows.append([bold(title)] + [""] * count)
        rows.extend([i["name"]] + [money(v) for v in i["values"]] for i in group)
        if len(group) > 1:
            rows.append([bold(total)] + [bold(money(v)) for v in sums])
    balance, openings, nets, closings = opening, [], [], []
    for k in range(count):
        openings.append(balance)
        nets.append(cash_in[k] - cash_out[k])
        balance += nets[k]
        closings.append(balance)
    rows[1] = [bold("Opening balance")] + [money(v) for v in openings]
    rows.append([bold("Net cash flow")] + [bold(money(v)) for v in nets])
    rows.append([bold("Closing balance")] + [bold(money(v)) for v in closings])
    return rows


def appraisal(investment, flows, rate):
    rows = [["Year", "Net cash flow", "Cumulative"]]
    if rate is not None:
        rows[0] += ["Discount factor", "Present value", "Cumulative PV"]
    cumulative, present, payback = -investment, -investment, None
    first = [0, fmt(-investment, "", True), fmt(-investment, "", True)]
    rows.append(
        [str(first[0]), first[1], first[2]]
        + (
            ["1.000", fmt(-investment, "", True), fmt(-investment, "", True)]
            if rate is not None
            else []
        )
    )
    for year, flow in enumerate(flows, 1):
        before = cumulative
        cumulative += flow
        row = [str(year), fmt(flow, "", True), fmt(cumulative, "", True)]
        if rate is not None:
            factor = 1 / (1 + rate / 100) ** year
            present += flow * factor
            row += [
                f"{factor:.3f}",
                fmt(flow * factor, "", True),
                fmt(present, "", True),
            ]
        if payback is None and cumulative >= 0 and flow > 0:
            fraction = -before / flow if before < 0 else 0
            payback = (year - 1) + fraction
        rows.append(row)
    if payback is None:
        text_ = f"Not paid back within {len(flows)} years"
    else:
        months = round((payback - int(payback)) * 12)
        years = int(payback) + (1 if months == 12 else 0)
        months = 0 if months == 12 else months
        parts = (
            [f"{years} year{'s' if years != 1 else ''}"] if years or not months else []
        )
        if months:
            parts.append(f"{months} month{'s' if months != 1 else ''}")
        text_ = " ".join(parts)
    rows.append([bold("Payback period"), text_] + [""] * (len(rows[0]) - 2))
    profit = sum(flows) - investment
    average = profit / len(flows)
    rows.append(
        [bold("Average annual return (ARR)"), f"{average / investment * 100:.1f}%"]
        + [""] * (len(rows[0]) - 2)
    )
    if rate is not None:
        rows.append(
            [bold(f"Net present value at {rate:g}%"), fmt(present, "", True)]
            + [""] * (len(rows[0]) - 2)
        )
    return rows


class Kit:
    DIRS = {
        "breakeven",
        "break-even",
        "decisiontree",
        "decision-tree",
        "cashflow",
        "cash-flow",
        "payback",
        "appraisal",
    }

    def dir_breakeven(self, args, body, line):
        opts, rest = read(self, body, line, BREAKEVEN_KEYS)
        values, others = settings(opts, rest, BREAKEVEN_NAMES)
        reject(others, BREAKEVEN_NAMES, self.report)
        fixed, variable, price = (
            number_of(values, k, self.report, line.where)
            for k in ("fixed", "variable", "price")
        )
        if None in (fixed, variable, price):
            self.report.error(
                line.where,
                "breakeven needs 'fixed costs', 'variable cost' (per unit) and 'price'",
            )
            return
        if price <= variable:
            self.report.error(
                line.where, "the price must be higher than the variable cost per unit"
            )
            return
        output = number_of(values, "output", self.report, line.where)
        top = number_of(values, "max", self.report, line.where)
        markup = draw_breakeven(
            fixed,
            variable,
            price,
            output,
            top,
            values.get("currency", ""),
            accent_of(self),
        )
        show(self, opts, line, markup, BREAKEVEN_KEYS)

    dir_break_even = dir_breakeven

    def dir_decisiontree(self, args, body, line):
        opts, rest = read(self, body, line, TREE_KEYS)
        values, others = settings(opts, rest, TREE_NAMES)
        options = tree_lines(others, self.report)
        if len(options) < 2:
            self.report.error(
                line.where, "decisiontree needs at least two options (unindented lines)"
            )
            return
        evaluate(options, self.report)
        markup = draw_tree(
            options,
            values.get("decision", "Decision"),
            values.get("currency", ""),
            accent_of(self),
        )
        show(self, opts, line, markup, TREE_KEYS)

    dir_decision_tree = dir_decisiontree

    def dir_cashflow(self, args, body, line):
        opts, rest = read(self, body, line, CASH_KEYS)
        values, others = settings(opts, rest, CASH_NAMES)
        items = cashflow_items(others, self.report)
        if not items:
            self.report.error(
                line.where,
                "cashflow needs lines such as 'Cash in: 8000, 9000' and 'Cash out: 7000, 8500'",
            )
            return
        count = len(items[0]["values"])
        for item in items:
            if len(item["values"]) != count:
                self.report.error(
                    item["ln"].where,
                    f"'{item['name']}' has {len(item['values'])} figures but the first line has {count}",
                )
                return
        labels = split_values(values.get("months", "")) or [
            f"Month {k}" for k in range(1, count + 1)
        ]
        if len(labels) != count:
            self.report.error(
                line.where,
                f"{len(labels)} months are named but each line has {count} figures",
            )
            return
        opening = number_of(values, "opening", self.report, line.where, 0.0)
        rows = cashflow_rows(items, labels, opening, values.get("currency", ""))
        emit_table(self, opts, line, rows, CASH_KEYS)

    dir_cash_flow = dir_cashflow

    def dir_payback(self, args, body, line):
        opts, rest = read(self, body, line, APPRAISAL_KEYS)
        values, others = settings(opts, rest, APPRAISAL_NAMES)
        flows = [parse_number(v) for v in split_values(values.get("cashflows", ""))]
        for ln in others:
            match = re.match(r"^(?:year|yr|y)\s*\d*\s*:\s*(.+)$", ln.text.strip(), re.I)
            flow = parse_number(match.group(1)) if match else None
            if flow is None:
                reject([ln], APPRAISAL_NAMES, self.report)
            else:
                flows.append(flow)
        investment = number_of(values, "investment", self.report, line.where)
        if investment is None or investment <= 0 or not flows or None in flows:
            self.report.error(
                line.where,
                "payback needs 'investment: 50000' and yearly returns such as 'Year 1: 15000'",
            )
            return
        rate = number_of(values, "rate", self.report, line.where)
        emit_table(self, opts, line, appraisal(investment, flows, rate), APPRAISAL_KEYS)

    dir_appraisal = dir_payback
