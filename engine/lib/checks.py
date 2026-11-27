import json
import re
from pathlib import Path

from .kits.bib import group_items
from .parse import COMMENT, DIRECTIVE, END_WORDS, HEADING, NO_BODY, Compiler
from .util import Report

STARTER_DIR = Path(__file__).resolve().parents[2] / "studio" / "starters"
LONG_PARAGRAPH = 300
REPEAT = re.compile(r"(?<![\w'’-])([A-Za-z]+)\s+\1(?![\w'’-])", re.I)
FINE_REPEATS = {"had", "that", "bye", "ha", "no", "very", "far", "so", "many", "knock", "tut", "boo"}
WORD = re.compile(r"[^\W_][\w\u0300-\u036f\u0610-\u061a\u064b-\u065f\u0670\u06d6-\u06ed’'.\-]*")
WHERE = re.compile(r"^(.*?):(\d+):\s*([\s\S]*)$")
HINT_MARK = re.compile(r"\byour\b|\bhere\b|\.\.\.|\babc123\b|^title of\b|^name of\b|\bname of the\b", re.I)
PLACEHOLDER_HEADING = re.compile(r"\b(name of|your|first|second|third)\b", re.I)
OPTION_LINE = re.compile(r"^[a-z][\w-]*\s*:\s")
SAMPLE_AUTHOR = "surname, firstname"
OWN_TOPICS = (
    re.compile(r"^(figure|table) \S+ has no caption"),
    re.compile(r"is never mentioned in the text"),
    re.compile(r"^source '[^']+' is never cited"),
    re.compile(r"^source '[^']+' is not defined"),
    re.compile(r"^citations are used but there is no reference list"),
    re.compile(r"^no title"),
    re.compile(r"dpi at this size"),
)

