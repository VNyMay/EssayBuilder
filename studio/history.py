import json
import re
import time
from difflib import SequenceMatcher
from pathlib import Path

STAMP = "%Y-%m-%d %H-%M-%S"
INDEX = "history.json"
WINDOW = 60
FOREVER = 9999
HOUR = 3600
DAY = 86400


def moment(file):
    try:
        return time.mktime(time.strptime(file.stem[:19], STAMP))
    except ValueError:
        return file.stat().st_mtime


def snapshots(folder):
    return sorted(Path(folder).glob("*.txt"), key=lambda file: (moment(file), file.stem))


def load(folder):
    try:
        data = json.loads((Path(folder) / INDEX).read_text(encoding="utf-8"))
    except (OSError, ValueError):
        data = {}
    if not isinstance(data, dict):
        data = {}
    for key in ("names", "notes", "stats"):
        if not isinstance(data.get(key), dict):
            data[key] = {}
    if not isinstance(data.get("sealed"), list):
        data["sealed"] = []
    return data


def store(folder, data):
    names = {file.name for file in snapshots(folder)}
    for key in ("names", "notes", "stats"):
        data[key] = {name: value for name, value in data[key].items() if name in names}
    data["sealed"] = [name for name in data["sealed"] if name in names]
    target = Path(folder) / INDEX
    spare = target.with_suffix(".tmp")
    spare.write_text(json.dumps(data, indent=1, ensure_ascii=False), encoding="utf-8")
    spare.replace(target)


def body(text):
    parts = re.split(r"^---[ \t]*$", text, maxsplit=1, flags=re.M)
    return parts[1] if len(parts) == 2 else text


def prose(text):
    out, inside = [], False
    for line in body(text).split("\n"):
        bare = line.strip()
        if bare.startswith(":::"):
            inside = bare != ":::"
            continue
        if bare.startswith(("%%", "//", "$$")) or (inside and re.match(r"^[a-z][\w-]*:\s", bare)):
            continue
        out.append(line)
    return "\n".join(out)


WORD = re.compile(r"[^\W_]+(?:['’-][^\W_]+)*")


def words(text):
    return len(WORD.findall(prose(text)))


def changes(old, new):
    before, after = prose(old).split("\n"), prose(new).split("\n")
    added = removed = 0
    for tag, a1, a2, b1, b2 in SequenceMatcher(None, before, after, autojunk=False).get_opcodes():
        if tag == "equal":
            continue
        left = WORD.findall(" ".join(before[a1:a2]))
        right = WORD.findall(" ".join(after[b1:b2]))
        if not left or not right or len(left) * len(right) > 4_000_000:
            removed += len(left)
            added += len(right)
            continue
        for kind, c1, c2, d1, d2 in SequenceMatcher(None, left, right, autojunk=False).get_opcodes():
            if kind != "equal":
                removed += c2 - c1
                added += d2 - d1
    return added, removed


def fresh_name(folder, when):
    stem = time.strftime(STAMP, time.localtime(when))
    target = Path(folder) / f"{stem}.txt"
    number = 2
    while target.exists():
        target = Path(folder) / f"{stem}~{number}.txt"
        number += 1
    return target


def snapshot(folder, source, keep=FOREVER, force=False, seal=False, note=None):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    data = load(folder)
    files = snapshots(folder)
    now = time.time()
    last = files[-1] if files else None
    if last is not None and last.read_text(encoding="utf-8") == source:
        if seal and last.name not in data["sealed"]:
            data["sealed"].append(last.name)
            store(folder, data)
        return last.name
    open_window = (
        last is not None
        and not force
        and not seal
        and note is None
        and now - moment(last) < WINDOW
        and last.name not in data["names"]
        and last.name not in data["notes"]
        and last.name not in data["sealed"]
    )
    target = last if open_window else fresh_name(folder, now)
    target.write_text(source, encoding="utf-8")
    if seal or force:
        data["sealed"].append(target.name)
    if note is not None:
        data["notes"][target.name] = note
    if prune(folder, data, keep, now) or not open_window:
        store(folder, data)
    return target.name


def prune(folder, data, keep, now=None):
    now = now or time.time()
    files = snapshots(folder)
    if len(files) < 3:
        return False
    chosen = {files[0].name, files[-1].name, *data["names"]}
    buckets = {}
    for file in files:
        when = moment(file)
        age = now - when
        if age < HOUR:
            chosen.add(file.name)
        elif age < DAY:
            buckets[("hour", int(when // HOUR))] = file.name
        elif keep >= FOREVER or age < keep * DAY:
            buckets[("day", time.localtime(when)[:3])] = file.name
    chosen.update(buckets.values())
    dropped = [file for file in files if file.name not in chosen]
    for file in dropped:
        file.unlink(missing_ok=True)
    return bool(dropped)


def listing(folder):
    folder = Path(folder)
    if not folder.is_dir():
        return []
    data = load(folder)
    files = snapshots(folder)
    out, previous, texts, dirty = [], None, {}, False
    for file in files:
        try:
            stat = file.stat()
        except OSError:
            continue
        key = f"{stat.st_mtime_ns}:{stat.st_size}:{previous[0] if previous else ''}:{previous[1] if previous else ''}"
        cached = data["stats"].get(file.name)
        if not isinstance(cached, dict) or cached.get("key") != key:
            text = texts.get(file.name) or file.read_text(encoding="utf-8")
            if previous:
                old = texts.get(previous[0]) or (folder / previous[0]).read_text(encoding="utf-8")
                added, removed = changes(old, text)
            else:
                added, removed = 0, 0
            cached = {"key": key, "words": words(text), "added": added, "removed": removed}
            data["stats"][file.name] = cached
            texts[file.name] = text
            dirty = True
        out.append(
            {
                "name": file.name,
                "time": stat.st_mtime,
                "words": cached["words"],
                "added": cached["added"],
                "removed": cached["removed"],
                "label": data["names"].get(file.name, ""),
                "note": data["notes"].get(file.name),
                "first": previous is None,
            }
        )
        previous = (file.name, stat.st_mtime_ns)
    if dirty:
        try:
            store(folder, data)
        except OSError:
            pass
    return out[::-1]


def read(folder, name):
    file = Path(folder) / Path(name).name
    if file.suffix != ".txt" or not file.is_file():
        raise FileNotFoundError("This version is no longer kept")
    return file.read_text(encoding="utf-8")


def rename(folder, name, label):
    folder = Path(folder)
    read(folder, name)
    data = load(folder)
    label = re.sub(r"\s+", " ", str(label or "")).strip()[:80]
    if label:
        data["names"][Path(name).name] = label
    else:
        data["names"].pop(Path(name).name, None)
    store(folder, data)


def name_current(folder, source, label, keep=FOREVER):
    target = snapshot(folder, source, keep, seal=True)
    rename(folder, target, label)
    return target


def restore(folder, name, current, keep=FOREVER):
    text = read(folder, name)
    when = Path(folder, Path(name).name).stat().st_mtime
    if current.strip():
        snapshot(folder, current, keep, note={"kind": "before"})
    snapshot(folder, text, keep, note={"kind": "restored", "from": when})
    return text
