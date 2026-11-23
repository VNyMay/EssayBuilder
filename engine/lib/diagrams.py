import hashlib
import html
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path

from .setup import HERE, MODULES, browser, browser_flags

MERMAID = MODULES / "mermaid" / "dist" / "mermaid.min.js"
ARROW = re.compile(r"(?<=\s)(->|-[^\s>][^>]*?->|=>|\.\.>)(?=\s)")
TERMINALS = {"start", "begin", "end", "stop", "finish", "done"}
THEME = {
    "background": "#ffffff", "primaryColor": "#f1f1ec", "primaryBorderColor": "#141414", "primaryTextColor": "#141414",
    "secondaryColor": "#e6edf4", "secondaryBorderColor": "#1f4e79", "secondaryTextColor": "#141414",
    "tertiaryColor": "#f7f1e6", "tertiaryBorderColor": "#8a6d3b", "tertiaryTextColor": "#141414",
    "lineColor": "#5d5d58", "textColor": "#141414", "nodeBorder": "#141414", "mainBkg": "#f1f1ec",
    "clusterBkg": "#fafaf7", "clusterBorder": "#bdbdb4", "edgeLabelBackground": "#ffffff",
    "noteBkgColor": "#fff8dc", "noteTextColor": "#141414", "noteBorderColor": "#bda55d",
    "titleColor": "#141414", "fontSize": "15px",
}
TINTS = ["#dfe9f3", "#f3e4d6", "#e0eedd", "#eadff0", "#f4dede", "#e1eeee", "#f2efd3", "#e4e4e4", "#dcdff3", "#f0dcec", "#d9ecdf", "#efe2cf"]


CACHE = {}


def failed(result):
    if isinstance(result, dict):
        return "error" in result
    if isinstance(result, tuple):
        return not result[0]
    return False


def memo(kind, items, render, extra=""):
    keys = [hashlib.sha1(f"{kind}{extra}{json.dumps(item, sort_keys=True, default=str)}".encode()).hexdigest() for item in items]
    todo = [i for i, key in enumerate(keys) if key not in CACHE]
    fresh = {}
    if todo:
        for i, result in zip(todo, render([items[i] for i in todo])):
            fresh[i] = result
            if not failed(result):
                CACHE[keys[i]] = result
    return [CACHE[key] if key in CACHE else fresh[i] for i, key in enumerate(keys)]


def q(text):
    return text.replace('"', "#quot;").replace("\\n", "<br/>")


def shaped(text, first=False, last=False):
    text = text.strip()
    if text.startswith("((") and text.endswith("))"):
        return f'(("{q(text[2:-2])}"))'
    if text.startswith("[(") and text.endswith(")]"):
        return f'[("{q(text[2:-2])}")]'
    if text.startswith("(") and text.endswith(")"):
        return f'(["{q(text[1:-1])}"])'
    if text.startswith("[") and text.endswith("]"):
        return f'["{q(text[1:-1])}"]'
    if len(text) > 2 and text.startswith("/") and text.endswith("/"):
        return f'[/"{q(text[1:-1])}"/]'
    if text.endswith("?"):
        return f'{{"{q(text)}"}}'
    if text.lower() in TERMINALS:
        return f'(["{q(text)}"])'
    return f'["{q(text)}"]'


def bare(text):
    text = text.strip()
    for left, right in [("((", "))"), ("[(", ")]"), ("(", ")"), ("[", "]")]:
        if text.startswith(left) and text.endswith(right) and len(text) > len(left) + len(right):
            return text[len(left): -len(right)].strip()
    if len(text) > 2 and text.startswith("/") and text.endswith("/"):
        return text[1:-1].strip()
    return text