TASKS = {
    "extended-essay": {
        "name": "Extended Essay",
        "limit": 4000,
        "question": True,
        "keys": r"\bextended essay\b|\bEE\b",
        "criteria": [
            (
                "A",
                "Framework for the essay",
                [
                    "Chosen a focused topic and research question",
                    "Used a structure that suits the subject",
                    "Laid it out clearly: headings, figures, references",
                ],
            ),
            (
                "B",
                "Knowledge and understanding",
                [
                    "Shown sound knowledge of the topic",
                    "Used subject terms and concepts accurately",
                    "Chosen relevant, reliable sources",
                ],
            ),
            (
                "C",
                "Analysis and line of argument",
                [
                    "Analysed my evidence, not just described it",
                    "Kept one clear line of argument",
                    "Linked every section back to the question",
                ],
            ),
            (
                "D",
                "Discussion and evaluation",
                [
                    "Discussed what my findings mean",
                    "Evaluated my sources and methods",
                    "Reached a conclusion that answers the question",
                ],
            ),
            (
                "E",
                "Reflection",
                [
                    "Reflected on my research process",
                    "Written my three reflections in the RPF",
                    "Prepared my reflective statement after the viva",
                ],
            ),
        ],
    },
    "tok-essay": {
        "name": "TOK Essay",
        "limit": 1600,
        "title": "prescribed title",
        "keys": r"\btok\b(?!\s+exhibition)|theory of knowledge|prescribed title",
        "criteria": [
            (
                "T",
                "Title",
                [
                    "Copied the prescribed title word for word",
                    "Kept the title's key terms in focus",
                ],
            ),
            (
                "K",
                "Knowledge questions",
                [
                    "Explored knowledge questions, not just topics",
                    "Linked arguments to two areas of knowledge",
                ],
            ),
            (
                "C",
                "Claims and counterclaims",
                [
                    "Made clear claims",
                    "Weighed counterclaims fairly",
                ],
            ),
            (
                "X",
                "Examples",
                [
                    "Used specific, real examples",
                    "Explained why each example matters",
                ],
            ),
            (
                "P",
                "Perspectives and conclusions",
                [
                    "Considered different perspectives",
                    "Drawn conclusions and their implications",
                ],
            ),
        ],
    },
    "tok-exhibition": {
        "name": "TOK Exhibition",
        "limit": 950,
        "title": "IA prompt",
        "objects": 3,
        "keys": r"\bexhibition\b|\bIA prompt\b",
        "criteria": [
            (
                "P",
                "Prompt",
                [
                    "Chosen one IA prompt, copied word for word",
                    "Used the same prompt for all three objects",
                ],
            ),
            (
                "O",
                "Objects",
                [
                    "Included three objects, each with an image",
                    "Given each object a specific real-world context",
                ],
            ),
            (
                "L",
                "Links to the prompt",
                [
                    "Explained how each object links to the prompt",
                    "Supported links with evidence and TOK concepts",
                ],
            ),
            (
                "J",
                "Justification",
                [
                    "Justified why each object was chosen",
                    "Shown what each object adds",
                ],
            ),
        ],
    },
    "science-ia": {
        "name": "Science IA",
        "limit": 3000,
        "question": True,
        "keys": r"\bscience ia\b|\b(biology|chemistry|physics)\b",
        "criteria": [
            (
                "R",
                "Research design",
                [
                    "Written a focused research question",
                    "Explained the relevant background",
                    "Described a method someone could repeat",
                    "Identified and controlled variables",
                    "Considered safety, ethics and the environment",
                ],
            ),
            (
                "D",
                "Data analysis",
                [
                    "Recorded raw data with units and uncertainties",
                    "Processed data correctly",
                    "Presented data in clear tables and graphs",
                    "Shown how uncertainties affect the result",
                ],
            ),
            (
                "C",
                "Conclusion",
                [
                    "Drawn a conclusion justified by the data",
                    "Compared results with accepted science",
                ],
            ),
            (
                "E",
                "Evaluation",
                [
                    "Identified weaknesses and limitations",
                    "Suggested realistic improvements",
                ],
            ),
        ],
    },
    "maths-ia": {
        "name": "Maths IA",
        "pages": (12, 20),
        "keys": r"\bmaths?\b|\bmathematic|\bexploration\b",
        "criteria": [
            (
                "A",
                "Presentation",
                [
                    "Organised it with an introduction, body and conclusion",
                    "Made it easy to follow from start to finish",
                ],
            ),
            (
                "B",
                "Mathematical communication",
                [
                    "Used correct notation and terms",
                    "Defined every variable",
                    "Labelled graphs, tables and equations",
                ],
            ),
            (
                "C",
                "Personal engagement",
                [
                    "Shown my own interest and ideas",
                    "Asked and explored my own questions",
                ],
            ),
            (
                "D",
                "Reflection",
                [
                    "Reflected on results and their limits",
                    "Considered what to explore next",
                ],
            ),
            (
                "E",
                "Use of mathematics",
                [
                    "Used maths at the level of my course",
                    "Checked that the maths is correct",
                    "Shown understanding, not just results",
                ],
            ),
        ],
    },
    "cs-ia": {
        "name": "Computer Science IA",
        "limit": 2000,
        "keys": r"\bcomputer science\b|\bCS\b",
        "criteria": [
            (
                "A",
                "Problem specification",
                [
                    "Described the problem and the client",
                    "Listed specific, testable success criteria",
                ],
            ),
            (
                "B",
                "Planning",
                [
                    "Planned the solution and timeline",
                ],
            ),
            (
                "C",
                "System overview",
                [
                    "Designed the system with diagrams and data structures",
                    "Written a test plan",
                ],
            ),
            (
                "D",
                "Development",
                [
                    "Explained the techniques I used",
                    "Justified my design choices",
                    "Kept the code well structured",
                ],
            ),
            (
                "E",
                "Evaluation",
                [
                    "Evaluated against every success criterion",
                    "Suggested improvements",
                ],
            ),
        ],
    },
    "history-ia": {
        "name": "History IA",
        "limit": 2200,
        "question": True,
        "keys": r"\bhistor(y|ical)\b",
        "criteria": [
            (
                "A",
                "Identification and evaluation of sources",
                [
                    "Stated a clear question",
                    "Evaluated two sources: origin, purpose, content",
                    "Explained their value and limitations",
                ],
            ),
            (
                "B",
                "Investigation",
                [
                    "Organised a focused investigation",
                    "Used a range of sources",
                    "Analysed critically and reached a conclusion",
                ],
            ),
            (
                "C",
                "Reflection",
                [
                    "Reflected on the methods historians use",
                    "Linked my reflection to the investigation",
                ],
            ),
        ],
    },
    "english-essay": {
        "name": "English Essay",
        "limit": 1500,
        "keys": r"\benglish\b|\bliterature\b|line of inquiry",
        "criteria": [
            (
                "A",
                "Knowledge, understanding and interpretation",
                [
                    "Shown knowledge of the work",
                    "Supported my interpretation with references",
                ],
            ),
            (
                "B",
                "Analysis and evaluation",
                [
                    "Analysed the author's choices",
                    "Evaluated their effect",
                ],
            ),
            (
                "C",
                "Focus, organisation and development",
                [
                    "Kept focus on the line of inquiry",
                    "Developed ideas in a clear order",
                    "Woven quotations into my sentences",
                ],
            ),
            (
                "D",
                "Language",
                [
                    "Written clearly and precisely",
                    "Used literary terms accurately",
                ],
            ),
        ],
    },
    "business-ia": {
        "name": "Business Management IA",
        "limit": 1800,
        "question": True,
        "keys": r"\bbusiness\b|\bBM IA\b|\bkey concept\b",
        "criteria": [
            (
                "A",
                "Integration of a key concept",
                [
                    "Chosen one key concept: change, creativity, ethics or sustainability",
                    "Linked the key concept to the question all the way through",
                ],
            ),
            (
                "B",
                "Supporting documents",
                [
                    "Used three to five supporting documents",
                    "Chosen relevant documents from the last three years",
                    "Included a range of views and data",
                ],
            ),
            (
                "C",
                "Tools and theories",
                [
                    "Chosen business tools that suit the question",
                    "Applied them to data from my documents",
                ],
            ),
            (
                "D",
                "Analysis and evaluation",
                [
                    "Analysed what the tools show",
                    "Weighed stakeholder views and the limits of the evidence",
                ],
            ),
            (
                "E",
                "Conclusions",
                [
                    "Answered the research question directly",
                    "Based the conclusion only on my analysis",
                ],
            ),
            (
                "F",
                "Structure",
                [
                    "Organised it in a clear, logical order",
                ],
            ),
            (
                "G",
                "Presentation",
                [
                    "Added a title page, contents and page numbers",
                    "Labelled every table and figure",
                    "Referenced every source",
                ],
            ),
        ],
    },
    "digital-society-ia": {
        "name": "Digital Society IA",
        "limit": 1500,
        "question": True,
        "keys": r"\bdigital society\b|\binquiry process\b",
        "criteria": [
            (
                "A",
                "Inquiry focus",
                [
                    "Written a focused inquiry question",
                    "Named a real digital system and the people it affects",
                ],
            ),
            (
                "B",
                "Claims and perspectives",
                [
                    "Used three key sources",
                    "Explained the claims and perspectives in each",
                ],
            ),
            (
                "C",
                "Analysis and evaluation",
                [
                    "Analysed impacts and implications for people",
                    "Evaluated how reliable my sources are",
                ],
            ),
            (
                "D",
                "Conclusion",
                [
                    "Reached a conclusion that answers the inquiry question",
                    "Suggested further steps or questions",
                ],
            ),
            (
                "E",
                "Communication",
                [
                    "Kept the recorded presentation under 10 minutes",
                    "Communicated clearly with good visuals",
                ],
            ),
        ],
    },
    "english-io": {
        "name": "English Individual Oral",
        "keys": r"\bindividual oral\b|\bglobal issue\b|\bIO\b",
        "criteria": [
            (
                "A",
                "Knowledge, understanding and interpretation",
                [
                    "Shown how both extracts present the global issue",
                    "Linked each extract to its work as a whole",
                ],
            ),
            (
                "B",
                "Analysis and evaluation",
                [
                    "Analysed the authors' choices",
                    "Evaluated how those choices shape the global issue",
                ],
            ),
            (
                "C",
                "Focus and organisation",
                [
                    "Kept to 10 bullet points or fewer",
                    "Balanced time between the two works",
                    "Planned for 10 minutes, then 5 minutes of questions",
                ],
            ),
            (
                "D",
                "Language",
                [
                    "Practised speaking clearly, not reading a script",
                    "Used literary terms accurately",
                ],
            ),
        ],
    },
    "french-writing": {
        "name": "French Writing Task",
        "limit": 600,
        "keys": r"\bfrench\b|\bfran[cç]ais\b",
        "criteria": [
            (
                "A",
                "Language",
                [
                    "Used varied vocabulary and complex structures",
                    "Checked accents, agreements and verb tenses",
                ],
            ),
            (
                "B",
                "Message",
                [
                    "Answered every part of the task",
                    "Developed ideas with details and examples",
                    "Linked ideas with connectors",
                ],
            ),
            (
                "C",
                "Conceptual understanding",
                [
                    "Used the conventions of the text type",
                    "Chosen a register that suits the audience",
                    "Kept the purpose of the text clear",
                ],
            ),
        ],
    },
    "arabic-writing": {
        "name": "Arabic Writing Task",
        "limit": 600,
        "keys": r"\barabic\b|عربي|العربية",
        "criteria": [
            (
                "A",
                "Language",
                [
                    "Used varied vocabulary and complex structures",
                    "Checked spelling, grammar and agreement",
                ],
            ),
            (
                "B",
                "Message",
                [
                    "Answered every part of the task",
                    "Developed ideas with details and examples",
                    "Linked ideas with connectors",
                ],
            ),
            (
                "C",
                "Conceptual understanding",
                [
                    "Used the conventions of the text type",
                    "Chosen a register that suits the audience",
                    "Kept the purpose of the text clear",
                ],
            ),
        ],
    },
    "cas-reflection": {
        "name": "CAS Reflection",
        "keys": r"\bCAS\b(?!\s+project)",
        "criteria": [
            (
                "R",
                "Reflection",
                [
                    "Described what happened briefly",
                    "Explained what I learned about myself and others",
                    "Linked it to at least one learning outcome",
                    "Said what I will do next",
                ],
            ),
            (
                "E",
                "Evidence",
                [
                    "Added a photo or other evidence",
                    "Uploaded it to ManageBac or my CAS portfolio",
                ],
            ),
        ],
    },
    "cas-project": {
        "name": "CAS Project",
        "keys": r"\bCAS project\b",
        "criteria": [
            (
                "S",
                "Five CAS stages",
                [
                    "Investigated a real need or interest",
                    "Prepared a plan with roles and a timeline",
                    "Taken action as a team",
                    "Reflected on the process and impact",
                    "Demonstrated the project to others",
                ],
            ),
            (
                "T",
                "Teamwork and time",
                [
                    "Worked with at least one other student",
                    "Kept it going for at least a month",
                ],
            ),
        ],
    },
    "essay": {
        "name": "Essay",
        "keys": r"$^",
        "criteria": [
            (
                "A",
                "Argument",
                [
                    "Stated a clear thesis",
                    "Made every paragraph support it",
                ],
            ),
            (
                "B",
                "Evidence",
                [
                    "Supported points with evidence",
                    "Cited every source",
                ],
            ),
            (
                "C",
                "Presentation",
                [
                    "Proofread the whole essay",
                    "Kept formatting consistent",
                ],
            ),
        ],
    },
    "report": {
        "name": "Report",
        "keys": r"\breport\b",
        "criteria": [
            (
                "A",
                "Content",
                [
                    "Written a short summary",
                    "Explained the method",
                    "Presented the findings clearly",
                    "Based recommendations on the findings",
                ],
            ),
            (
                "B",
                "Presentation",
                [
                    "Used clear headings",
                    "Cited every source",
                    "Proofread the whole report",
                ],
            ),
        ],
    },
    "lab-report": {
        "name": "Lab Report",
        "keys": r"\blab\b|\bexperiment\b",
        "criteria": [
            (
                "A",
                "Planning",
                [
                    "Stated the aim and hypothesis",
                    "Listed the variables and materials",
                    "Written a method someone could repeat",
                ],
            ),
            (
                "B",
                "Results",
                [
                    "Recorded data with units and uncertainties",
                    "Drawn labelled graphs",
                ],
            ),
            (
                "C",
                "Conclusion and evaluation",
                [
                    "Linked the conclusion to the hypothesis",
                    "Evaluated errors and improvements",
                ],
            ),
        ],
    },
}


