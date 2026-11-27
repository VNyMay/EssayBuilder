import html
import json
import re
from pathlib import Path

STYLES = ("apa", "mla", "harvard", "chicago", "ieee")
ALIASES = {"chicago-author-date": "chicago", "numeric": "ieee", "cite-them-right": "harvard", "apa7": "apa", "mla9": "mla"}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
FIELDS = {
    "type", "author", "editor", "year", "date", "month", "day", "title", "container", "journal", "site", "book",
    "newspaper", "publisher", "city", "volume", "issue", "pages", "edition", "url", "doi", "accessed", "school",
    "degree", "number", "version", "medium", "translator",
}
TYPE_NAMES = {
    "book": "book", "article": "article", "journal": "article", "website": "website", "web": "website", "webpage": "website",
    "report": "report", "chapter": "chapter", "thesis": "thesis", "newspaper": "newspaper", "video": "video", "film": "video",
    "dataset": "dataset", "interview": "interview", "image": "image", "ai": "ai", "lecture": "lecture", "social": "social",
}


class Name:
    def __init__(self, family="", given="", org=""):
        self.family, self.given, self.org = family, given, org

    def initials(self, dots=True):
        parts = [p for p in re.split(r"[\s]+", self.given) if p]
        out = []
        for part in parts:
            pieces = part.split("-")
            out.append("-".join(f"{p[0].upper()}." if dots else p[0].upper() for p in pieces if p))
        return " ".join(out) if dots else "".join(out)

    def key(self):
        return (self.org or self.family).lower()


def parse_names(text):
    if not text.strip():
        return []
    chunks = [c.strip() for c in (text.split(";") if ";" in text else re.split(r"\s+and\s+", text)) if c.strip()]
    names = []
    for chunk in chunks:
        if chunk.startswith("{") and chunk.endswith("}"):
            names.append(Name(org=chunk[1:-1].strip()))
        elif chunk.lower().startswith("org:"):
            names.append(Name(org=chunk[4:].strip()))
        elif "," in chunk:
            family, given = [p.strip() for p in chunk.split(",", 1)]
            names.append(Name(family, given))
        else:
            parts = chunk.split()
            names.append(Name(parts[-1], " ".join(parts[:-1])) if len(parts) > 1 else Name(org=chunk))
    return names


def clean(text):
    return html.escape(str(text).strip(), quote=False)


def rich(text):
    return re.sub(r"\*(.+?)\*", r"<em>\1</em>", clean(text))


def end(text):
    text = text.strip()
    last = re.sub(r"<[^>]+>", "", text)[-1:]
    return text if last in {".", "?", "!"} else text + "."


def spans(pages):
    return re.sub(r"\s*[-–—]+\s*", "–", pages.strip())


class Entry:
    def __init__(self, key, fields):
        self.key = key
        self.f = {k: str(v).strip() for k, v in fields.items() if str(v).strip()}
        kind = self.f.get("type", "book").lower()
        self.type = TYPE_NAMES.get(kind, "other")
        self.authors = parse_names(self.f.get("author", ""))
        self.editors = parse_names(self.f.get("editor", ""))
        date = self.f.get("date", "")
        match = re.match(r"(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?", date)
        self.year = self.f.get("year") or (match.group(1) if match else "")
        month = self.f.get("month", "")
        names = [m[:3].lower() for m in MONTHS]
        if month.isdigit():
            self.month = int(month)
        elif month[:3].lower() in names:
            self.month = names.index(month[:3].lower()) + 1
        else:
            self.month = int(match.group(2)) if match and match.group(2) else 0
        day = self.f.get("day", "")
        self.day = int(day) if day.isdigit() else (int(match.group(3)) if match and match.group(3) else 0)
        self.suffix = ""
        self.number = 0

    def get(self, *names):
        for name in names:
            if self.f.get(name):
                return self.f[name]
        return ""

    def link(self):
        doi = self.get("doi")
        if doi:
            return doi if doi.startswith("http") else f"https://doi.org/{doi}"
        return self.get("url")

    def container(self):
        return self.get("container", "journal", "site", "newspaper", "book")

    def sort_key(self):
        who = self.authors[0].key() if self.authors else self.get("title").lower()
        return (who, self.year, self.get("title").lower())


