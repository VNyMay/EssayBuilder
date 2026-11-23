import html
import itertools
import re

from ..util import Options
from . import FIGURE_KEYS

TOKEN = re.compile(r"\s*(<->|->|=>|&&|\|\||[()&|!~^∧∨¬⊕→↔⊼⊽]|[A-Za-z_][A-Za-z0-9_]*)")
WORDS = {
    "and": "AND", "&": "AND", "&&": "AND", "∧": "AND", "or": "OR", "|": "OR", "||": "OR", "∨": "OR",
    "not": "NOT", "!": "NOT", "~": "NOT", "¬": "NOT", "xor": "XOR", "^": "XOR", "⊕": "XOR",
    "nand": "NAND", "⊼": "NAND", "nor": "NOR", "⊽": "NOR", "xnor": "XNOR", "implies": "IMPLIES",
    "->": "IMPLIES", "=>": "IMPLIES", "→": "IMPLIES", "iff": "XNOR", "<->": "XNOR", "↔": "XNOR",
}
TRUTH = {
    "AND": lambda a, b: a and b,
    "OR": lambda a, b: a or b,
    "XOR": lambda a, b: a != b,
    "NAND": lambda a, b: not (a and b),
    "NOR": lambda a, b: not (a or b),
    "XNOR": lambda a, b: a == b,
    "IMPLIES": lambda a, b: (not a) or b,
}
LEVELS = [("IMPLIES",), ("OR", "NOR"), ("XOR", "XNOR"), ("AND", "NAND")]
TRUTH_KEYS = FIGURE_KEYS | {"values", "steps", "style"}
PSEUDO_KEYS = FIGURE_KEYS | {"numbers", "title"}
KEYWORDS = (
    "if|then|else if|elseif|else|end if|endif|end while|endwhile|end for|endfor|end loop|end function|end procedure|"
    "end class|end switch|end case|while|for each|foreach|for|to|step|do|loop|until|repeat|return|input|output|print|"
    "function|procedure|class|and|or|not|true|false|null|call|in|mod|div|switch|case|default|method|new|break|continue"
)
KEYWORD = re.compile(rf"\b({KEYWORDS})\b", re.I)
COMMENT = re.compile(r"(//.*|#.*)$")


class ExpressionError(Exception):
    pass


def tokens(text):
    out, position = [], 0
    text = text.strip()
    while position < len(text):
        match = TOKEN.match(text, position)
        if not match:
            raise ExpressionError(f"cannot read '{text[position:position + 8]}'")
        out.append(match.group(1))
        position = match.end()
    return out


def parse_expression(text):
    items = tokens(text)
    place = [0]

    def peek():
        return items[place[0]] if place[0] < len(items) else None

    def word(token):
        return WORDS.get(token.lower()) if token is not None else None

    def take():
        place[0] += 1
        return items[place[0] - 1]

    def level(depth):
        if depth == len(LEVELS):
            return unary()
        left = level(depth + 1)
        while word(peek()) in LEVELS[depth]:
            operator = word(take())
            right = level(depth + 1) if operator != "IMPLIES" else level(depth)
            left = ("bin", operator, left, right)
        return left

    def unary():
        token = peek()
        if token is None:
            raise ExpressionError("the expression ends too early")
        if word(token) == "NOT":
            take()
            return ("not", unary())
        if token == "(":
            take()
            inner = level(0)
            if peek() != ")":
                raise ExpressionError("a bracket is not closed")
            take()
            return inner
        if word(token) is not None or token == ")":
            raise ExpressionError(f"unexpected '{token}'")
        take()
        return ("var", token)

    tree = level(0)
    if place[0] != len(items):
        raise ExpressionError(f"unexpected '{items[place[0]]}'")
    return tree


def show(node, top=True):
    if node[0] == "var":
        return node[1]
    if node[0] == "not":
        inner = show(node[1], False)
        return f"NOT {inner}"
    text = f"{show(node[2], False)} {node[1]} {show(node[3], False)}"
    return text if top else f"({text})"


def names(node, found):
    if node[0] == "var":
        if node[1] not in found:
            found.append(node[1])
    else:
        for child in node[1:] if node[0] == "not" else node[2:]:
            names(child, found)
    return found


