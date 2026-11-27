import base64
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
BUILD = ROOT / "engine" / "build.py"
PIXEL = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==")
HEAD = ["title: Rows editor test", "cover: no", "contents: no", "---", "", "# Blocks", ""]


def roundtrip():
    out = subprocess.run(["node", str(HERE / "rows_roundtrip.js")], capture_output=True, text=True, encoding="utf-8", check=True)
    return json.loads(out.stdout)


def essay(report, key):
    lines, spans = list(HEAD), []
    for entry in report:
        if entry.get("fallback"):
            continue
        start = len(lines) + 1
        lines += [f"Before {entry['kind']}.", "", *entry[key], ""]
        spans.append((start, len(lines), entry["kind"]))
    return lines, spans


def check(lines, spans, folder, name):
    target = folder / f"{name}.txt"
    target.write_text("\n".join(lines) + "\n", encoding="utf-8")
    done = subprocess.run([sys.executable, str(BUILD), str(target), "--check"], capture_output=True, text=True, encoding="utf-8")
    errors = [line for line in (done.stdout + done.stderr).splitlines() if line.strip().startswith("ERROR")]
    blamed = []
    for error in errors:
        hit = re.search(rf"{name}\.txt:(\d+)", error)
        number = int(hit.group(1)) if hit else 0
        kind = next((kind for start, end, kind in spans if start <= number <= end), "?")
        blamed.append(f"{kind}: {error.strip()}")
    return done.returncode, blamed


def main():
    report = roundtrip()
    failures = []
    for entry in report:
        if entry.get("fallback"):
            failures.append(f"{entry['kind']}: template not understood by the rows editor")
        elif not entry["same"]:
            failures.append(f"{entry['kind']}: round trip changed the content\n  before {entry['original']}\n  after  {entry['first']}")
        elif entry["raw"]:
            failures.append(f"{entry['kind']}: template lines kept as raw rows {entry['raw']}")
    with tempfile.TemporaryDirectory() as temp:
        folder = Path(temp)
        (folder / "images").mkdir()
        (folder / "images" / "a.png").write_bytes(PIXEL)
        for key in ("once", "edited"):
            lines, spans = essay(report, key)
            code, blamed = check(lines, spans, folder, key)
            failures += [f"[{key}] {line}" for line in blamed]
            if code and not blamed:
                failures.append(f"[{key}] build exited with {code}")
    kinds = sorted({entry["kind"] for entry in report})
    print(f"{len(kinds)} kinds checked: {', '.join(kinds)}")
    if failures:
        print("\n".join(failures))
        sys.exit(1)
    print("OK: every kind round-trips and builds after editing")


if __name__ == "__main__":
    main()
