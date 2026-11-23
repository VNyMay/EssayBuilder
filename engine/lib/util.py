import difflib
import re
from pathlib import Path

YES = {"yes", "true", "on", "1", "y"}
NO = {"no", "false", "off", "0", "n", "none"}
PAPERS = {"a4": (210, 297), "a5": (148, 210), "letter": (215.9, 279.4), "legal": (215.9, 355.6)}
SIZES = {"small": "45%", "medium": "65%", "large": "86%", "full": "100%"}
MM_PX = 96 / 25.4

OPTION = re.compile(r"^([A-Za-z][\w-]*)\s*:\s*(.*)$")
ATTRS = re.compile(
    r"\s*\{((?:\s*(?:#[\w:-]+|\.[\w-]+|[\w-]+=(?:\"[^\"]*\"|'[^']*'|[^\s{}\"']+)|[\w-]+))+\s*)\}\s*$"
)
ATTR_TOKEN = re.compile(r"#([\w:-]+)|\.([\w-]+)|([\w-]+)=(\"[^\"]*\"|'[^']*'|[^\s\"']+)|([\w-]+)")
LENGTH = re.compile(r"^(\d+(?:\.\d+)?)\s*(%|cm|mm|in|pt|px|em)?$")


class Report:
    def __init__(self):
        self.errors, self.warnings = [], []

    def error(self, where, message):
        self.errors.append(f"{where}: {message}")

    def warn(self, where, message):
        self.warnings.append(f"{where}: {message}")

    def show(self):
        for item in self.warnings:
            print(f"warning: {item}")
        for item in self.errors:
            print(f"ERROR:   {item}")


class Options:
    def __init__(self, pairs, report, where):
        self.pairs, self.report, self.where = pairs, report, where
        self.seen = set()

    @classmethod
    def parse(cls, lines, report, where):
        pairs, base = [], None
        for line in lines:
            if not line.strip() or line.strip() == "---" or line.strip().startswith("%%"):
                continue
            indent = len(line) - len(line.lstrip())
            base = indent if base is None else base
            match = OPTION.match(line.strip()) if indent <= base else None
            if match:
                pairs.append([match.group(1).lower().replace("_", "-"), match.group(2).strip()])
            elif indent > base and pairs:
                pairs[-1][1] = (pairs[-1][1] + " " + line.strip()).strip()
            else:
                report.error(where, f"expected 'key: value' but found: {line.strip()[:60]}")
        return cls(pairs, report, where)

    def get(self, key, default=None):
        self.seen.add(key)
        for k, v in self.pairs:
            if k == key:
                return v
        return default

    def all(self, key):
        self.seen.add(key)
        return [v for k, v in self.pairs if k == key]

    def flag(self, key, default=False):
        value = self.get(key)
        if value is None:
            return default
        value = value.strip().lower()
        if value in YES or value == "":
            return True
        if value in NO:
            return False
        self.report.error(self.where, f"'{key}' must be yes or no, not '{value}'")
        return default

    def number(self, key, default=None):
        value = self.get(key)
        if value is None:
            return default
        try:
            return float(value)
        except ValueError:
            self.report.error(self.where, f"'{key}' must be a number, not '{value}'")
            return default

    def finish(self, allowed):
        for key, _ in self.pairs:
            if key in self.seen or key in allowed:
                continue
            hint = difflib.get_close_matches(key, allowed, n=1)
            tip = f" (did you mean '{hint[0]}'?)" if hint else f" (allowed: {', '.join(sorted(allowed))})"
            self.report.warn(self.where, f"unknown option '{key}'{tip}")


def split_attrs(text):
    match = ATTRS.search(text)
    if not match:
        return text, {}
    attrs = {"flags": set()}
    for token in ATTR_TOKEN.finditer(match.group(1)):
        ident, flag, key, value, word = token.groups()
        if ident:
            attrs["id"] = ident
        elif flag:
            attrs["flags"].add(flag)
        elif key:
            attrs[key.lower()] = value.strip("\"'")
        elif word:
            attrs["flags"].add(word)
    return text[: match.start()].rstrip(), attrs


def css_length(value, report=None, where=""):
    value = SIZES.get(str(value).strip().lower(), str(value).strip())
    match = LENGTH.match(value)
    if not match:
        if report:
            report.error(where, f"bad size '{value}' (use e.g. 70%, 8cm, 60mm, 3in or small/medium/large/full)")
        return None
    return f"{match.group(1)}{match.group(2) or '%'}"


def length_px(css, full_px):
    match = LENGTH.match(css)
    number, unit = float(match.group(1)), match.group(2) or "%"
    factor = {"%": full_px / 100, "cm": 96 / 2.54, "mm": MM_PX, "in": 96, "pt": 96 / 72, "px": 1, "em": 16}
    return number * factor[unit]


USED = set()


def resolve(text, bases):
    text = text.strip().strip("\"'")
    if text.lower().startswith("file:///"):
        text = text[8:]
    path = Path(text)
    candidates = [path] if path.is_absolute() else [base / path for base in bases]
    for candidate in candidates:
        if candidate.is_file():
            USED.add(candidate.resolve())
            return candidate.resolve()
    return None


def suggest(word, options):
    hint = difflib.get_close_matches(word, list(options), n=1, cutoff=0.5)
    return f" (did you mean '{hint[0]}'?)" if hint else ""


def slug(text):
    text = re.sub(r"<[^>]+>|\$[^$]*\$|[*_`]", "", text)
    text = re.sub(r"[^A-Za-z0-9]+", "-", text).strip("-").lower()
    return text[:40] or "section"


def parse_range(text, limit):
    picked = set()
    for part in re.split(r"[,\s]+", text.strip()):
        if not part:
            continue
        match = re.fullmatch(r"(\d+)(?:\s*[-–]\s*(\d+)?)?", part)
        if not match:
            raise ValueError(part)
        low = int(match.group(1))
        high = int(match.group(2)) if match.group(2) else (limit if "-" in part or "–" in part else low)
        picked.update(range(low, min(high, limit) + 1))
    return picked
