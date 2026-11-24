"""Lists the files an essay uses, so they can be pasted into a browser AI.

Usage:  python collect.py <folder or file> [<folder or file> ...]

For each file it prints the full path (what the AI needs), plus the facts the AI cannot
see for itself: image size, table columns and row count, code line count. The list is
printed and copied to the clipboard on Windows. Only the Python standard library is used.
"""
import csv
import os
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

IMAGES = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
TABLES = {".csv", ".tsv", ".xlsx"}
CODE = {
    ".py": "Python", ".java": "Java", ".js": "JavaScript", ".ts": "TypeScript", ".c": "C",
    ".cpp": "C++", ".h": "C", ".cs": "C#", ".go": "Go", ".rs": "Rust", ".rb": "Ruby",
    ".php": "PHP", ".sql": "SQL", ".html": "HTML", ".css": "CSS", ".sh": "Shell",
    ".m": "MATLAB", ".r": "R", ".kt": "Kotlin", ".swift": "Swift", ".lua": "Lua",
}
SKIP_DIRS = {"node_modules", "__pycache__", ".git", ".venv", "venv"}
LIMIT = 300


def image_size(path):
    """(width, height) in pixels for PNG, GIF and JPEG, else None."""
    try:
        with open(path, "rb") as f:
            head = f.read(32)
            if head[:8] == b"\x89PNG\r\n\x1a\n":
                return struct.unpack(">II", head[16:24])
            if head[:6] in (b"GIF87a", b"GIF89a"):
                return struct.unpack("<HH", head[6:10])
            if head[:2] == b"\xff\xd8":
                f.seek(2)
                while True:
                    marker = f.read(2)
                    if len(marker) < 2 or marker[0] != 0xFF:
                        return None
                    if marker[1] in (0xD8, 0x01) or 0xD0 <= marker[1] <= 0xD7:
                        continue
                    length = struct.unpack(">H", f.read(2))[0]
                    if 0xC0 <= marker[1] <= 0xCF and marker[1] not in (0xC4, 0xC8, 0xCC):
                        height, width = struct.unpack(">xHH", f.read(5))
                        return width, height
                    f.seek(length - 2, 1)
    except (OSError, struct.error):
        pass
    return None


def read_rows(path, limit=4):
    """(first rows, row count) of a CSV / TSV, or None if it cannot be read."""
    for encoding in ("utf-8-sig", "cp1252"):
        try:
            with open(path, newline="", encoding=encoding) as f:
                sample = f.read(4096)
                f.seek(0)
                if path.suffix.lower() == ".tsv":
                    dialect = csv.excel_tab
                else:
                    try:
                        dialect = csv.Sniffer().sniff(sample, delimiters=",;\t")
                    except csv.Error:
                        dialect = csv.excel
                rows, count = [], 0
                for row in csv.reader(f, dialect):
                    if not any(cell.strip() for cell in row):
                        continue
                    count += 1
                    if len(rows) < limit:
                        rows.append([cell.strip() for cell in row])
                return rows, count
        except UnicodeDecodeError:
            continue
        except OSError:
            return None
    return None


def read_sheet(path, limit=4):
    try:
        import openpyxl
        book = openpyxl.load_workbook(path, read_only=True, data_only=True)
        sheet = book.active
        rows, count = [], 0
        for row in sheet.iter_rows(values_only=True):
            cells = ["" if c is None else str(c).strip() for c in row]
            if not any(cells):
                continue
            count += 1
            if len(rows) < limit:
                rows.append(cells)
        return rows, count, sheet.title
    except Exception:
        return None


def line_count(path):
    try:
        with open(path, "rb") as f:
            return sum(1 for _ in f)
    except OSError:
        return None