def steps(node, found):
    if node[0] == "var":
        return found
    for child in node[1:] if node[0] == "not" else node[2:]:
        steps(child, found)
    if node not in found:
        found.append(node)
    return found


def evaluate(node, values):
    if node[0] == "var":
        return values[node[1]]
    if node[0] == "not":
        return not evaluate(node[1], values)
    return TRUTH[node[1]](evaluate(node[2], values), evaluate(node[3], values))


class Kit:
    DIRS = {"truth", "pseudocode"}

    def dir_truth(self, args, body, line):
        from ..parse import Line

        self.ensure_section(line)
        head, rest = self.split_options(body, known=TRUTH_KEYS)
        opts = Options.parse(head, self.report, line.where)
        formulas = []
        for ln in rest:
            text = ln.text.strip()
            if not text or text.startswith(("%%", "//")):
                continue
            label, _, expression = text.partition("=") if re.match(r"^\w+\s*=[^=]", text) else ("", "", text)
            try:
                formulas.append((label.strip(), parse_expression(expression)))
            except ExpressionError as error:
                self.report.error(ln.where, f"{error} in '{text[:40]}' (write things like A AND B, NOT (A OR C), A XOR B)")
        if not formulas:
            self.report.error(line.where, "truth needs an expression such as: A AND (B OR NOT C)")
            return
        variables = []
        for _, tree in formulas:
            names(tree, variables)
        if len(variables) > 6:
            self.report.error(line.where, f"truth tables support up to 6 inputs, this has {len(variables)}")
            return
        columns = []
        for label, tree in formulas:
            if opts.flag("steps"):
                columns.extend((show(step), step, False) for step in steps(tree, []) if step != tree)
            columns.append((label or show(tree), tree, True))
        mode = (opts.get("values") or "01").lower()
        true, false = ("T", "F") if mode in {"tf", "t/f"} else ("1", "0")
        rows = [" | ".join(f"{c}" for c in [*variables, *(name for name, _, _ in columns)])]
        rows = [f"| {rows[0]} |", "|" + "---|" * (len(variables) + len(columns))]
        for combo in itertools.product([False, True], repeat=len(variables)):
            values = dict(zip(variables, combo))
            cells = [true if v else false for v in combo]
            cells += [true if evaluate(tree, values) else false for _, tree, _ in columns]
            rows.append("| " + " | ".join(cells) + " |")
        pairs = [[key, value] for key, value in opts.pairs if key in {"caption", "id", "source", "width", "place", "wrap"}]
        pairs.append(["align", " ".join("c" * (len(variables) + len(columns)))])
        pairs.append(["style", opts.get("style") or "grid"])
        table_opts = Options(pairs, self.report, line.where)
        for key in ("steps", "values", "align", "style"):
            opts.seen.add(key)
        opts.finish(TRUTH_KEYS)
        self.table(table_opts, [Line(line.file, line.no, text) for text in rows], line)

    def dir_pseudocode(self, args, body, line):
        from .. import code as codemod

        self.ensure_section(line)
        head, rest = self.split_options(body, known=PSEUDO_KEYS)
        opts = Options.parse(head, self.report, line.where)
        numbers = opts.flag("numbers", True)
        rows = []
        for number, ln in enumerate((ln for ln in rest if ln.text.strip() or True), 1):
            raw = ln.text.expandtabs(4).rstrip()
            indent = len(raw) - len(raw.lstrip())
            text = raw.lstrip()
            note = ""
            match = COMMENT.search(text)
            if match:
                text, note = text[: match.start()], match.group(1)
            shown = html.escape(text)
            shown = re.sub(r"(&lt;-|:=)", "←", shown)
            shown = shown.replace("&lt;=", "≤").replace("&gt;=", "≥").replace("!=", "≠")
            shown = KEYWORD.sub(lambda m: f"<b>{m.group(1)}</b>", shown)
            if note:
                shown += f'<i class="pc">{html.escape(note)}</i>'
            rows.append((number, ["&nbsp;" * indent + shown], False))
        anchor, caption_html = "", ""
        if opts.get("caption") is not None:
            anchor, cap, _ = self.caption("code", opts, line)
            caption_html = cap.replace("figcaption", "div")
        opts.finish(PSEUDO_KEYS)
        self.emit(codemod.card("Pseudocode", "", rows, "", anchor, numbers, caption_html))
