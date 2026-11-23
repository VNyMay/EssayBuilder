import csv
import io
import json
import re
from decimal import ROUND_HALF_UP, Decimal

from .util import suggest

NUMBER = re.compile(r"^[-+−]?\d[\d,]*(?:\.\d+)?(?:[eE][-+]?\d+)?%?$|^[-+−]?\.\d+$")
FLOAT = re.compile(r"^[-+−]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$")


def is_number(text):
    return bool(NUMBER.match(text.strip()))


def split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|") and not line.endswith("\\|"):
        line = line[:-1]
    return [cell.strip().replace("\\|", "|") for cell in re.split(r"(?<!\\)\|", line)]


def parse_pipe(lines):
    rows, aligns, header = [], None, True
    for line in lines:
        if not line.strip():
            continue
        cells = split_row(line)
        marks = [c.replace(" ", "") for c in cells if c]
        # a separator row is made of :--, :-:, --: (a lone "-" cell is data, not a separator)
        if marks and all(re.fullmatch(r":?-+:?", m) for m in marks) and any(":" in m or "--" in m for m in marks):
            aligns = [
                "c" if c.startswith(":") and c.endswith(":") else "r" if c.endswith(":") else "l" if c.startswith(":") else ""
                for c in cells
            ]
            continue
        rows.append(cells)
    return rows, aligns


def read_delimited(text, name):
    sample = text[:4096]
    if name.lower().endswith(".tsv"):
        delimiter = "\t"
    else:
        try:
            delimiter = csv.Sniffer().sniff(sample, delimiters=",;\t").delimiter
        except csv.Error:
            delimiter = ","
    return [row for row in csv.reader(io.StringIO(text), delimiter=delimiter) if any(c.strip() for c in row)]


def read_file(path, sheet=None):
    suffix = path.suffix.lower()
    if suffix in {".xlsx", ".xlsm"}:
        try:
            import openpyxl
        except ImportError:
            raise RuntimeError("reading .xlsx needs openpyxl (pip install openpyxl); or save the sheet as .csv")
        book = openpyxl.load_workbook(path, data_only=True, read_only=True)
        sheet_obj = book[sheet] if sheet else book.worksheets[0]
        rows = []
        for row in sheet_obj.iter_rows(values_only=True):
            if any(c is not None and str(c).strip() for c in row):
                rows.append(["" if c is None else (str(int(c)) if isinstance(c, float) and c.is_integer() else str(c)) for c in row])
        return rows
    if suffix == ".json":  # a list of flat records: the keys are the header
        records = json.loads(path.read_text(encoding="utf-8-sig"))
        if isinstance(records, dict):
            records = [records]
        keys = list(dict.fromkeys(k for r in records for k in r))
        return [keys] + [["" if r.get(k) is None else str(r.get(k)) for k in keys] for r in records]
    return read_delimited(path.read_text(encoding="utf-8-sig", errors="replace"), path.name)


def pick_columns(rows, spec, report, where):
    header = rows[0]
    lookup = {name.strip().lower(): i for i, name in enumerate(header)}
    chosen, names = [], []
    for part in re.split(r"\s*\|\s*" if "|" in spec else r"\s*,\s*", spec.strip()):
        if not part:
            continue
        label = None
        if "=" in part:
            part, label = (s.strip() for s in part.split("=", 1))
        key = part.strip().lower()
        if key in lookup:
            index = lookup[key]
        elif key.isdigit() and 1 <= int(key) <= len(header):
            index = int(key) - 1
        else:
            report.error(where, f"no column '{part}' in the table{suggest(key, lookup)}; columns are: {', '.join(header)}")
            continue
        chosen.append(index)
        names.append(label if label is not None else header[index])
    if not chosen:
        return rows
    return [names] + [[row[i] if i < len(row) else "" for i in chosen] for row in rows[1:]]


def pick_rows(rows, spec, report, where):
    body = rows[1:]
    keep = []
    for part in re.split(r"\s*,\s*", spec.strip()):
        match = re.fullmatch(r"(\d+)\s*[-–]\s*(\d+)?|(\d+)", part)
        if not match:
            report.error(where, f"bad rows '{part}' (use e.g. 1-10 or 1-5, 8, 12-)")
            return rows
        if match.group(3):
            keep.append((int(match.group(3)), int(match.group(3))))
        else:
            keep.append((int(match.group(1)), int(match.group(2)) if match.group(2) else len(body)))
    picked = [row for n, row in enumerate(body, 1) if any(a <= n <= b for a, b in keep)]
    return [rows[0]] + picked