class Inspector(Compiler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.floats = []
        self.top_blocks = []

    def emit_top(self, blocks):
        self.top_blocks = blocks
        return super().emit_top(blocks)

    def caption(self, kind, opts, line, extra_class=""):
        result = super().caption(kind, opts, line, extra_class)
        self.floats.append({"kind": kind, "label": result[2], "caption": opts.get("caption"), "id": opts.get("id", ""), "line": line})
        return result

    def figure(self, opts, line):
        if not opts.get("caption"):
            self.floats.append({"kind": "img", "label": "Image", "caption": None, "id": "", "line": line})
        return super().figure(opts, line)


def normal(text):
    text = re.sub(r"\[-?@[^\]]*\]", " ", text)
    text = re.sub(r"\\\\", " ", text)
    return " ".join(re.sub(r"[^a-z0-9?]+", " ", text.lower()).split())


def sentences(text):
    return [piece for piece in re.split(r"(?<=[.!?])\s+|\\\\|\s·\s|\s\|\s", text) if piece.strip()]


def starter_parts(text):
    head, _, body = text.partition("\n---\n")
    header = {}
    for line in head.splitlines():
        match = re.match(r"^([A-Za-z][\w-]*)\s*:\s*(.*)$", line)
        if match:
            header[match.group(1).lower()] = match.group(2).strip()
    units, headings, texts, block = set(), set(), [], None
    for line in body.splitlines():
        stripped = line.strip()
        directive = DIRECTIVE.match(stripped)
        if directive:
            block = directive.group(1).lower()
            continue
        if stripped == ":::":
            block = None
            continue
        if block in {"sources", "bibliography", "references", "code", "run"} or not stripped or stripped == "---":
            continue
        heading = HEADING.match(stripped)
        if heading:
            title = re.sub(r"\s*\{[^}]*\}\s*$", "", heading.group(2))
            if PLACEHOLDER_HEADING.search(title):
                headings.add(normal(title))
            continue
        if block and OPTION_LINE.match(stripped):
            continue
        if block == "text":
            texts.extend(normal(piece) for piece in re.split(r"\\\\", stripped) if normal(piece))
        for piece in sentences(stripped.strip("|")):
            unit = normal(piece)
            if len(unit.split()) >= 4 or (block == "text" and HINT_MARK.search(piece)):
                units.add(unit)
    return {"header": header, "units": units, "headings": headings, "texts": texts, "body": body}


STARTER_CACHE = {}


def starters():
    out = {}
    for ident in TASKS:
        file = STARTER_DIR / f"{ident}.txt"
        if not file.is_file():
            continue
        stamp = file.stat().st_mtime
        cached = STARTER_CACHE.get(ident)
        if not cached or cached[0] != stamp:
            cached = (stamp, starter_parts(file.read_text(encoding="utf-8")))
            STARTER_CACHE[ident] = cached
        out[ident] = cached[1]
    return out


def heading_titles(lines):
    found = []
    for line in lines:
        match = HEADING.match(line.strip())
        if match and len(match.group(1)) <= 2:
            found.append(normal(re.sub(r"\s*\{[^}]*\}\s*$", "", match.group(2))))
    return found


def detect(cfg, lines, known):
    titles = set(heading_titles(lines))
    text = normal(" ".join(lines))
    words = " ".join(str(cfg.get(key, "")) for key in ("title", "subject", "question"))
    limit = str(cfg.get("word-limit", "")).strip()
    scores = {}
    for ident, task in TASKS.items():
        starter = known.get(ident)
        score = 0.0
        if re.search(task["keys"], words, re.I):
            score += 3
        if task.get("question") and str(cfg.get("question", "")).strip():
            score += 1.5
        if starter:
            if limit and starter["header"].get("word-limit") == limit:
                score += 2
            theirs = set(heading_titles(starter["body"].splitlines()))
            if titles and theirs:
                score += 6 * len(titles & theirs) / len(titles | theirs)
            hits = sum(1 for unit in starter["units"] if len(unit.split()) >= 6 and unit in text)
            score += min(hits, 3)
        scores[ident] = score
    ranked = sorted(scores.items(), key=lambda item: -item[1])
    if ranked[0][1] >= 3 and (len(ranked) < 2 or ranked[0][1] - ranked[1][1] >= 0.5):
        return ranked[0][0]
    return None


def count_words(text):
    text = re.sub(r"\[-?@[^\]]*\]|\$[^$]*\$|\{[^{}]*\}|https?://\S+", " ", text)
    return len(WORD.findall(re.sub(r"[*_`~^]", " ", text)))


def find_line(lines, pattern, start=1):
    rx = re.compile(pattern)
    for number in range(start, len(lines) + 1):
        if rx.search(lines[number - 1]):
            return number
    return None


def where_line(where, name):
    match = re.match(r"^(.*):(\d+)$", where)
    return int(match.group(2)) if match and match.group(1) == name else None


def message_parts(message, name):
    match = WHERE.match(message)
    if match and match.group(1) == name:
        return int(match.group(2)), match.group(3)
    if match:
        return None, match.group(3)
    if message.startswith(f"{name}: "):
        return None, message[len(name) + 2 :]
    return None, message


def short(text, size=46):
    text = " ".join(text.split())
    return text if len(text) <= size else text[: size - 1].rstrip(" ,.;:") + "…"


KIND_NAMES = {"fig": "figure", "tbl": "table", "eq": "equation", "sec": "section", "code": "listing", "def": "definition", "thm": "theorem"}


def plain_message(text):
    text = text.strip()
    found = re.match(r"^reference @(\w+):([\w.-]+) does not exist", text)
    if found:
        kind = KIND_NAMES.get(found.group(1), found.group(1))
        return f"A link points to a {kind} called “{found.group(2)}” that doesn't exist. Click here and pick the right {kind} with @"
    found = re.match(r"^the id '([^']+)' is used twice for (\w+)", text)
    if found:
        kind = KIND_NAMES.get(found.group(2), found.group(2))
        return f"Two {kind}s have the same label “{found.group(1)}”. Change one of them"
    found = re.match(r"^chart column '([^']+)' is not in the data", text)
    if found:
        return f"A chart asks for a column called “{found.group(1)}” that isn't in its data, so another column was used"
    found = re.match(r"^unknown option '([^']+)'", text)
    if found:
        return f"“{found.group(1)}” is not a setting Essay Builder knows, so it was ignored"
    text = re.sub(r"\s*\((?:use |known |add it |did you mean |allowed: )[^()]*(?:\([^()]*\)[^()]*)*\)", "", text).strip()
    return text[:1].upper() + text[1:] if text else text


def run(path, source, pages=None, task=None, extra=None):
    path = Path(path).resolve()
    import build

    report = Report()
    compiler = Inspector(path, report, source, True)
    findings = []
    try:
        head, body, _ = compiler.build()
    except (Exception, SystemExit) as error:
        return {
            "findings": [{"level": "error", "text": f"The essay could not be read: {error}", "line": None}],
            "task": task,
            "detected": None,
            "words": 0,
        }
    lines = compiler.main_lines
    cfg = compiler.cfg
    page = f'<!doctype html>\n<html lang="en">\n{head}\n<body>\n{body}\n</body>\n</html>\n'
    words = build.word_count(page)
    known = starters()
    detected = detect(cfg, lines, known)
    chosen = task if task in TASKS else detected
    spec = TASKS.get(chosen, {})

    def add(level, text, line=None):
        findings.append({"level": level, "text": text, "line": line})

    ranges = {item["start"]: item for item in compiler.ranges}
    main = [block for block in compiler.top_blocks if block.line.file == path]

    def span(block):
        item = ranges.get(block.line.no)
        return (block.line.no, item["end"]) if item else (block.line.no, block.line.no)

    roles, role = {}, "body"
    for block in main:
        if block.kind == "heading" and block.data["level"] == 1:
            low = re.sub(r"\s*\{[^}]*\}\s*$", "", block.data["text"]).strip().lower()
            role = "end" if low.startswith(END_WORDS) else "body"
        roles[block.line.no] = role

    limit_text = str(cfg.get("word-limit", "")).strip().replace(",", "")
    limit = int(float(limit_text)) if re.fullmatch(r"\d+(\.\d+)?", limit_text) else None
    if limit:
        if words > limit:
            add("error", f"{words:,} words, {words - limit:,} over the {limit:,} limit", compiler.front[0] if compiler.front else None)
        elif words < limit * 0.5:
            add("warn", f"Only {words:,} of {limit:,} words")
        else:
            add("ok", f"{words:,} of {limit:,} words")
    elif spec.get("limit"):
        add("warn", f"No word limit set ({spec['limit']:,} for {spec['name']})", compiler.front[0] if compiler.front else None)
    else:
        add("ok", f"{words:,} words")

    starter_pool = [known[chosen]] if chosen in known else list(known.values())
    units = set().union(*(item["units"] for item in starter_pool)) if starter_pool else set()
    hint_headings = set().union(*(item["headings"] for item in starter_pool)) if starter_pool else set()

    def hint_in(text):
        flat = f" {normal(text)} "
        for unit in units:
            if f" {unit} " in flat:
                return unit
        return None

    header_line = {}
    if compiler.front:
        for number in range(compiler.front[0], compiler.front[1] + 1):
            match = re.match(r"^([A-Za-z][\w-]*)\s*:\s*(.*)$", lines[number - 1])
            if match:
                header_line.setdefault(match.group(1).lower(), number)

    hints = 0
    for item in starter_pool:
        for key, value in item["header"].items():
            mine = str(cfg.get(key, "")).strip()
            if spec and key in {"title", "question"}:
                continue
            if mine and normal(mine) == normal(value) and (HINT_MARK.search(value) or len(value.split()) >= 4):
                add("warn", f"Starter {key} not replaced", header_line.get(key))
                hints += 1
    seen_hint_lines = set()
    lead_texts = []
    first_heading = next((block.line.no for block in main if block.kind == "heading"), None)
    for block in main:
        start, end = span(block)
        if block.kind == "heading":
            title = re.sub(r"\s*\{[^}]*\}\s*$", "", block.data["text"])
            if normal(title) in hint_headings:
                add("warn", f"Starter heading: {short(title, 36)}", start)
                hints += 1
            continue
        name = block.data.get("name", "")
        if block.kind == "dir" and name in {"sources", "bibliography", "references", "code", "run"}:
            continue
        chunk = [lines[number - 1] for number in range(start, end + 1)]
        if block.kind == "dir" and name == "text" and (first_heading is None or start < first_heading):
            body_lines = [text for text in chunk[1:] if text.strip() not in {":::", "---"} and not OPTION_LINE.match(text.strip())]
            lead_texts.append((start, body_lines))
        for offset, text in enumerate(chunk):
            stripped = text.strip()
            if not stripped or DIRECTIVE.match(stripped) or stripped == ":::" or (block.kind == "dir" and OPTION_LINE.match(stripped)):
                continue
            unit = hint_in(text)
            if unit and start not in seen_hint_lines:
                seen_hint_lines.add(start)
                add("warn", f"Starter text: “{short(stripped.strip(' |'), 40)}”", start + offset)
                hints += 1
        if start not in seen_hint_lines:
            joined = " ".join(chunk)
            unit = hint_in(joined)
            if unit:
                seen_hint_lines.add(start)
                add("warn", f"Starter text: “{short(unit, 40)}”", start)
                hints += 1
    for key, entry in getattr(compiler, "bib_entries", {}).items():
        if SAMPLE_AUTHOR in str(entry.get("author") or "").lower() or re.match(
            r"^title of the (source|page|work)$", str(entry.get("title") or ""), re.I
        ):
            add("warn", f"Sample source still listed: {key}", find_line(lines, rf"^\s*@{re.escape(key)}\s*:?\s*$"))
            hints += 1
    if not hints:
        add("ok", "No starter text left")

    def lead_ok():
        for _, body_lines in lead_texts:
            text = " ".join(body_lines)
            if normal(text) and not hint_in(text):
                return True
        return False

    title_value = str(cfg.get("title", "")).strip()
    default_title = known[chosen]["header"].get("title", "") if chosen in known else ""
    has_title = bool(title_value) and normal(title_value) != normal(default_title) and not HINT_MARK.search(title_value)
    title_word = spec.get("title", "title")
    if spec and not (has_title or lead_ok()):
        add("error", f"No {title_word}", header_line.get("title") or (lead_texts[0][0] if lead_texts else None))
    elif not title_value and not cfg.get("question"):
        add("error", "No title", compiler.front[0] if compiler.front else 1)
    else:
        add("ok", f"{title_word.capitalize()} set")
    if spec.get("question"):
        question = str(cfg.get("question", "")).strip()
        found = bool(question) and not hint_in(question) and not HINT_MARK.search(question)
        if not found:
            found = any("?" in " ".join(body) and not hint_in(" ".join(body)) for _, body in lead_texts)
        if not found:
            for k, block in enumerate(main):
                if block.kind == "heading" and "research question" in block.data["text"].lower():
                    rest = main[k + 1]
                    if rest.kind != "heading":
                        start, end = span(rest)
                        text = " ".join(lines[start - 1 : end])
                        found = bool(normal(text)) and not hint_in(text)
        if found:
            add("ok", "Research question set")
        else:
            add("error", "No research question", header_line.get("question") or header_line.get("title"))

    empty = 0
    for k, block in enumerate(main):
        if block.kind != "heading" or block.data["level"] > 2:
            continue
        level = block.data["level"]
        filled = False
        for later in main[k + 1 :]:
            if later.kind == "heading" and later.data["level"] <= level:
                break
            if later.kind != "heading" and not (later.kind == "dir" and later.data.get("name") in NO_BODY):
                filled = True
                break
        if not filled:
            title = re.sub(r"\s*\{[^}]*\}\s*$", "", block.data["text"])
            add("warn", f"Empty section: {short(title, 36)}", block.line.no)
            empty += 1
    if not empty and any(block.kind == "heading" for block in main):
        add("ok", "No empty sections")

    mains = [item for item in compiler.floats if item["line"].file == path]
    text_all = "\n".join(lines)
    missing_caption = unused = 0
    for item in mains:
        if item["kind"] == "code":
            continue
        name = "Image" if item["kind"] == "img" else item["label"]
        if not item["caption"]:
            add("warn", f"{name} has no caption", item["line"].no)
            missing_caption += 1
        elif re.fullmatch(r"\s*[A-Za-z]+ caption\.?\s*", str(item["caption"])):
            add("warn", f"{name} still has the sample caption “{item['caption'].strip()}”", item["line"].no)
            missing_caption += 1
    for item in mains:
        if item["kind"] not in {"fig", "tbl"} or roles.get(item["line"].no, "body") == "end" and not item["id"]:
            continue
        mentioned = bool(item["id"]) and (item["kind"], item["id"]) in compiler.cited
        if not mentioned and item["label"]:
            mentioned = re.search(rf"\b{re.escape(item['label'])}(?!\d)", text_all) is not None
        if not mentioned:
            add("warn", f"{item['label']} is never mentioned", item["line"].no)
            unused += 1
    floats = [item for item in mains if item["kind"] in {"fig", "tbl", "img"}]
    if floats and not missing_caption:
        add("ok", "Figures and tables captioned")
    if any(item["kind"] in {"fig", "tbl"} for item in mains) and not unused:
        add("ok", "Figures and tables mentioned")
    if spec.get("objects"):
        pictures = sum(1 for item in mains if item["kind"] in {"fig", "img"})
        if pictures < spec["objects"]:
            add("warn", f"{pictures} of {spec['objects']} object images")
        else:
            add("ok", f"{spec['objects']} object images")

    entries = getattr(compiler, "bib_entries", {})
    cites = getattr(compiler, "bib_cites", [])
    used, bad, first_cite = set(), 0, None
    for raw, narrative, where in cites:
        for key, _, _ in group_items(raw):
            if key in entries:
                used.add(key)
                first_cite = first_cite or where_line(where, path.name)
            elif not narrative:
                add("error", f"No source for [@{key}]", where_line(where, path.name))
                bad += 1
    if cites and not bad:
        add("ok", "Every citation has a source")
    if entries and not getattr(compiler, "bib_all", False):
        spare = [key for key in entries if key not in used]
        for key in spare:
            add(
                "warn",
                f"Source never cited: {key}",
                find_line(lines, rf"^\s*@{re.escape(key)}\s*:?\s*$") or find_line(lines, rf"\b{re.escape(key)}\b"),
            )
        if not spare:
            add("ok", "Every source is cited")
    manual = any(block.kind == "dir" and block.data.get("name") == "references" for block in main)
    for k, block in enumerate(main[:-1]):
        if (
            block.kind == "heading"
            and block.data["level"] == 1
            and re.match(r"(?i)(references|bibliography|works cited|sources)\b", block.data["text"].strip())
        ):
            manual = manual or main[k + 1].kind in {"para", "list"}
    listed = getattr(compiler, "bib_marks", 0) > 0 or manual
    if used and not getattr(compiler, "bib_marks", 0):
        add("error", "No reference list", first_cite)
    elif used or manual:
        add("ok", "Reference list in place")
    elif spec and spec.get("limit") and not listed:
        add("warn", "No sources cited")

    blurry = 0
    raw_messages = [("error", text) for text in report.errors] + [("warn", text) for text in report.warnings]
    for level, message in raw_messages:
        line, text = message_parts(message, path.name)
        match = re.match(r"^(.+?) is only (\d+) dpi", text)
        if match:
            add("warn", f"{match.group(1)} is blurry in print ({match.group(2)} dpi)", line)
            blurry += 1
    if any(item["kind"] in {"fig", "img"} for item in mains) and not blurry:
        add("ok", "Images sharp enough to print")

    long_ones = repeats = 0
    for block in main:
        if block.kind not in {"para", "list", "quote"}:
            continue
        start, end = span(block)
        if block.kind == "para" and roles.get(start) != "end":
            size = count_words(block.data["text"])
            if size >= LONG_PARAGRAPH:
                add("warn", f"Long paragraph ({size} words)", start)
                long_ones += 1
        for number in range(start, end + 1):
            text = re.sub(r"\$[^$]*\$|https?://\S+|`[^`]*`|\[[^\]]*\]\([^)]*\)", " ", lines[number - 1])
            for match in REPEAT.finditer(text):
                if match.group(1).lower() in FINE_REPEATS or match.group(1).isupper() and len(match.group(1)) > 1:
                    continue
                add("warn", f"Repeated word: “{match.group(0)}”", number)
                repeats += 1
                break
    if any(block.kind == "para" for block in main):
        if not long_ones:
            add("ok", "Paragraphs a good length")
        if not repeats:
            add("ok", "No repeated words")

    if spec.get("pages") and pages:
        low, high = spec["pages"]
        if pages > high:
            add("error", f"{pages} pages, {high} at most", None)
        elif pages < low:
            add("warn", f"{pages} pages, {low} at least", None)
        else:
            add("ok", f"{pages} pages ({low}–{high})")

    seen = set()
    for level, message in raw_messages:
        line, text = message_parts(message, path.name)
        seen.add((level, text.strip()))
        if any(rx.search(text) for rx in OWN_TOPICS):
            continue
        add(level, plain_message(text), line)
    for item in extra or []:
        level = "error" if item.get("level") == "error" else "warn"
        given, text = message_parts(str(item.get("text") or "").strip(), path.name)
        text = text.strip()
        if not text or (level, text) in seen or any(rx.search(text) for rx in OWN_TOPICS):
            continue
        seen.add((level, text))
        line = item.get("line")
        add(level, plain_message(text), line if isinstance(line, int) else given)
    if not report.errors and not any(item.get("level") == "error" for item in extra or []):
        add("ok", "No build errors")

    order = {"error": 0, "warn": 1, "ok": 2}
    findings.sort(key=lambda item: order[item["level"]])
    return {"findings": findings, "task": chosen, "detected": detected, "words": words, "limit": limit}


def tasks():
    return [{"id": ident, "name": task["name"]} for ident, task in TASKS.items()]


def criteria(task):
    spec = TASKS.get(task)
    if not spec:
        return []
    return [
        {
            "id": code,
            "name": name,
            "items": [{"id": f"{code}{index}", "text": f"Have I {text[0].lower()}{text[1:]}?"} for index, text in enumerate(items, 1)],
        }
        for code, name, items in spec["criteria"]
    ]


def load_saved(file, essay):
    try:
        saved = json.loads(Path(file).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        saved = {}
    entry = saved.get(str(essay), {}) if isinstance(saved, dict) else {}
    return entry if isinstance(entry, dict) else {}


def save(file, essay, task=None, ticks=None, own=None):
    file = Path(file)
    try:
        saved = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        saved = {}
    if not isinstance(saved, dict):
        saved = {}
    entry = saved.get(str(essay), {})
    entry = entry if isinstance(entry, dict) else {}
    if task is not None:
        entry["task"] = task if task in TASKS else ""
    if ticks is not None:
        current = entry.get("task") or ""
        marks = entry.get("ticks") if isinstance(entry.get("ticks"), dict) else {}
        marks[ticks.get("task") or current] = sorted({str(item) for item in ticks.get("items", [])})
        entry["ticks"] = marks
    if own is not None:
        entry["own"] = [
            {"id": str(item.get("id"))[:40], "text": str(item.get("text", "")).strip()[:300]}
            for item in own
            if isinstance(item, dict) and str(item.get("text", "")).strip()
        ][:100]
    saved[str(essay)] = entry
    file.parent.mkdir(parents=True, exist_ok=True)
    file.write_text(json.dumps(saved, indent=1), encoding="utf-8")
    return entry


def essay_report(file, essay, source, pages=None, extra=None):
    entry = load_saved(file, essay)
    result = run(essay, source, pages, entry.get("task") or None, extra)
    task = result["task"]
    marks = entry.get("ticks") if isinstance(entry.get("ticks"), dict) else {}
    result.update(
        {
            "chosen": entry.get("task") or "",
            "tasks": tasks(),
            "criteria": criteria(task),
            "ticks": marks.get(task or "", []),
            "own": entry.get("own") if isinstance(entry.get("own"), list) else [],
            "ownTicks": marks.get("own", []),
        }
    )
    return result