def flow_source(body, direction, report, where):
    ids, defined, edges = {}, set(), []

    def node(text):
        key = bare(text).lower()
        if key not in ids:
            ids[key] = f"n{len(ids) + 1}"
        ident = ids[key]
        if ident in defined and text.strip() == bare(text):
            return ident
        defined.add(ident)
        return f"{ident}{shaped(text)}"

    for raw in body:
        line = raw.strip()
        if not line or line.startswith(("%%", "//")):
            continue
        parts = ARROW.split(f" {line} ")
        parts = [p.strip() for p in parts]
        if len(parts) == 1:
            edges.append(node(parts[0]))
            continue
        for i in range(0, len(parts) - 2, 2):
            left, arrow, right = parts[i], parts[i + 1], parts[i + 2]
            label = ""
            if arrow not in {"->", "=>", "..>"}:
                label = arrow[1:-2].strip()
            link = {"->": "-->", "=>": "==>", "..>": "-.->"}.get(arrow, "-->")
            joined = f"{node(left)} {link}|{q(label)}| {node(right)}" if label else f"{node(left)} {link} {node(right)}"
            edges.append(joined)

    if not edges:
        report.error(where, "flow diagram is empty (write lines like: Start -> Read input -> Valid?)")
    return f"flowchart {direction}\n" + "\n".join(f"  {e}" for e in edges)


def outline(body):
    items, widths = [], []
    for raw in body:
        if not raw.strip() or raw.strip().startswith(("%%", "//")):
            continue
        raw = raw.expandtabs(4)
        indent = len(raw) - len(raw.lstrip())
        text = re.sub(r"^[-*+]\s+", "", raw.strip())
        while widths and indent < widths[-1]:
            widths.pop()
        if not widths or indent > widths[-1]:
            widths.append(indent)
        items.append((len(widths) - 1, text))
    return items


def mindmap_source(body, report, where):
    items = outline(body)
    if not items:
        report.error(where, "mind map is empty (write an indented outline; the first line is the centre)")
        return "mindmap\n  root((Empty))"
    lines = ["mindmap"]
    for n, (depth, text) in enumerate(items):
        pad = "  " * (depth + 1)
        lines.append(f'{pad}root(("{q(text)}"))' if n == 0 else f'{pad}n{n}["{q(text)}"]')
    if any(depth == 0 for depth, _ in items[1:]):
        report.warn(where, "mind map has several top-level lines; indent everything under the first line")
    return "\n".join(lines)


def tree_source(body, direction, report, where):
    items = outline(body)
    if not items:
        report.error(where, "tree is empty (write an indented outline)")
    lines, stack = [f"flowchart {direction}"], []
    for n, (depth, text) in enumerate(items):
        lines.append(f'  t{n}["{q(text)}"]')
        del stack[depth:]
        if stack:
            lines.append(f"  t{stack[-1]} --> t{n}")
        stack.append(n)
    return "\n".join(lines)


def render_mermaid(sources, font, font_css="", zoom=1.0):
    return memo("mmd", sources, lambda items: draw_mermaid(items, font, font_css, zoom), font + str(len(font_css)) + str(zoom))


