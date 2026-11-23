"""Builds the AI skill from its parts, so nothing drifts apart.

  ai/parts/browser-intro.md       who the AI is, the rules, the interview, what to give back
  ai/parts/craft.md               design judgment: looks, pictures, pages, fonts, self-critique
  ai/parts/style-interview.md     the 5 / 10 / 20 question interview about the look + the style samples loop
  ai/parts/cheatsheet.md          the whole syntax on one page
  ai/parts/mistakes.md            the mistakes that happen most + the pre-flight checklist
  ai/parts/format-reference.md    every setting and block, with all options
  ai/templates/*.txt              ready-made starting files for each kind of document

Outputs (run again after changing any part):
  AI Prompt.txt                        paste into any browser AI chat (ChatGPT, Claude.ai, Gemini ...)
  ai/skill/essay-builder/SKILL.md      the same skill with front matter (Claude Code: copy the folder to ~/.claude/skills/)
  Essay Builder Skill.zip              the same, zipped for uploading as a skill in Claude.ai

Usage:  python ai/make_prompt.py
"""
import re
import sys
import zipfile
from pathlib import Path

AI = Path(__file__).resolve().parent
ROOT = AI.parent
MARKER = "<!-- CRAFT -->"
STYLE_MARKER = "<!-- STYLE -->"
FRONT = """---
name: essay-builder
description: Turns a student's essay text, plus the paths of their images, tables and code, into one plain-text file that the Essay Builder program on their computer makes into a beautifully typeset PDF. Use when a student wants an essay, TOK exhibition, IA or report typeset, formatted or built with Essay Builder.
---

"""
TEMPLATES = [
    ("extended-essay.txt", "Extended Essay or any long research essay (cover, contents, numbered sections)"),
    ("tok-exhibition.txt", "TOK exhibition: one object per page, a small picture beside each, no cover or contents"),
    ("tok-essay.txt", "TOK essay or any medium-length essay answering a set title (title block, flowing sections)"),
    ("science-ia.txt", "Science or maths IA, lab report: data tables, charts, equations"),
    ("history-essay.txt", "History, geography, economics or humanities essay: pictures, timeline, references"),
    ("cs-ia.txt", "Computer Science IA or a report with code, screenshots and diagrams"),
    ("blank.txt", "Anything else: the smallest possible starting file"),
]
FOOTER = """
## Last reminder

Start now with Step 0: ask the student to paste the result of **List my files.bat** (or to type the full path of each image, data file and code file). Do not write the essay file until the student has confirmed the table in Step 8. Your words stay the student's; the layout is yours. Copy from the cheat sheet and the templates; do not improvise syntax.
"""


def part(name):
    return (AI / "parts" / name).read_text(encoding="utf-8").strip()


def kit_docs():
    folder = AI / "parts" / "kits"
    return [path.read_text(encoding="utf-8").strip() for path in sorted(folder.glob("*.md"))]


def build():
    intro = part("browser-intro.md")
    if MARKER not in intro:
        sys.exit(f"ai/parts/browser-intro.md must contain {MARKER}")
    sections = [
        intro.replace(MARKER, part("craft.md")).replace(STYLE_MARKER, part("style-interview.md")),
        part("cheatsheet.md"),
        part("mistakes.md"),
        part("format-reference.md").replace("# Format reference", "## The format reference (every setting and block)", 1),
        *kit_docs(),
    ]
    templates = ["## Templates\n\nStart from the template that matches the document type. Replace every `{{...}}` with the student's own material, delete what the student does not have, and keep the settings unless the confirmed table says otherwise."]
    for name, use in TEMPLATES:
        text = (AI / "templates" / name).read_text(encoding="utf-8").rstrip()
        templates.append(f"### Template `{name}`: {use}\n\n````\n{text}\n````")
    sections.append("\n\n".join(templates))
    body = "\n\n".join(sections).rstrip() + "\n" + FOOTER
    body = re.sub(r"\n{3,}", "\n\n", body)

    (ROOT / "AI Prompt.txt").write_text(body, encoding="utf-8", newline="\n")
    skill_dir = AI / "skill" / "essay-builder"
    skill_dir.mkdir(parents=True, exist_ok=True)
    skill = FRONT + body
    (skill_dir / "SKILL.md").write_text(skill, encoding="utf-8", newline="\n")
    with zipfile.ZipFile(ROOT / "Essay Builder Skill.zip", "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("essay-builder/SKILL.md", skill)
    print(f"Wrote AI Prompt.txt, ai/skill/essay-builder/SKILL.md and Essay Builder Skill.zip "
          f"({len(body):,} characters, about {len(body) // 4:,} tokens)")


if __name__ == "__main__":
    build()