def date_apa(entry, full):
    if not entry.year:
        return "n.d."
    if full and entry.month:
        return f"{entry.year}, {MONTHS[entry.month - 1]}" + (f" {entry.day}" if entry.day else "")
    return entry.year + entry.suffix


def date_mla(entry):
    parts = []
    if entry.day:
        parts.append(str(entry.day))
    if entry.month:
        parts.append(MONTHS[entry.month - 1][:3] + ("." if len(MONTHS[entry.month - 1]) > 4 and MONTHS[entry.month - 1] not in {"June", "July", "September"} else ""))
    if entry.year:
        parts.append(entry.year)
    return " ".join(parts)


def date_long(entry):
    parts = []
    if entry.day:
        parts.append(str(entry.day))
    if entry.month:
        parts.append(MONTHS[entry.month - 1])
    if entry.year:
        parts.append(entry.year)
    return " ".join(parts)


def accessed_text(entry, style):
    raw = entry.get("accessed")
    match = re.match(r"(\d{4})-(\d{1,2})-(\d{1,2})", raw)
    if not match:
        return raw
    year, month, day = int(match.group(1)), int(match.group(2)), int(match.group(3))
    if style == "mla":
        return f"{day} {MONTHS[month - 1][:3]}. {year}"
    if style == "ieee":
        return f"{MONTHS[month - 1][:3]}. {day}, {year}"
    if style == "apa":
        return f"{MONTHS[month - 1]} {day}, {year}"
    return f"{day} {MONTHS[month - 1]} {year}"


def apa_names(names):
    out = []
    for n in names[:20] if len(names) <= 20 else names[:19]:
        out.append(clean(n.org) if n.org else f"{clean(n.family)}, {clean(n.initials())}".strip(", "))
    if len(names) > 20:
        return ", ".join(out) + ", . . . " + (clean(names[-1].family) + ", " + clean(names[-1].initials()))
    if len(out) <= 1:
        return "".join(out)
    return ", ".join(out[:-1]) + ", & " + out[-1]


def apa_reference(e):
    who = apa_names(e.authors)
    date = f"({date_apa(e, e.type in {'website', 'newspaper', 'social'})})"
    title = e.get("title")
    link = e.link()
    tail = f" {clean(link)}" if link else ""
    rest = ""
    if e.type in {"article", "newspaper"}:
        volume = f", <em>{clean(e.get('volume'))}</em>" if e.get("volume") else ""
        issue = f"({clean(e.get('issue'))})" if e.get("issue") else ""
        pages = f", {spans(clean(e.get('pages')))}" if e.get("pages") else ""
        head = end(rich(title))
        rest = f"<em>{clean(e.container())}</em>{volume}{issue}{pages}."
    elif e.type == "chapter":
        eds = ", ".join(f"{n.initials()} {n.family}" for n in e.editors)
        label = f"{eds} (Ed{'s' if len(e.editors) > 1 else ''}.), " if eds else ""
        pages = f" (pp. {spans(clean(e.get('pages')))})" if e.get("pages") else ""
        head = end(rich(title))
        rest = f"In {clean(label.rstrip())} <em>{clean(e.get('book', 'container'))}</em>{pages}." + (f" {end(clean(e.get('publisher')))}" if e.get("publisher") else "")
    elif e.type == "website":
        site = e.container()
        same = site and e.authors and site.lower() == (e.authors[0].org or "").lower()
        head = end(f"<em>{rich(title)}</em>")
        rest = end(clean(site)) if site and not same else ""
        if not e.year and e.get("accessed") and link:
            tail = f" Retrieved {clean(accessed_text(e, 'apa'))}, from {clean(link)}"
    elif e.type == "thesis":
        degree = e.get("degree") or "Thesis"
        school = f", {clean(e.get('school'))}" if e.get("school") else ""
        head = f"<em>{rich(title)}</em> [{clean(degree)}{school}]."
    elif e.type in {"video", "ai", "dataset", "image", "lecture", "interview", "social"}:
        label = {"video": "Video", "ai": "Large language model", "dataset": "Data set", "image": "Image", "lecture": "Lecture", "interview": "Interview", "social": "Post"}[e.type]
        version = f" ({clean(e.get('version'))})" if e.get("version") else ""
        head = f"<em>{rich(title)}</em>{version} [{label}]."
        site = e.container() or e.get("publisher")
        rest = end(clean(site)) if site else ""
    else:
        edition = f" ({clean(e.get('edition'))} ed.)" if e.get("edition") else ""
        number = f" ({clean(e.get('number'))})" if e.get("number") else ""
        head = f"<em>{rich(title)}</em>{edition}{number}."
        rest = end(clean(e.get("publisher"))) if e.get("publisher") else ""
    middle = f"{head} {rest}".strip()
    if who:
        return f"{end(who)} {date}. {middle}{tail}".replace("..", ".")
    return f"{head} {date}. {rest}{tail}".replace("..", ".").replace(" .", ".")


