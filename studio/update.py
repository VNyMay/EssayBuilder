import json
import re
import time
import urllib.request
from pathlib import Path

STUDIO = Path(__file__).resolve().parent
RELEASES = "https://api.github.com/repos/VNyMay/EssayBuilder/releases/latest"
PAGE = "https://github.com/VNyMay/EssayBuilder/releases/latest"
HOURS = 6


def current():
    file = STUDIO / "version.txt"
    return file.read_text(encoding="utf-8").strip() if file.is_file() else "0"


def parts(text):
    return tuple(int(piece) for piece in re.findall(r"\d+", text)[:3]) or (0,)


def whats_new():
    file = STUDIO / "whatsnew.json"
    if not file.is_file():
        return {}
    try:
        return json.loads(file.read_text(encoding="utf-8"))
    except ValueError:
        return {}


def latest(cache):
    saved = {}
    if cache.is_file():
        try:
            saved = json.loads(cache.read_text(encoding="utf-8"))
        except ValueError:
            saved = {}
    if saved.get("checked", 0) > time.time() - HOURS * 3600:
        return saved
    found = {"checked": time.time(), "tag": saved.get("tag", ""), "url": saved.get("url", PAGE)}
    request = urllib.request.Request(
        RELEASES,
        headers={"User-Agent": f"EssayBuilder/{current()}", "Accept": "application/vnd.github+json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=4) as reply:
            data = json.loads(reply.read().decode("utf-8"))
        found["tag"] = str(data.get("tag_name") or "")
        found["url"] = str(data.get("html_url") or PAGE)
    except Exception:
        found["checked"] = time.time() - (HOURS - 0.25) * 3600
    try:
        cache.write_text(json.dumps(found), encoding="utf-8")
    except OSError:
        pass
    return found


def status(cache):
    here = current()
    info = latest(cache)
    tag = info.get("tag", "")
    newer = bool(tag) and parts(tag) > parts(here)
    return {"current": here, "latest": tag.lstrip("v"), "url": info.get("url", PAGE), "newer": newer, "news": whats_new()}
