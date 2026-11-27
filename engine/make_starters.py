import shutil
import sys
import tempfile
from pathlib import Path

import pymupdf

HERE = Path(__file__).resolve().parent
STARTERS = HERE.parent / "studio" / "starters"
WIDTH = 360
sys.path.insert(0, str(HERE))

from build import build  # noqa: E402


def render(source, work):
    essay = work / source.name
    shutil.copyfile(source, essay)
    pdf = work / f"{source.stem}.pdf"
    build(str(essay), str(pdf))
    with pymupdf.open(pdf) as doc:
        page = doc[0]
        zoom = WIDTH / page.rect.width
        page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom)).save(str(STARTERS / f"{source.stem}.png"))


def main():
    wanted = set(sys.argv[1:])
    failed = []
    with tempfile.TemporaryDirectory() as folder:
        for source in sorted(STARTERS.glob("*.txt")):
            if wanted and source.stem not in wanted:
                continue
            try:
                render(source, Path(folder))
                print(f"made {source.stem}.png")
            except BaseException as error:
                failed.append(source.stem)
                print(f"failed {source.stem}: {error}")
    if failed:
        sys.exit(f"{len(failed)} starter(s) failed: {', '.join(failed)}")


if __name__ == "__main__":
    main()