def mla_names(names):
    if not names:
        return ""
    first = names[0]
    lead = clean(first.org) if first.org else f"{clean(first.family)}, {clean(first.given)}".strip(", ")
    if len(names) == 1:
        return lead
    if len(names) == 2:
        second = names[1]
        return f"{lead}, and {clean(second.org) if second.org else clean((second.given + ' ' + second.family).strip())}"
    return f"{lead}, et al"


def mla_reference(e):
    who = mla_names(e.authors)
    title = e.get("title")
    link = e.link()
    parts = []
    if e.type in {"article", "newspaper"}:
        parts.append(f"“{rich(title)}.”")
        bits = [f"<em>{clean(e.container())}</em>"]
        if e.get("volume"):
            bits.append(f"vol. {clean(e.get('volume'))}")
        if e.get("issue"):
            bits.append(f"no. {clean(e.get('issue'))}")
        when = date_mla(e)
        if when:
            bits.append(when)
        if e.get("pages"):
            bits.append(f"pp. {spans(clean(e.get('pages')))}")
        if link:
            bits.append(clean(link))
        parts.append(", ".join(bits) + ".")
    elif e.type in {"website", "video", "social", "ai", "image", "lecture", "interview", "dataset"}:
        parts.append(f"“{rich(title)}.”")
        bits = []
        if e.container():
            bits.append(f"<em>{clean(e.container())}</em>")
        if e.get("publisher") and e.get("publisher") != e.container():
            bits.append(clean(e.get("publisher")))
        when = date_mla(e)
        if when:
            bits.append(when)
        if link:
            bits.append(clean(link))
        parts.append((", ".join(bits) + ".") if bits else "")
        if e.get("accessed"):
            parts.append(f"Accessed {clean(accessed_text(e, 'mla'))}.")
    elif e.type == "chapter":
        parts.append(f"“{rich(title)}.”")
        bits = [f"<em>{clean(e.get('book', 'container'))}</em>"]
        if e.editors:
            bits.append("edited by " + " and ".join(f"{n.given} {n.family}".strip() for n in e.editors))
        if e.get("publisher"):
            bits.append(clean(e.get("publisher")))
        if e.year:
            bits.append(e.year)
        if e.get("pages"):
            bits.append(f"pp. {spans(clean(e.get('pages')))}")
        parts.append(", ".join(bits) + ".")
    else:
        parts.append(f"<em>{rich(title)}</em>.")
        bits = []
        if e.get("edition"):
            bits.append(f"{clean(e.get('edition'))} ed.")
        if e.get("publisher"):
            bits.append(clean(e.get("publisher")))
        if e.year:
            bits.append(e.year)
        if link:
            bits.append(clean(link))
        parts.append((", ".join(bits) + ".") if bits else "")
    lead = f"{end(who)} " if who else ""
    if not who and e.type in {"article", "newspaper", "website"}:
        lead = ""
    return (lead + " ".join(p for p in parts if p)).replace("..", ".").strip()


