import json
import subprocess
import sys
import tempfile
from pathlib import Path

import fitz
from PIL import Image, ImageChops

HERE = Path(__file__).resolve().parent
STUDIO = HERE.parent / "studio"
OUT = STUDIO / "previews"
sys.path.insert(0, str(HERE))

from build import build  # noqa: E402

DUMP = """
const fs = require('fs');
const base = new Function(fs.readFileSync('blocks.js', 'utf8') + '; return TEMPLATES')();
const out = base.map((t) => ({ id: t.id, lines: t.lines || null }));
const registerKit = (spec) => spec.kinds.forEach((k) => out.push({ id: k.kind, lines: k.template }));
for (const f of fs.readdirSync('.').filter((f) => /^kit-(?!bundle).*\\.js$/.test(f))) new Function('registerKit', fs.readFileSync(f, 'utf8'))(registerKit);
process.stdout.write(JSON.stringify(out));
"""

SOURCES = [":::sources", "@smith2020", "type: book", "author: Smith, John", "year: 2020", "title: Title of the book", "publisher: Publisher", "city: London", ":::"]
SKIP = {"spacer", "pagebreak", "blank"}
EXTRA = {
    "image": lambda lines: [":::figure", f"src: {(HERE.parent / 'examples' / 'images' / 'bifurcation-small.png').as_posix()}", "caption: Figure caption.", "width: 70%", ":::"],
    "sources": lambda lines: [*lines, "", "As Smith argues [@smith2020], sources are cited like this."],
    "bibliography": lambda lines: [*SOURCES, "", "As Smith argues [@smith2020], sources are cited like this.", "", "# References {nonumber samepage}", "", *lines],
    "landscape": lambda lines: [":::landscape", "Table: A wide table.", "| Year | Q1 | Q2 | Q3 | Q4 | Total |", "|---|---|---|---|---|---|", "| 2024 | 12 | 15 | 18 | 20 | 65 |", "| 2025 | 14 | 17 | 21 | 25 | 77 |", ":::"],
    "columns": lambda lines: [":::columns 2", "gap: 8mm", "---", "Text in the first column continues into the second. " * 6, ":::"],
}
HEAD = ["title: Preview", "cover: no", "contents: no", "page-numbers: no", "word-count: no", "---", ""]


def crop(pdf, target):
    doc = fitz.open(pdf)
    page = doc[0]
    pixmap = page.get_pixmap(matrix=fitz.Matrix(2.2, 2.2))
    image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
    box = ImageChops.difference(image, Image.new("RGB", image.size, "white")).point(lambda v: 255 if v > 18 else 0).getbbox()
    doc.close()
    if not box:
        return False
    pad = 26
    left, top, right, bottom = max(0, box[0] - pad), max(0, box[1] - pad), min(image.width, box[2] + pad), min(image.height, box[3] + pad)
    picture = image.crop((left, top, right, bottom))
    if picture.width > 1100:
        picture = picture.resize((1100, round(picture.height * 1100 / picture.width)), Image.LANCZOS)
    if picture.height > 900:
        picture = picture.crop((0, 0, picture.width, 900))
    picture.save(target, "WEBP", quality=82, method=6)
    return True


def main():
    templates = json.loads(subprocess.run(["node", "-e", DUMP], cwd=STUDIO, capture_output=True, text=True, check=True).stdout)
    wanted = set(sys.argv[1:])
    OUT.mkdir(exist_ok=True)
    made, failed = [], []
    with tempfile.TemporaryDirectory() as work:
        work = Path(work)
        for template in templates:
            ident = template["id"]
            if ident in SKIP or (wanted and ident not in wanted):
                continue
            lines = template["lines"] or []
            lines = EXTRA[ident](lines) if ident in EXTRA else lines
            essay = work / f"{ident}.txt"
            essay.write_text("\n".join(HEAD + lines) + "\n", encoding="utf-8")
            pdf = work / f"{ident}.pdf"
            try:
                build(str(essay), str(pdf))
                if crop(pdf, OUT / f"{ident}.webp"):
                    made.append(ident)
                else:
                    failed.append(ident)
            except BaseException as error:
                failed.append(f"{ident}: {error}")
    print(f"made {len(made)}, failed {len(failed)}")
    for item in failed:
        print(" ", item)


if __name__ == "__main__":
    main()
