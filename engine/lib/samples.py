"""Style samples: the first page of the student's own essay in four different looks, in one PDF.

Looking at the same words in four designs is the fastest way to say "this one, but with ..."."""
import re
import tempfile
from pathlib import Path

VARIANTS = [
    ("A", "Classic", "look: essay (formal: ruled headings, justified text)",
     ["look: essay"]),
    ("B", "Modern", "look: compact (clean: navy headings, left-aligned text)",
     ["look: compact"]),
    ("C", "Document", "look: document (underlined headings, indented paragraphs)",
     ["look: document", "font-size: 11"]),
    ("D", "Large print", "look: essay, font-size: 12, line-spacing: 1.8 (airy)",
     ["look: essay", "font-size: 12", "line-spacing: 1.8"]),
]
OVERRIDDEN = {"look", "font-size", "line-spacing", "heading-style", "heading-size", "justify", "paragraph-indent",
              "paragraph-spacing", "cover", "contents", "page-numbers", "page-numbering", "section-breaks",
              "list-of-figures", "list-of-tables", "caption-style", "table-size", "caption-size"}
LIMIT = 2300  # characters of the essay shown in each sample


def split(text):
    """(settings lines, body text) of an essay file."""
    lines = text.splitlines()
    first = next((i for i, l in enumerate(lines) if l.strip() and not l.lstrip().startswith(("%%", "//"))), 0)
    if not re.match(r"^[A-Za-z][\w-]*\s*:", lines[first] if lines else ""):
        return [], text
    end = next((j for j in range(first, len(lines)) if lines[j].strip() == "---"), None)
    if end is None:
        return [], text
    return lines[first:end], "\n".join(lines[end + 1:])


def excerpt(body):
    """The first ~LIMIT characters, cut at a blank line outside any ::: block."""
    out, size, depth = [], 0, 0
    for line in body.splitlines():
        stripped = line.strip()
        if stripped.startswith(":::"):
            depth = 0 if stripped == ":::" else depth + 1
        out.append(line)
        size += len(line) + 1
        if size >= LIMIT and depth == 0 and not stripped:
            break
    return "\n".join(out).rstrip() + "\n"


def make(essay, build):
    import pymupdf

    essay = Path(essay)
    settings, body = split(essay.read_text(encoding="utf-8-sig"))
    kept = [l for l in settings if not (re.match(r"^([A-Za-z][\w-]*)\s*:", l) and re.match(r"^([A-Za-z][\w-]*)", l).group(1).lower() in OVERRIDDEN)]
    if not any(l.lower().startswith("title") for l in kept):
        kept.insert(0, f"title: {essay.stem}")
    sample = excerpt(body)
    out = pymupdf.open()
    work = Path(tempfile.mkdtemp())
    for label, name, note, extra in VARIANTS:
        temp = essay.with_name(f".{essay.stem}.sample{label}.txt")
        temp.write_text("\n".join(kept + extra + ["cover: no", "contents: no", "page-numbers: no", "section-breaks: no"]) + "\n---\n" + sample, encoding="utf-8")
        pdf = work / f"{label}.pdf"
        try:
            build(temp, pdf)
        except SystemExit as error:
            print(f"sample {label} skipped: {error}")
            continue
        finally:
            temp.unlink(missing_ok=True)
        with pymupdf.open(pdf) as part:
            out.insert_pdf(part, from_page=0, to_page=0)
        page = out[-1]
        page.insert_text((36, 28), f"Style {label}: {name}", fontsize=11, fontname="helv", color=(0.12, 0.31, 0.47))
        page.insert_text((36, 42), note, fontsize=8.5, fontname="helv", color=(0.35, 0.35, 0.35))
    target = essay.with_name(f"{essay.stem} - style samples.pdf")
    out.save(target)
    return target