def harvard_names(names):
    out = [clean(n.org) if n.org else f"{clean(n.family)}, {clean(n.initials())}".strip(", ") for n in names]
    if len(out) > 3:
        return out[0] + " et al."
    if len(out) <= 1:
        return "".join(out)
    return ", ".join(out[:-1]) + " and " + out[-1]


def harvard_reference(e):
    who = harvard_names(e.authors) or clean(e.get("title"))
    year = f"({e.year or 'no date'}{e.suffix})"
    title = e.get("title")
    link = e.link()
    available = ""
    if link:
        available = f" Available at: {clean(link)}" + (f" (Accessed: {clean(accessed_text(e, 'harvard'))})" if e.get("accessed") else "") + "."
    if e.type == "article":
        volume = f", {clean(e.get('volume'))}" if e.get("volume") else ""
        issue = f"({clean(e.get('issue'))})" if e.get("issue") else ""
        pages = f", pp. {spans(clean(e.get('pages')))}" if e.get("pages") else ""
        body = f"‘{rich(title)}’, <em>{clean(e.container())}</em>{volume}{issue}{pages}."
    elif e.type == "chapter":
        eds = " and ".join(f"{n.initials()} {n.family}" for n in e.editors)
        pages = f", pp. {spans(clean(e.get('pages')))}" if e.get("pages") else ""
        place = f" {clean(e.get('city'))}:" if e.get("city") else ""
        body = f"‘{rich(title)}’, in {clean(eds)} (ed{'s' if len(e.editors) > 1 else ''}.) <em>{clean(e.get('book', 'container'))}</em>.{place} {clean(e.get('publisher'))}{pages}."
    elif e.type in {"website", "video", "ai", "dataset", "image", "social", "lecture", "interview", "newspaper"}:
        body = f"<em>{rich(title)}</em>." + (f" {end(clean(e.container()))}" if e.container() else "")
    else:
        edition = f" {clean(e.get('edition'))} edn." if e.get("edition") else ""
        place = f"{clean(e.get('city'))}: " if e.get("city") else ""
        body = f"<em>{rich(title)}</em>.{edition} {place}{clean(e.get('publisher'))}."
    lead = f"{who} " if e.authors else f"<em>{rich(title)}</em> "
    if not e.authors:
        body = body.replace(f"<em>{rich(title)}</em>.", "", 1).strip()
    return f"{lead}{year} {body}{available}".replace("..", ".").replace(" .", ".").strip()


def chicago_names(names):
    if not names:
        return ""
    if len(names) > 10:
        names = names[:7]
    out = []
    for i, n in enumerate(names):
        if n.org:
            out.append(clean(n.org))
        elif i == 0:
            out.append(f"{clean(n.family)}, {clean(n.given)}".strip(", "))
        else:
            out.append(clean(f"{n.given} {n.family}".strip()))
    if len(out) == 1:
        return out[0]
    return ", ".join(out[:-1]) + ", and " + out[-1]


