import json
import re
from pathlib import Path

from .tables import parse_pipe, read_delimited, read_file
from .util import Options, css_length, length_px, resolve, suggest

LAYER_KINDS = (
    "shade", "points", "flows", "point", "route", "line", "area", "circle", "geojson", "highlight", "label",
)
DATA_KINDS = {"shade", "points", "flows"}
OPTION_KEYS = {
    "basemap", "focus", "bbox", "center", "span", "zoom", "projection", "rotate", "detail", "level", "mainland",
    "ocean", "land", "borders", "graticule", "scale", "north", "inset", "names", "cities", "capitals", "units",
    "legend", "numbered", "online", "sharp", "width", "ratio", "caption", "id", "source", "alt", "align", "wrap",
}
MAP_KEYS = OPTION_KEYS | set(LAYER_KINDS)
PAIR = re.compile(r"([A-Za-z][\w-]*)=(\"[^\"]*\"|'[^']*'|[^\s\"']+)")
BASEMAPS = {"world", "none", "osm", "topo", "light"}


def split_fields(text):
    parts, current, quote = [], "", ""
    for char in text:
        if quote:
            quote = "" if char == quote else quote
            current += char
        elif char in "\"'" and (not current or current[-1] in " =") and "=" in current[-3:] + char:
            quote = char
            current += char
        elif char == "|":
            parts.append(current)
            current = ""
        else:
            current += char
    parts.append(current)
    return [part.strip() for part in parts]


def parse_layer(kind, value):
    parts = split_fields(value)
    target, fields, style = parts[0], [], {}
    for part in parts[1:]:
        pairs = PAIR.findall(part)
        rest = PAIR.sub("", part).strip()
        for key, raw in pairs:
            style[key.lower().replace("_", "-")] = raw.strip("\"'")
        if rest:
            fields.append(rest)
    if kind == "shade" or kind == "points" or kind == "flows":
        pairs = PAIR.findall(target)
        if pairs:
            style.update({k.lower(): v.strip("\"'") for k, v in pairs})
            target = PAIR.sub("", target).strip()
    return target, fields, style


def number_list(text, count, report, where, name):
    values = [v for v in re.split(r"[\s,;]+", text.strip()) if v]
    try:
        numbers = [float(v) for v in values]
    except ValueError:
        numbers = []
    if len(numbers) != count:
        report.error(where, f"{name} needs {count} numbers separated by commas")
        return None
    return numbers


def kilometres(text, report, where):
    match = re.fullmatch(r"\s*(\d+(?:\.\d+)?)\s*(km|mi|m)?\s*", text or "", re.I)
    if not match:
        report.error(where, f"span must look like '3 km' or '2 mi' (got '{text}')")
        return None
    unit = (match.group(2) or "km").lower()
    return float(match.group(1)) * {"km": 1, "mi": 1.609344, "m": 0.001}[unit]


def load_rows(path, sheet):
    return read_file(path, sheet)


def build_spec(doc, opts, rest, line):
    report, where = doc.report, line.where
    spec = {"accent": doc.cfg.get("accent", "#1f4e79"), "layers": []}

    basemap = (opts.get("basemap") or "world").lower()
    if basemap not in BASEMAPS:
        report.error(where, f"basemap must be one of: {', '.join(sorted(BASEMAPS))}{suggest(basemap, BASEMAPS)}")
        return None
    spec["basemap"] = basemap

    focus = opts.get("focus")
    if focus:
        spec["focus"] = [name.strip() for name in re.split(r"\s*[,;+]\s*", focus) if name.strip()]
    if opts.get("bbox"):
        box = number_list(opts.get("bbox"), 4, report, where, "bbox")
        if box is None:
            return None
        spec["bbox"] = box
    if opts.get("center"):
        spec["center"] = opts.get("center")
    if opts.get("span"):
        span = kilometres(opts.get("span"), report, where)
        if span is None:
            return None
        spec["span"] = span
    if opts.get("zoom"):
        spec["zoom"] = opts.number("zoom")
    for key in ("projection", "detail", "level", "ocean", "land", "names", "units"):
        if opts.get(key):
            spec[key] = opts.get(key).strip().lower() if key != "ocean" and key != "land" else opts.get(key).strip()
    if opts.get("rotate"):
        turn = number_list(opts.get("rotate"), 2, report, where, "rotate")
        if turn is None:
            return None
        spec["rotate"] = turn
    if opts.get("level"):
        spec["level"] = opts.get("level").strip().lower()
    for key in ("mainland", "borders", "scale", "north", "inset", "capitals", "numbered", "online"):
        if opts.get(key) is not None:
            spec[key] = opts.flag(key)
    if opts.get("graticule") is not None:
        text = opts.get("graticule").strip().lower()
        spec["graticule"] = float(text) if re.fullmatch(r"\d+(\.\d+)?", text) else opts.flag("graticule")
    if opts.get("cities"):
        spec["cities"] = int(opts.number("cities", 0))
    if (opts.get("detail") or "").lower() == "high":
        spec["sharp"] = True
        spec.pop("detail", None)
    if (opts.get("legend") or "").lower() in {"no", "none", "off"}:
        spec["legend"] = "none"
    ratio = opts.get("ratio")
    if ratio:
        if ":" in ratio:
            a, b = ratio.split(":")
            spec["ratio"] = float(a) / float(b)
        else:
            spec["ratio"] = float(ratio)

    fraction = "40%" if (opts.get("wrap") or "").lower() in {"left", "right"} else "100%"
    width = css_length(opts.get("width") or fraction, report, where) or fraction
    spec["width"] = round(length_px(width, doc.text_width_px()))
    spec["alt"] = opts.get("alt") or opts.get("caption") or "Map"

    inline = None
    texts = [ln.text for ln in rest if ln.text.strip()]
    if texts:
        if any(t.strip().startswith("|") for t in texts):
            inline = parse_pipe([ln.text for ln in rest])[0]
        else:
            inline = read_delimited("\n".join(ln.text for ln in rest), "inline.csv")

    seen_here = False
    for key, value in opts.pairs:
        if key not in LAYER_KINDS:
            continue
        opts.seen.add(key)
        target, fields, style = parse_layer(key, value)
        layer = {"kind": key, "target": target, "fields": fields, "style": style}
        if key in DATA_KINDS:
            sheet = style.get("sheet")
            if target.lower() == "here":
                if inline is None or seen_here:
                    report.error(where, f"'{key}: here' needs a table after a line containing only ---, and only one layer can use it")
                    return None
                layer["rows"], seen_here = inline, True
            else:
                path = resolve(target, doc.bases)
                if path is None:
                    report.error(where, f"{key} file not found: {target}")
                    return None
                try:
                    layer["rows"] = load_rows(path, sheet)
                except Exception as error:
                    report.error(where, f"cannot read {path.name}: {error}")
                    return None
        elif key == "geojson":
            path = resolve(target, doc.bases)
            if path is None:
                report.error(where, f"geojson file not found: {target}")
                return None
            try:
                layer["data"] = json.loads(path.read_text(encoding="utf-8-sig"))
            except (OSError, ValueError) as error:
                report.error(where, f"cannot read {path.name}: {error}")
                return None
        spec["layers"].append(layer)
    return spec, width
