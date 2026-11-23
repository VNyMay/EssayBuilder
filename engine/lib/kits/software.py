import re

from ..util import Options, suggest
from . import FIGURE_KEYS

KEYS = FIGURE_KEYS | {"direction", "title"}
ROOMY = (
    '%%{init: {"themeVariables": {"fontSize": "16.6px"}, '
    '"themeCSS": "foreignObject span, foreignObject div, foreignObject p {font-size: 15px !important;}"}}%%'
    "\n"
)
COMMENT = re.compile(r"^\s*(%%|//(\s|$))")

CLASS_RELATIONS = [
    (re.compile(r"^(\w[\w ]*?)\s+(?:extends|inherits from|inherits|is an?)\s+(\w[\w ]*)$", re.I), "--|>"),
    (re.compile(r"^(\w[\w ]*?)\s+(?:implements|realizes)\s+(\w[\w ]*)$", re.I), "..|>"),
    (re.compile(r"^(\w[\w ]*?)\s+(?:is composed of|composed of|consists of|contains)\s+(\w[\w ]*)$", re.I), "*--"),
    (re.compile(r"^(\w[\w ]*?)\s+(?:aggregates|has a collection of|groups)\s+(\w[\w ]*)$", re.I), "o--"),
    (re.compile(r"^(\w[\w ]*?)\s+(?:uses|depends on|calls)\s+(\w[\w ]*)$", re.I), "..>"),
]
MANY = re.compile(r"^(\w[\w ]*?)\s+has\s+many\s+(\w[\w ]*)$", re.I)
ONE = re.compile(r"^(\w[\w ]*?)\s+has\s+(?:one|a|an)\s+(\w[\w ]*)$", re.I)
ARROW = re.compile(r"^(\S+)\s+(--\|>|\.\.\|>|\*--|o--|\.\.>|-->|<\|--|--)\s+(\S+)(?:\s*:\s*(.+))?$")
SIMPLE_ARROW = re.compile(r"^(\w[\w ]*?)\s*->\s*(\w[\w ]*?)(?:\s*:\s*(.+))?$")

CARD = {
    "one or many": ("}|", "|{"),
    "zero or many": ("}o", "o{"),
    "zero or one": ("|o", "o|"),
    "one": ("||", "||"),
    "many": ("}o", "o{"),
    "0..*": ("}o", "o{"),
    "0..1": ("|o", "o|"),
    "1..*": ("}|", "|{"),
    "1": ("||", "||"),
    "n": ("}o", "o{"),
    "*": ("}o", "o{"),
}
CARD_WORDS = "|".join(sorted((re.escape(word) for word in CARD), key=len, reverse=True))
ER_LINK = re.compile(
    rf"^(\w[\w ]*?)\s+({CARD_WORDS})\s*(?:--|to|-)\s*({CARD_WORDS})\s+(\w[\w ]*?)(?:\s*:\s*(.+))?$", re.I
)
ER_ENTITY = re.compile(r"^(\w[\w ]*?)\s*:\s*(.+)$")
TYPES = {"int", "integer", "string", "text", "varchar", "float", "double", "date", "datetime", "boolean", "bool", "decimal"}


def lines_of(rest):
    return [ln for ln in rest if ln.text.strip() and not COMMENT.match(ln.text)]


def ident(name):
    return re.sub(r"\W+", "_", name.strip()) or "X"


def class_source(rest, report):
    classes, order, relations, current = {}, [], [], None
    for ln in lines_of(rest):
        raw = ln.text.rstrip()
        text = raw.strip()
        head = re.match(r"^class\s+(\w[\w ]*?)(?:\s*(<<.+>>))?\s*$", text, re.I)
        if head and not raw.startswith((" ", "\t")):
            name = head.group(1).strip()
            classes.setdefault(name, {"stereo": head.group(2), "members": []})
            current = name
            if name not in order:
                order.append(name)
            continue
        if raw.startswith((" ", "\t")) and current is not None:
            classes[current]["members"].append(text)
            continue
        current = None
        match = MANY.match(text)
        if match:
            relations.append((match.group(1), '"1" -- "*"', match.group(2), ""))
            continue
        match = ONE.match(text)
        if match:
            relations.append((match.group(1), '"1" -- "1"', match.group(2), ""))
            continue
        for pattern, arrow in CLASS_RELATIONS:
            match = pattern.match(text)
            if match:
                relations.append((match.group(1), arrow, match.group(2), ""))
                break
        else:
            match = ARROW.match(text)
            if match:
                relations.append((match.group(1), match.group(2), match.group(3), match.group(4) or ""))
                continue
            match = SIMPLE_ARROW.match(text)
            if match:
                relations.append((match.group(1), "-->", match.group(2), match.group(3) or ""))
                continue
            report.error(ln.where, f"cannot read this line: '{text[:50]}' (write 'class Name', indented members, or 'Dog extends Animal')")
    if not classes and not relations:
        report.error("", "uml diagram is empty (write 'class Animal' then indented members)")
    out = ["classDiagram"]
    for name in order:
        info = classes[name]
        body = ([info["stereo"]] if info["stereo"] else []) + [re.sub(r"\)\s*:\s*", ") ", member) for member in info["members"]]
        out.append(f"  class {ident(name)} {{")
        out.extend(f"    {line}" for line in body)
        out.append("  }")
    for left, arrow, right, label in relations:
        for name in (left, right):
            if name not in classes:
                classes[name] = {"stereo": None, "members": []}
                out.append(f"  class {ident(name)}")
        suffix = f" : {label}" if label else ""
        out.append(f"  {ident(left)} {arrow} {ident(right)}{suffix}")
    return "\n".join(out)