def chicago_reference(e):
    who = chicago_names(e.authors)
    year = (e.year or "n.d.") + e.suffix
    title = e.get("title")
    link = e.link()
    tail = f" {clean(link)}." if link else ""
    if e.type == "article":
        volume = f" {clean(e.get('volume'))}" if e.get("volume") else ""
        issue = f" ({clean(e.get('issue'))})" if e.get("issue") else ""
        pages = f": {spans(clean(e.get('pages')))}" if e.get("pages") else ""
        body = f"“{rich(title)}.” <em>{clean(e.container())}</em>{volume}{issue}{pages}."
    elif e.type == "chapter":
        eds = " and ".join(f"{n.given} {n.family}" for n in e.editors)
        pages = f", {spans(clean(e.get('pages')))}" if e.get("pages") else ""
        place = f" {clean(e.get('city'))}:" if e.get("city") else ""
        body = f"“{rich(title)}.” In <em>{clean(e.get('book', 'container'))}</em>, edited by {clean(eds)}{pages}.{place} {clean(e.get('publisher'))}."
    elif e.type in {"website", "video", "ai", "dataset", "image", "social", "lecture", "interview", "newspaper"}:
        when = date_long(e)
        body = f"“{rich(title)}.” " + (f"{clean(e.container())}. " if e.container() else "") + (f"{when}." if when else "")
    else:
        place = f"{clean(e.get('city'))}: " if e.get("city") else ""
        body = f"<em>{rich(title)}</em>. {place}{clean(e.get('publisher'))}."
    lead = f"{end(who)} " if who else ""
    return f"{lead}{year}. {body}{tail}".replace("..", ".").replace(" .", ".").strip()


def ieee_names(names):
    out = [clean(n.org) if n.org else f"{clean(n.initials())} {clean(n.family)}".strip() for n in names]
    if len(out) > 6:
        return out[0] + " et al."
    if len(out) <= 1:
        return "".join(out)
    if len(out) == 2:
        return " and ".join(out)
    return ", ".join(out[:-1]) + ", and " + out[-1]


def ieee_reference(e):
    who = ieee_names(e.authors)
    title = e.get("title")
    link = e.link()
    lead = f"{who}, " if who else ""
    if e.type == "article":
        bits = [f"<em>{clean(e.container())}</em>"]
        if e.get("volume"):
            bits.append(f"vol. {clean(e.get('volume'))}")
        if e.get("issue"):
            bits.append(f"no. {clean(e.get('issue'))}")
        if e.get("pages"):
            bits.append(f"pp. {spans(clean(e.get('pages')))}")
        if e.year:
            bits.append(e.year)
        tail = f", doi: {clean(e.get('doi'))}" if e.get("doi") else (f". [Online]. Available: {clean(link)}" if link else "")
        return f"{lead}“{rich(title)},” {', '.join(bits)}{tail}.".replace("..", ".")
    if e.type in {"website", "video", "ai", "dataset", "image", "social", "lecture", "interview", "newspaper"}:
        site = f" {clean(e.container())}." if e.container() else ""
        online = f" [Online]. Available: {clean(link)}" if link else ""
        seen = f" (accessed {clean(accessed_text(e, 'ieee'))})." if e.get("accessed") else ""
        return f"{lead}“{rich(title)}.”{site}{online}{seen}".replace("..", ".")
    if e.type == "chapter":
        eds = ", ".join(f"{n.initials()} {n.family}" for n in e.editors)
        place = f"{clean(e.get('city'))}: " if e.get("city") else ""
        pages = f", pp. {spans(clean(e.get('pages')))}" if e.get("pages") else ""
        return f"{lead}“{rich(title)},” in <em>{clean(e.get('book', 'container'))}</em>, {clean(eds)}, Ed{'s' if len(e.editors) > 1 else ''}. {place}{clean(e.get('publisher'))}, {e.year}{pages}.".replace("..", ".")
    place = f"{clean(e.get('city'))}: " if e.get("city") else ""
    edition = f" {clean(e.get('edition'))} ed." if e.get("edition") else ""
    return f"{lead}<em>{rich(title)}</em>.{edition} {place}{clean(e.get('publisher'))}, {e.year}.".replace("..", ".")