def draw_mermaid(sources, font, font_css="", zoom=1.0):
    work = Path(tempfile.mkdtemp())
    profile = Path(tempfile.mkdtemp())
    try:
        theme = dict(THEME, fontFamily=f'{font}, Cambria, Georgia, serif')
        for i, tint in enumerate(TINTS):
            theme[f"cScale{i}"] = tint
            theme[f"cScaleLabel{i}"] = "#141414"
        payload = json.dumps(sources).replace("</", "<\\/")
        page = work / "diagrams.html"
        page.write_text(
            "<!doctype html><meta charset='utf-8'>"
            f"<style>{font_css}body{{zoom:{zoom:.4f}}}</style><body>"
            f"<script src='{MERMAID.as_uri()}'></script><script>"
            f"const jobs={payload};"
            "mermaid.initialize({startOnLoad:false,securityLevel:'loose',theme:'base',"
            f"themeVariables:{json.dumps(theme)},"
            "flowchart:{useMaxWidth:false,htmlLabels:true,curve:'basis',padding:10,nodeSpacing:34,rankSpacing:42},"
            "sequence:{useMaxWidth:false},timeline:{useMaxWidth:false},gantt:{useMaxWidth:false},"
            "er:{useMaxWidth:false,htmlLabels:false},state:{useMaxWidth:false,htmlLabels:false},class:{useMaxWidth:false,htmlLabels:false},"
            "mindmap:{useMaxWidth:false,padding:14},journey:{useMaxWidth:false},pie:{useMaxWidth:false},"
            "quadrantChart:{useMaxWidth:false},xyChart:{useMaxWidth:false},sankey:{useMaxWidth:false}});"
            f"const FAM={json.dumps(font)};"
            "(async()=>{try{await Promise.all(['400','700','italic 400'].map(w=>document.fonts.load(w+' 16px \"'+FAM+'\"','Abc xyz 123')));}catch(e){}"
            "for(let i=0;i<jobs.length;i++){const p=document.createElement('pre');p.dataset.i=i;"
            "try{const r=await mermaid.render('mmd'+i,jobs[i]);p.dataset.ok='1';p.textContent=r.svg;}"
            "catch(e){p.dataset.ok='0';p.textContent=String((e&&e.message)||e);}"
            "document.body.appendChild(p);}document.title='done';})();"
            "</script>",
            encoding="utf-8",
        )
        done = subprocess.run(
            [
                browser(), *browser_flags(), "--allow-file-access-from-files",
                "--virtual-time-budget=90000", f"--user-data-dir={profile}", "--dump-dom", page.as_uri(),
            ],
            capture_output=True,
            timeout=300,
        )
        dom = done.stdout.decode("utf-8", errors="replace")
        found = {
            int(m.group(1)): (m.group(2) == "1", html.unescape(m.group(3)))
            for m in re.finditer(r'<pre data-i="(\d+)" data-ok="([01])">([\s\S]*?)</pre>', dom)
        }
        return [found.get(i, (False, "the browser did not return this diagram")) for i in range(len(sources))]
    finally:
        shutil.rmtree(work, ignore_errors=True)
        shutil.rmtree(profile, ignore_errors=True)


def clean_svg(svg, ident, width=None):
    svg = re.sub(r"^\s*<\?xml[^>]*\?>", "", svg).strip()
    root = re.match(r"<svg\b([^>]*)>", svg)
    view = re.search(r'viewBox="([^"]+)"', root.group(1))
    if not view:
        raise ValueError("diagram has no size")
    x, y, w, h = (float(v) for v in view.group(1).split())
    inner = svg[root.end(): svg.rindex("</svg>")]
    size = f"width:{width};max-width:100%" if width else f"width:{round(w)}px;max-width:100%"
    own = re.search(r'\bid="([^"]+)"', root.group(1))
    ident = own.group(1) if own else ident
    return (
        f'<svg id="{ident}" viewBox="{view.group(1)}" role="img" '
        f'style="{size};height:auto;display:block;margin:0 auto" xmlns="http://www.w3.org/2000/svg">{inner}</svg>'
    )


def render_charts(specs):
    return memo("chart", specs, draw_charts)


def draw_charts(specs):
    done = subprocess.run(
        ["node", str(HERE / "charts.js")],
        input=json.dumps(specs).encode("utf-8"),
        capture_output=True,
        timeout=120,
    )
    if done.returncode:
        raise RuntimeError(done.stderr.decode("utf-8", errors="replace")[-600:])
    return json.loads(done.stdout.decode("utf-8"))


def render_maps(specs):
    return memo("map", specs, draw_maps)


def draw_maps(specs):
    done = subprocess.run(
        ["node", str(HERE / "maps" / "index.mjs")],
        input=json.dumps(specs).encode("utf-8"),
        capture_output=True,
        timeout=600,
    )
    if done.returncode:
        raise RuntimeError(done.stderr.decode("utf-8", errors="replace")[-600:])
    return json.loads(done.stdout.decode("utf-8"))