def gather(targets):
    files = []
    for target in targets:
        target = Path(target.strip().strip('"')).expanduser()
        if target.is_dir():
            for root, dirs, names in os.walk(target):
                dirs[:] = sorted(d for d in dirs if d not in SKIP_DIRS and not d.startswith("."))
                files += [Path(root) / n for n in sorted(names) if not n.startswith(".")]
        elif target.is_file():
            files.append(target)
        else:
            print(f"Not found, skipped: {target}")
    seen, unique = set(), []
    for f in files:
        key = str(f.resolve()).lower()
        if key not in seen:
            seen.add(key)
            unique.append(f)
    return unique


def describe_table(path):
    if path.suffix.lower() == ".xlsx":
        sheet = read_sheet(path)
        if not sheet:
            return "Excel file (could not read it here; ask the student for the column names)"
        rows, count, title = sheet
        label = f"Excel sheet \"{title}\", "
    else:
        data = read_rows(path)
        if not data:
            return "could not read this file (ask the student for the column names)"
        rows, count = data
        label = ""
    if not rows:
        return label + "empty"
    header = " | ".join(rows[0])
    text = f"{label}{count - 1} data rows; columns: {header}"
    if len(rows) > 1:
        text += "; first row: " + " | ".join(rows[1])
    return text


def build(files):
    groups = {"IMAGES": [], "TABLES / DATA": [], "CODE": [], "OTHER FILES": []}
    counters = {"image": 0, "table": 0, "code": 0, "file": 0}
    for path in files[:LIMIT]:
        suffix = path.suffix.lower()
        if suffix in IMAGES:
            counters["image"] += 1
            size = image_size(path)
            note = f"{size[0]} x {size[1]} px" if size else ("vector image" if suffix == ".svg" else "size unknown")
            groups["IMAGES"].append(f"image_{counters['image']}: {path.resolve()}   ({note})")
        elif suffix in TABLES:
            counters["table"] += 1
            groups["TABLES / DATA"].append(f"table_{counters['table']}: {path.resolve()}   ({describe_table(path)})")
        elif suffix in CODE:
            counters["code"] += 1
            lines = line_count(path)
            groups["CODE"].append(
                f"code_{counters['code']}: {path.resolve()}   ({CODE[suffix]}, {lines if lines is not None else '?'} lines)"
            )
        else:
            counters["file"] += 1
            groups["OTHER FILES"].append(f"file_{counters['file']}: {path.resolve()}")

    out = [
        "FILES FOR MY ESSAY (made by Essay Builder, \"List my files\")",
        "These are the exact paths on my computer. Use them as they are.",
        "",
    ]
    for title, lines in groups.items():
        if lines:
            out += [title] + lines + [""]
    if len(files) > LIMIT:
        out.append(f"(only the first {LIMIT} of {len(files)} files are listed)")
    if not any(groups.values()):
        out.append("(no files found)")
    return "\n".join(out).rstrip() + "\n"


def to_clipboard(text):
    if os.name != "nt":
        for command in (["pbcopy"], ["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "-ib"]):
            if shutil.which(command[0]):
                try:
                    subprocess.run(command, input=text.encode("utf-8"), check=True, timeout=30)
                    return True
                except (subprocess.SubprocessError, OSError):
                    continue
        return False
    try:
        with tempfile.NamedTemporaryFile("w", suffix=".txt", delete=False, encoding="utf-8") as f:
            f.write(text)
            name = f.name
        subprocess.run(
            ["powershell", "-NoProfile", "-Command",
             f"Get-Content -LiteralPath '{name}' -Raw -Encoding UTF8 | Set-Clipboard"],
            check=True, capture_output=True, timeout=30,
        )
        os.unlink(name)
        return True
    except Exception:
        return False


def main(argv):
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    if not argv:
        sys.exit('Usage: python collect.py "<folder or file>" ["<folder or file>" ...]')
    text = build(gather(argv))
    print(text)
    if to_clipboard(text):
        print("-" * 60)
        print("Copied to the clipboard. Now paste it (Ctrl+V) into the AI chat.")
    else:
        print("-" * 60)
        print("Select the list above, copy it, and paste it into the AI chat.")


if __name__ == "__main__":
    main(sys.argv[1:])