REFERENCE = {"apa": apa_reference, "mla": mla_reference, "harvard": harvard_reference, "chicago": chicago_reference, "ieee": ieee_reference}


def family_list(e, short=False):
    names = e.authors
    if not names:
        title = e.get("title")
        words = title.split()
        text = " ".join(words[:4]) + ("…" if len(words) > 4 else "")
        return f"<em>{rich(text)}</em>" if e.type in {"book", "report", "thesis", "video", "ai", "dataset", "other"} else f"“{rich(text)}”"
    labels = [clean(n.org) if n.org else clean(n.family) for n in names]
    return labels


def author_text(e, style):
    names = family_list(e)
    if isinstance(names, str):
        return names
    count = len(names)
    joiner = " & " if style == "apa" else " and "
    limit = 2 if style in {"apa", "mla", "harvard"} else 3
    if style == "chicago":
        limit = 3
    if count == 1:
        return names[0]
    if count == 2:
        return f"{names[0]}{joiner}{names[1]}"
    if style == "chicago" and count == 3:
        return f"{names[0]}, {names[1]}, and {names[2]}"
    return f"{names[0]} et al."


def locator_text(text, style):
    text = text.strip()
    if not text:
        return ""
    if style in {"mla", "chicago"}:
        text = re.sub(r"^pp?\.\s*", "", text)
    if re.fullmatch(r"[\d\-–]+", text):
        plain = spans(text)
        if style in {"mla", "chicago"}:
            return plain
        return ("pp. " if "–" in plain else "p. ") + plain
    return text


def cite_group(items, entries, style, order, narrative=False):
    parts = []
    for key, suppress, locator in items:
        e = entries[key]
        loc = locator_text(locator, style)
        if style == "ieee":
            parts.append((order[key], f"{order[key]}" + (f", {loc}" if loc else "")))
            continue
        who = author_text(e, style)
        year = (e.year or "n.d.") + e.suffix
        multiple = style == "mla" and e.authors and sum(1 for o in entries.values() if o.authors and o.authors[0].key() == e.authors[0].key() and o.number) > 1
        if style == "mla":
            title = f", <em>{rich(' '.join(e.get('title').split()[:4]))}</em>" if multiple else ""
            inner = f"{who}{title}" + (f" {loc}" if loc else "")
            parts.append((who.lower(), inner.strip()))
        elif style == "harvard":
            inner = "" if suppress else who + ", "
            inner += year + (f", {loc}" if loc else "")
            parts.append((who.lower(), inner))
        elif style == "chicago":
            inner = "" if suppress else who + " "
            inner += year + (f", {loc}" if loc else "")
            parts.append((who.lower(), inner))
        else:
            inner = "" if suppress else who + ", "
            inner += year + (f", {loc}" if loc else "")
            parts.append((who.lower(), inner))
    if style == "ieee":
        numbers = sorted(parts)
        pieces = ", ".join(f"[{text}]" for _, text in numbers)
        if len(numbers) >= 3 and all(isinstance(n, int) for n, _ in numbers) and all(b[0] - a[0] == 1 for a, b in zip(numbers, numbers[1:])) and all("," not in t for _, t in numbers):
            return f"[{numbers[0][1]}]–[{numbers[-1][1]}]"
        return pieces
    if style != "mla":
        parts.sort(key=lambda p: p[0])
    if narrative and len(items) == 1:
        e = entries[items[0][0]]
        who = author_text(e, style)
        year = (e.year or "n.d.") + e.suffix
        loc = locator_text(items[0][2], style)
        if style == "mla":
            return who + (f" ({loc})" if loc else "")
        if style == "chicago":
            return f"{who} ({year}" + (f", {loc}" if loc else "") + ")"
        return f"{who} ({year}" + (f", {loc}" if loc else "") + ")"
    return "(" + "; ".join(text for _, text in parts) + ")"


