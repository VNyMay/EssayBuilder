import re

from ..inline import render_inline
from ..util import Options, css_length

NOTE_MODES = ("footnotes", "endnotes", "chapter")
VARIANTS = {
    "tip": "Tip",
    "warning": "Warning",
    "info": "Info",
    "important": "Important",
}
STEP = re.compile(r"^(?:\d+[.)]|[-*+])\s+")
CHECK = re.compile(r"^(?:[-*+]\s+)?\[([ xX])\]\s*(.*)$")


class Kit:
    DIRS = {
        "landscape",
        "columns",
        "tip",
        "warning",
        "info",
        "important",
        "abstract",
        "glossary",
        "checklist",
        "steps",
    }

    def notes_reset(self):
        self.note_defs = {}
        self.note_used = set()
        self.note_items = []
        self.note_unflushed = []
        self.note_pending = []
        self.note_serial = 0
        self.note_number = 0
        self.note_bands = 0
        self.in_note = False
        self.last_line = None

    def note_mode(self):
        return self.cfg.get("notes", "footnotes").strip().lower()

    def note_marker(self, label, text, where):
        if self.in_note:
            self.report.warn(where, "a note inside a note is ignored")
            return ""
        if label is not None:
            if label not in self.note_defs:
                self.report.error(where, f"note [^{label}] has no '[^{label}]: text'")
                return ""
            self.note_used.add(label)
            text = self.note_defs[label][0]
        self.note_serial += 1
        self.note_number += 1
        serial, number = self.note_serial, self.note_number
        self.in_note = True
        body = render_inline(text, self, where)
        self.in_note = False
        item = {"serial": serial, "number": number, "html": body}
        self.note_items.append(item)
        self.note_unflushed.append(item)
        if self.note_mode() != "footnotes":
            return (
                f'<sup class="fnr"><a id="enr-{serial}" href="#en-{serial}">'
                f"{number}</a></sup>"
            )
        self.note_pending.append(serial)
        return f'<sup class="fnr" data-n="{serial}">{number}</sup>'

    def band_notes(self, block, start):
        self.last_line = block.line
        pending, self.note_pending = self.note_pending, []
        if not pending:
            return
        band = self.note_band(pending)
        if block.kind == "heading":
            self.out.append(band)
        else:
            self.out.insert(start, band)

    def note_band(self, serials):
        self.note_bands += 1
        numbers = " ".join(str(n) for n in serials)
        return f'<div class="fnb" data-b="{self.note_bands}" data-n="{numbers}"></div>'

    def flush_notes(self, ending, line):
        mode = self.note_mode()
        if mode not in NOTE_MODES:
            self.report.error(
                self.path.name, f"notes must be one of: {', '.join(NOTE_MODES)}"
            )
            self.cfg["notes"] = "footnotes"
            return
        if not self.note_unflushed or mode == "footnotes":
            return
        if mode == "endnotes" and not ending:
            return
        items, self.note_unflushed = self.note_unflushed, []
        rows = "".join(
            f'<div class="en" id="en-{item["serial"]}">'
            f'<span class="nn">{item["number"]}</span>{item["html"]}</div>'
            for item in items
        )
        if mode == "chapter":
            self.ensure_section(line)
            self.emit(f'<div class="notes"><div class="nh">Notes</div>{rows}</div>')
            self.note_number = 0
            return
        from ..parse import Block, Line

        line = line or Line(self.path, 1, "")
        attrs = {"flags": {"nonumber"}}
        heading = {"level": 1, "text": "Notes", "attrs": attrs}
        self.do_heading(Block("heading", line, heading))
        self.emit(f'<div class="notes">{rows}</div>')

    def notes_pages(self):
        for label, (text, where) in self.note_defs.items():
            if label not in self.note_used:
                self.report.warn(where, f"note [^{label}] is defined but never used")
        if self.note_mode() != "footnotes" or not self.note_items:
            return ""
        rows = "".join(
            f'<div class="fnote"><span class="fnn">{item["number"]}</span>'
            f'{item["html"]}</div>'
            for item in self.note_items
        )
        return f'<section class="fnm">{rows}</section>'

    def dir_landscape(self, args, body, line):
        self.ensure_section(line)
        inner = self.sub_html(body, line)
        if self.note_pending:
            pending, self.note_pending = self.note_pending, []
            inner = self.note_band(pending) + inner
        self.emit(f'<div class="land">{inner}</div>')

    def dir_columns(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known={"count", "gap", "rule"})
        opts = Options.parse(head, self.report, line.where)
        given = args.strip()
        count = int(given) if given.isdigit() else int(opts.number("count", 2))
        if not 2 <= count <= 4:
            self.report.error(line.where, "columns must be 2, 3 or 4")
            count = 2
        gap = css_length(opts.get("gap") or "8mm", self.report, line.where) or "8mm"
        rule = (opts.get("rule") or "no").strip()
        style = f"column-count:{count};column-gap:{gap}"
        if rule.lower() in {"yes", "true", "on"}:
            style += ";column-rule:0.6pt solid #8a8a84"
        elif rule.lower() not in {"no", "false", "off", "none"}:
            style += f";column-rule:0.6pt solid {rule}"
        opts.finish({"count", "gap", "rule"})
        inner = self.sub_html(rest, line)
        self.emit(f'<div class="cols" style="{style}">{inner}</div>')

    def admonition(self, name, args, body, line):
        self.ensure_section(line)
        title = self.inline(args.strip(), line) if args.strip() else VARIANTS[name]
        inner = self.sub_html(body, line)
        self.emit(
            f'<div class="adm adm-{name}"><div class="at">{title}</div>{inner}</div>'
        )

    def dir_tip(self, args, body, line):
        self.admonition("tip", args, body, line)

    def dir_warning(self, args, body, line):
        self.admonition("warning", args, body, line)

    def dir_info(self, args, body, line):
        self.admonition("info", args, body, line)

    def dir_important(self, args, body, line):
        self.admonition("important", args, body, line)

    def dir_abstract(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known={"keywords", "title"})
        opts = Options.parse(head, self.report, line.where)
        title = opts.get("title") or args.strip() or "Abstract"
        words = [w.strip() for w in (opts.get("keywords") or "").split(",") if w.strip()]
        opts.finish({"keywords", "title"})
        inner = self.sub_html(rest, line)
        if words:
            shown = ", ".join(self.inline(w, line) for w in words)
            inner += f'<p class="kw"><b>Keywords:</b> {shown}</p>'
        self.emit(
            f'<div class="abs"><div class="at">{self.inline(title, line)}</div>'
            f"{inner}</div>"
        )

    def dir_glossary(self, args, body, line):
        self.ensure_section(line)
        head, rest = self.split_options(body, known={"sort"})
        opts = Options.parse(head, self.report, line.where)
        ordered = opts.flag("sort", True)
        opts.finish({"sort"})
        entries = []
        for ln in rest:
            text = ln.text
            if not text.strip():
                continue
            if text[0].isspace() and entries:
                entries[-1][1] += " " + text.strip()
                continue
            term, colon, meaning = text.partition(":")
            if not colon:
                self.report.error(ln.where, "a glossary line is 'term: definition'")
                continue
            entries.append([term.strip(), meaning.strip()])
        if ordered:
            entries.sort(key=lambda item: re.sub(r"[^\w ]", "", item[0]).casefold())
        rows = "".join(
            f"<dt>{self.inline(term, line)}</dt><dd>{self.inline(meaning, line)}</dd>"
            for term, meaning in entries
        )
        self.emit(f'<dl class="gloss">{rows}</dl>')

    def dir_checklist(self, args, body, line):
        self.ensure_section(line)
        items = []
        for ln in body:
            text = ln.text.strip()
            if not text:
                continue
            match = CHECK.match(text)
            if match:
                items.append([match.group(1) != " ", match.group(2)])
            elif ln.text[0].isspace() and items:
                items[-1][1] += " " + text
            else:
                items.append([False, STEP.sub("", text)])
        rows = "".join(
            f'<li class="{"done" if done else "todo"}"><span class="bx"></span>'
            f"<span>{self.inline(text, line)}</span></li>"
            for done, text in items
        )
        self.emit(f'<ul class="check">{rows}</ul>')

    def dir_steps(self, args, body, line):
        self.ensure_section(line)
        steps = []
        for ln in body:
            text = ln.text.strip()
            if not text:
                continue
            if ln.text[0].isspace() and steps:
                steps[-1] += " " + text
            else:
                steps.append(STEP.sub("", text))
        title = f'<div class="stt">{self.inline(args.strip(), line)}</div>' if args.strip() else ""
        rows = "".join(f"<li>{self.inline(text, line)}</li>" for text in steps)
        self.emit(f'<div class="steps">{title}<ol>{rows}</ol></div>')