def sort_rows(rows, spec, report, where):
    parts = spec.split()
    name, descending = parts[0].lower(), len(parts) > 1 and parts[1].lower().startswith("desc")
    header = [h.strip().lower() for h in rows[0]]
    if name not in header:
        report.error(where, f"cannot sort by '{parts[0]}': no such column{suggest(name, header)}")
        return rows
    index = header.index(name)

    def key(row):
        cell = row[index].replace(",", "").replace("−", "-")
        return (0, float(cell)) if FLOAT.match(cell) else (1, cell.lower())

    return [rows[0]] + sorted(rows[1:], key=key, reverse=descending)


def decimals_map(spec, header, report, where):
    if spec is None:
        return {}
    if re.fullmatch(r"\d+", spec.strip()):
        return {i: int(spec) for i in range(len(header))}
    out = {}
    lookup = {h.strip().lower(): i for i, h in enumerate(header)}
    for part in re.split(r"\s*,\s*", spec.strip()):
        name, _, digits = part.partition("=")
        if name.strip().lower() in lookup and digits.strip().isdigit():
            out[lookup[name.strip().lower()]] = int(digits)
        else:
            report.error(where, f"bad decimals '{part}' (use 4 or column=4, column=2)")
    return out


def sci_cell(raw, sig):
    r"""3.3811209e-65 -> $3.38\times 10^{-65}$ (sig = significant digits to keep; 0 keeps them all)."""
    value = Decimal(raw)
    if value == 0:
        return "0"
    text = format(value, f".{sig - 1}e") if sig else (raw.lower() if "e" in raw.lower() else format(value, "e"))
    mantissa, exponent = text.lower().split("e")
    if "." in mantissa:
        mantissa = mantissa.rstrip("0").rstrip(".") if not sig else mantissa
    return rf"${mantissa}\times 10^{{{int(exponent)}}}$"


def group_digits(raw, size):
    r"""3.4494897427831780981 -> $3.44948\,97427\,83178\,0981$ (long decimals are easier to read in groups)."""
    whole, dot, frac = raw.partition(".")
    if not dot or len(frac) <= 6:
        return raw
    return "$" + whole + "." + r"\,".join(frac[i:i + size] for i in range(0, len(frac), size)) + "$"


def format_cell(text, digits, thousands, sci=None, group=0):
    raw = text.strip().replace("−", "-")
    if not FLOAT.match(raw):
        return text
    if sci is not None:
        return sci_cell(raw, sci)
    if digits is not None:
        raw = str(Decimal(raw).quantize(Decimal(1).scaleb(-digits), rounding=ROUND_HALF_UP))
        if re.fullmatch(r"-0(\.0+)?", raw):
            raw = raw[1:]
    if thousands:
        whole, dot, frac = raw.partition(".")
        raw = f"{int(whole):,}{dot}{frac}"
    if group:
        if raw.endswith(".0"):  # full-precision tables show 3, not 3.0
            raw = raw[:-2]
        raw = group_digits(raw, group)
    return raw.replace("-", "−") if text.strip().startswith(("-", "−")) else raw


def merge_spans(rows, report, where):
    owner = {}
    for r, row in enumerate(rows):
        for c in range(len(row) - 1, -1, -1):
            if row[c].strip() == ">>" and c + 1 < len(row):
                owner[(r, c)] = owner.get((r, c + 1), (r, c + 1))
    for r, row in enumerate(rows):
        for c in range(len(row)):
            if row[c].strip() == "<<" and c > 0:
                owner[(r, c)] = owner.get((r, c - 1), (r, c - 1))
    for r, row in enumerate(rows):
        for c in range(len(row)):
            if row[c].strip() == "^^" and r > 0:
                owner[(r, c)] = owner.get((r - 1, c), (r - 1, c))
    groups = {}
    for cell, target in owner.items():
        groups.setdefault(target, {target}).add(cell)
    cleaned = [["" if c.strip() in {">>", "<<", "^^"} else c for c in row] for row in rows]
    sizes, covered = {}, set()
    for target, members in groups.items():
        top = min(r for r, _ in members)
        left = min(c for _, c in members)
        bottom = max(r for r, _ in members)
        right = max(c for _, c in members)
        box = {(r, c) for r in range(top, bottom + 1) for c in range(left, right + 1)}
        if box != members:
            report.error(where, "merged cells (>> << ^^) must form a rectangle")
            continue
        cleaned[top][left] = rows[target[0]][target[1]]
        sizes[(top, left)] = (bottom - top + 1, right - left + 1)
        covered |= box - {(top, left)}
    return cleaned, sizes, covered