def assign_suffixes(cited):
    groups = {}
    for e in cited:
        who = e.authors[0].key() if e.authors else e.get("title").lower()
        groups.setdefault((who, e.year), []).append(e)
    for group in groups.values():
        if len(group) > 1:
            for letter, e in zip("abcdefghijklmnopqrstuvwxyz", sorted(group, key=lambda x: x.get("title").lower())):
                e.suffix = letter


def load_sources(path, report, where):
    text = Path(path).read_text(encoding="utf-8-sig")
    suffix = Path(path).suffix.lower()
    if suffix == ".json":
        return load_json(text, report, where)
    if suffix in {".bib", ".bibtex"}:
        return load_bibtex(text)
    return parse_blocks(text, report, where)


def parse_blocks(text, report, where):
    entries = {}
    for chunk in re.split(r"\n\s*\n", text.strip()):
        lines = [ln.rstrip() for ln in chunk.splitlines() if ln.strip() and not ln.strip().startswith(("%%", "//"))]
        if not lines:
            continue
        head = lines[0].strip()
        match = re.match(r"^@?([A-Za-z][\w:.-]*)\s*:?\s*$", head)
        if not match:
            report.error(where, f"each source starts with its key on its own line, e.g. @smith2020 (found '{head[:40]}')")
            continue
        fields = {}
        for ln in lines[1:]:
            pair = re.match(r"^\s*([A-Za-z]+)\s*:\s*(.*)$", ln)
            if not pair:
                if fields:
                    last = list(fields)[-1]
                    fields[last] += " " + ln.strip()
                continue
            name = pair.group(1).lower()
            if name not in FIELDS:
                near = [f for f in FIELDS if f.startswith(name[:3])]
                report.warn(where, f"unknown source field '{name}' in {match.group(1)}" + (f" (did you mean '{near[0]}'?)" if near else ""))
            fields[name] = pair.group(2).strip()
        entries[match.group(1)] = Entry(match.group(1), fields)
    return entries


def load_bibtex(text):
    entries = {}
    for match in re.finditer(r"@(\w+)\s*\{\s*([^,\s]+)\s*,(.*?)\n\}", text, re.S):
        kind, key, body = match.groups()
        fields = {"type": kind.lower()}
        for pair in re.finditer(r"(\w+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|\"[^\"]*\"|[\w.-]+)\s*,?", body):
            value = pair.group(2).strip("{}\" ")
            name = pair.group(1).lower()
            name = {"journaltitle": "journal", "booktitle": "book", "organization": "publisher", "address": "city", "location": "city"}.get(name, name)
            fields[name] = re.sub(r"[{}]", "", value)
        if "journal" in fields and fields["type"] == "article":
            fields["container"] = fields["journal"]
        entries[key] = Entry(key, fields)
    return entries


def load_json(text, report, where):
    data = json.loads(text)
    entries = {}
    for item in data if isinstance(data, list) else data.get("items", []):
        key = item.get("id") or item.get("citation-key") or f"item{len(entries) + 1}"
        authors = []
        for person in item.get("author", []):
            authors.append(person.get("literal") and "{" + person["literal"] + "}" or f"{person.get('family', '')}, {person.get('given', '')}")
        issued = (item.get("issued", {}).get("date-parts") or [[""]])[0]
        fields = {
            "type": {"article-journal": "article", "webpage": "website", "post-weblog": "website", "article-newspaper": "newspaper"}.get(item.get("type", "book"), item.get("type", "book")),
            "author": "; ".join(authors), "year": str(issued[0]) if issued else "", "title": item.get("title", ""),
            "container": item.get("container-title", ""), "publisher": item.get("publisher", ""), "volume": item.get("volume", ""),
            "issue": item.get("issue", ""), "pages": item.get("page", ""), "doi": item.get("DOI", ""), "url": item.get("URL", ""),
            "city": item.get("publisher-place", ""), "edition": item.get("edition", ""),
        }
        entries[key] = Entry(key, fields)
    return entries