def er_attribute(text):
    parts = text.strip().split()
    if not parts:
        return None
    keys = [p for p in parts if p.upper() in {"PK", "FK", "UK", "UNIQUE"}]
    rest = [p for p in parts if p.upper() not in {"PK", "FK", "UK", "UNIQUE"}]
    kind, name = "string", ""
    joined = " ".join(rest)
    if ":" in joined:
        name, kind = [side.strip() for side in joined.split(":", 1)]
    elif len(rest) >= 2 and rest[0].lower() in TYPES:
        kind, name = rest[0], "_".join(rest[1:])
    else:
        name = "_".join(rest)
    return f"{ident(kind)} {ident(name)}" + (f" {'UK' if keys[0].upper() == 'UNIQUE' else keys[0].upper()}" if keys else "")


def erd_source(rest, report):
    entities, links = {}, []
    for ln in lines_of(rest):
        text = ln.text.strip()
        link = ER_LINK.match(text)
        if link:
            left, a, b, right, label = link.groups()
            links.append((left.strip(), CARD[a.lower()][0], CARD[b.lower()][1], right.strip(), label or "has"))
            continue
        match = ER_ENTITY.match(text)
        if match:
            name = match.group(1).strip()
            attrs = [er_attribute(part) for part in re.split(r"\s*,\s*", match.group(2))]
            entities.setdefault(name, []).extend(a for a in attrs if a)
            continue
        report.error(ln.where, f"cannot read this line: '{text[:50]}' (write 'Customer: id PK, name' or 'Customer one -- many Order : places')")
    for left, _, _, right, _ in links:
        entities.setdefault(left, [])
        entities.setdefault(right, [])
    if not entities:
        report.error("", "erd is empty (write 'Customer: id PK, name, email')")
    out = ["erDiagram"]
    for name, attrs in entities.items():
        if attrs:
            out.append(f"  {ident(name)} {{")
            out.extend(f"    {a}" for a in attrs)
            out.append("  }")
        else:
            out.append(f"  {ident(name)}")
    for left, lc, rc, right, label in links:
        out.append(f'  {ident(left)} {lc}--{rc} {ident(right)} : "{label}"')
    return "\n".join(out)


def state_source(rest, report):
    out = ["stateDiagram-v2"]
    for ln in lines_of(rest):
        text = ln.text.strip()
        match = re.match(r"^(.+?)\s*(?:->|-->)\s*(.+?)(?:\s*:\s*(.+))?$", text)
        if not match:
            report.error(ln.where, f"cannot read this line: '{text[:50]}' (write 'Idle -> Running : start')")
            continue
        left, right, label = match.groups()
        names = []
        for side in (left, right):
            side = side.strip()
            names.append("[*]" if side.lower() in {"start", "end", "[*]", "begin", "stop", "finish"} else ident(side))
        pretty = {ident(s.strip()): s.strip() for s in (left, right) if s.strip().lower() not in {"start", "end", "[*]", "begin", "stop", "finish"}}
        for key, shown in pretty.items():
            if key != shown:
                out.append(f'  state "{shown}" as {key}')
        out.append(f"  {names[0]} --> {names[1]}" + (f" : {label.strip()}" if label else ""))
    return "\n".join(dict.fromkeys(out))


def sequence_source(rest, report):
    out, seen = ["sequenceDiagram"], {}

    def actor(name):
        name = name.strip()
        key = ident(name)
        if key not in seen:
            seen[key] = name
            out.insert(1, f"  participant {key} as {name}")
        return key

    for ln in lines_of(rest):
        text = ln.text.strip()
        match = re.match(r"^(.+?)\s*(-->|->)\s*(.+?)\s*:\s*(.*)$", text)
        if match:
            left, arrow, right, message = match.groups()
            mark = "-->>" if arrow == "-->" else "->>"
            out.append(f"  {actor(left)}{mark}{actor(right)}: {message}")
            continue
        match = re.match(r"^(loop|alt|opt|else|end|par|and|rect)\b(.*)$", text, re.I)
        if match:
            out.append(f"  {match.group(1).lower()}{match.group(2)}")
            continue
        match = re.match(r"^note(?:\s+(?:over|on|at))?\s+(.+?)\s*:\s*(.+)$", text, re.I)
        if match:
            out.append(f"  Note over {actor(match.group(1))}: {match.group(2)}")
            continue
        report.error(ln.where, f"cannot read this line: '{text[:50]}' (write 'Alice -> Bob: Hello' or 'Bob --> Alice: Reply')")
    return "\n".join(out)


class Kit:
    DIRS = {"uml", "erd", "fsm", "statemachine", "interaction", "seq"}

    def software(self, body, line, build):
        self.ensure_section(line)
        head, rest = self.split_options(body, known=KEYS)
        opts = Options.parse(head, self.report, line.where)
        source = build(rest, self.report)
        if not source.startswith("sequence"):
            source = ROOMY + source
        direction = (opts.get("direction") or "").upper()
        if direction in {"LR", "RL", "TB", "BT"} and not source.startswith(("sequence", "erDiagram")):
            source = source.replace("\n", f"\n  direction {direction}\n", 1)
        self.diagram(source, opts, line, KEYS)

    def dir_uml(self, args, body, line):
        self.software(body, line, class_source)

    def dir_erd(self, args, body, line):
        self.software(body, line, erd_source)

    def dir_fsm(self, args, body, line):
        self.software(body, line, state_source)

    dir_statemachine = dir_fsm

    def dir_interaction(self, args, body, line):
        self.software(body, line, sequence_source)

    dir_seq = dir_interaction
