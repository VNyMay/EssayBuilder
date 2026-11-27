import difflib
import re

from .. import citations
from ..util import Options, resolve

MARK = "\x04"
ITEM = re.compile(r"^(-?)@([A-Za-z][\w:.-]*?)\s*(?:,\s*(.+))?$")


def group_items(raw):
    items = []
    for piece in raw.split(";"):
        match = ITEM.match(piece.strip())
        if match:
            items.append((match.group(2), bool(match.group(1)), (match.group(3) or "").strip()))
    return items


class Kit:
    DIRS = {"sources", "bibliography"}

    def bib_state(self):
        if not hasattr(self, "bib_entries"):
            self.bib_entries, self.bib_cites, self.bib_marks, self.bib_all = {}, [], 0, False
            self.cite_map = {}
        return self.bib_entries

    def add_cite(self, raw, narrative, where):
        self.bib_state()
        self.bib_cites.append((raw, narrative, where))
        return f"{MARK}{len(self.bib_cites) - 1}{MARK}"

    def load_source_file(self):
        name = self.cfg.get("sources", "").strip()
        if not name:
            return
        path = resolve(name, self.bases)
        if path is None:
            self.report.error(self.path.name, f"sources file not found: {name}")
            return
        try:
            self.bib_state().update(citations.load_sources(path, self.report, self.path.name))
        except Exception as error:
            self.report.error(self.path.name, f"cannot read {path.name}: {error}")

    def dir_sources(self, args, body, line):
        entries = self.bib_state()
        lines = [ln.text for ln in body]
        text = "\n".join(lines)
        file = re.match(r"^\s*(?:file|src)\s*:\s*(.+?)\s*$", text.strip())
        if file:
            path = resolve(file.group(1), self.bases)
            if path is None:
                self.report.error(line.where, f"sources file not found: {file.group(1)}")
                return
            entries.update(citations.load_sources(path, self.report, line.where))
            return
        entries.update(citations.parse_blocks(text, self.report, line.where))

    def dir_bibliography(self, args, body, line):
        self.ensure_section(line)
        self.bib_state()
        head = [ln for ln in body if ln.text.strip()]
        opts = Options.parse([ln.text for ln in head], self.report, line.where)
        self.bib_all = opts.flag("all")
        opts.finish({"all"})
        self.bib_marks += 1
        self.emit('<div class="bibwrap"><!--BIB--></div>')

    def resolve_cites(self, text):
        entries = self.bib_state()
        if not self.bib_cites and "<!--BIB-->" not in text:
            return text
        style = self.cfg.get("citations", "apa").strip().lower()
        style = citations.ALIASES.get(style, style)
        if style not in citations.STYLES:
            self.report.error(self.path.name, f"citations must be one of: {', '.join(citations.STYLES)}")
            style = "apa"
        cited, order, parsed = [], {}, []
        for raw, narrative, where in self.bib_cites:
            items = group_items(raw)
            good = []
            for key, suppress, locator in items:
                if key not in entries:
                    if not narrative:
                        near = difflib.get_close_matches(key, list(entries), n=1)
                        self.report.error(where, f"source '{key}' is not defined" + (f" (did you mean '{near[0]}'?)" if near else " (add it in a :::sources block or a sources: file)"))
                    continue
                if entries[key] not in cited:
                    cited.append(entries[key])
                    order[key] = len(order) + 1
                    entries[key].number = order[key]
                good.append((key, suppress, locator))
            parsed.append(good)
        if style in {"apa", "harvard", "chicago"}:
            citations.assign_suffixes(cited)
        def swap(match):
            index = int(match.group(1))
            raw, narrative, _ = self.bib_cites[index]
            items = parsed[index]
            if not items:
                return raw if narrative else '<span class="bad">[source?]</span>'
            shown = citations.cite_group(items, entries, style, order, narrative)
            self.cite_map[raw] = re.sub(r"<[^>]+>", "", shown)
            return shown if narrative else f"<!--cite-->{shown}<!--/cite-->"
        text = re.sub(f"{MARK}(\\d+){MARK}", swap, text)
        shown = list(entries.values()) if self.bib_all else cited
        if style == "ieee":
            shown = sorted(shown, key=lambda e: e.number or 10**6)
        else:
            shown = sorted(shown, key=lambda e: e.sort_key())
        make = citations.REFERENCE[style]
        paragraphs = []
        for e in shown:
            body = make(e)
            if style == "ieee":
                paragraphs.append(f'<p class="ref num"><span class="refnum">[{e.number}]</span> {body}</p>')
            else:
                paragraphs.append(f'<p class="ref">{body}</p>')
        if not paragraphs and self.studio:
            paragraphs.append('<p class="ref"><span class="ph">No sources cited yet</span></p>')
        if not self.bib_all:
            for key, e in entries.items():
                if e not in cited and entries:
                    self.report.warn(self.path.name, f"source '{key}' is never cited (use [@{key}] in the text, or 'all: yes' in :::bibliography)")
        if "<!--BIB-->" in text:
            text = text.replace("<!--BIB-->", "".join(paragraphs), 1).replace("<!--BIB-->", "")
        elif cited:
            self.report.warn(self.path.name, "citations are used but there is no reference list: add a References heading followed by :::bibliography")
        return text
