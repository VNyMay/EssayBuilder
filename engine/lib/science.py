import html
import json
import re
import tempfile
from pathlib import Path

import subprocess

from .diagrams import clean_svg, memo
from .setup import MODULES, browser, browser_flags

ENGINE = Path(__file__).resolve().parent.parent
RDKIT = MODULES / "@rdkit" / "rdkit" / "dist" / "RDKit_minimal.wasm"

ABCJS = MODULES / "abcjs" / "dist" / "abcjs-basic-min.js"
SMILES = MODULES / "smiles-drawer" / "dist" / "smiles-drawer.min.js"

MUSIC_SCRIPT = """
const tunes = ABCJS.renderAbc(stage, source, {staffwidth: 520, add_classes: true, responsive: 'resize', oneSvgPerLine: true});
if (!stage.querySelectorAll('.abcjs-note, .abcjs-rest').length) throw new Error('no notes or rests were found in the ABC score');
const warning = tunes.flatMap((tune) => tune.warnings || [])[0];
if (warning) throw new Error(new DOMParser().parseFromString(warning, 'text/html').body.textContent);
"""

MOLECULE_SCRIPT = """
const drawer = new SmilesDrawer.SvgDrawer({width: 420, height: 260, bondThickness: 1});
let failure = null;
SmilesDrawer.parse(source, (tree) => stage.append(drawer.draw(tree, null, 'light')), (error) => { failure = error; });
if (failure) throw new Error(failure.message || String(failure));
"""


def render_in_browser(sources, library, script, kind):
    payload = json.dumps(sources).replace("<", "\u003c")
    with tempfile.TemporaryDirectory() as work:
        page = Path(work) / "render.html"
        page.write_text(
            f"""<!doctype html><meta charset="utf-8"><body><script src="{library.as_uri()}"></script>
<script>
const sources = {payload};
sources.forEach((source, index) => {{
  const stage = document.createElement('div');
  document.body.append(stage);
  const result = document.createElement('pre');
  result.dataset.i = index;
  try {{
    {script}
    const drawings = Array.from(stage.querySelectorAll('svg'), (svg) => svg.outerHTML);
    if (!drawings.length) throw new Error('nothing was drawn');
    result.dataset.ok = '1';
    result.textContent = JSON.stringify(drawings);
  }} catch (error) {{
    result.dataset.ok = '0';
    result.textContent = error.message;
  }}
  stage.remove();
  document.body.append(result);
}});
</script>""",
            encoding="utf-8",
        )
        done = subprocess.run(
            [
                browser(),
                *browser_flags(),
                "--allow-file-access-from-files",
                f"--user-data-dir={Path(work) / 'profile'}",
                "--dump-dom",
                page.as_uri(),
            ],
            capture_output=True,
            timeout=90,
            check=True,
        )
    dom = done.stdout.decode("utf-8", errors="replace")
    found = {
        int(m[1]): (m[2] == "1", html.unescape(m[3]))
        for m in re.finditer(r'<pre data-i="(\d+)" data-ok="([01])">([\s\S]*?)</pre>', dom)
    }
    results = []
    for index in range(len(sources)):
        ok, text = found.get(index, (False, "the browser did not return a drawing"))
        if ok:
            try:
                text = "".join(
                    clean_svg(svg, f"{kind}-{index}-{n}", "100%") for n, svg in enumerate(json.loads(text))
                )
            except ValueError as error:
                ok, text = False, str(error)
        results.append((ok, text))
    return results


def render_music(sources):
    return memo("music", sources, lambda items: render_in_browser(items, ABCJS, MUSIC_SCRIPT, "music"))


def parse_molecule(source):
    try:
        data = json.loads(source)
        if isinstance(data, dict) and "smiles" in data:
            return data
    except ValueError:
        pass
    return {"smiles": source, "color": True, "stereo": False}


def draw_with_rdkit(jobs):
    with tempfile.TemporaryDirectory() as work:
        request, answer = Path(work) / "in.json", Path(work) / "out.json"
        request.write_text(json.dumps(jobs), encoding="utf-8")
        subprocess.run(
            ["node", str(ENGINE / "molecules.js"), str(request), str(answer)],
            check=True,
            cwd=str(ENGINE),
            capture_output=True,
            timeout=120,
        )
        drawn = json.loads(answer.read_text(encoding="utf-8"))
    results = []
    for index, item in enumerate(drawn):
        if item["ok"]:
            svg = re.sub(r"viewBox='([^']+)'", lambda match: 'viewBox="' + match.group(1) + '"', item["svg"], count=1)
            results.append((True, clean_svg(svg, f"molecule-{index}", "100%")))
        else:
            results.append((False, item["error"]))
    return results


def draw_molecules(items):
    jobs = [parse_molecule(item) for item in items]
    if RDKIT.is_file():
        try:
            return draw_with_rdkit(jobs)
        except (OSError, subprocess.SubprocessError, ValueError, KeyError):
            pass
    return render_in_browser([job["smiles"] for job in jobs], SMILES, MOLECULE_SCRIPT, "molecule")


def render_molecules(sources):
    return memo("molecule", sources, draw_molecules)
