import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ICON = HERE.parent / "studio" / "icon.png"
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE / "build"
OUT.mkdir(parents=True, exist_ok=True)


def font(size, bold=False):
    for name in ("segoeuib.ttf" if bold else "segoeui.ttf", "arialbd.ttf" if bold else "arial.ttf"):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


logo = Image.open(ICON).convert("RGBA")

large = Image.new("RGB", (164, 314), "#027554")
paint = ImageDraw.Draw(large)
top, bottom = (18, 179, 135), (0, 56, 40)
for y in range(314):
    mix = y / 313
    paint.line([(0, y), (164, y)], fill=tuple(round(a + (b - a) * mix) for a, b in zip(top, bottom)))
mark = logo.resize((104, 104), Image.LANCZOS)
large.paste(mark, (30, 72), mark)
label = font(19, True)
text = "Essay Builder"
width = paint.textlength(text, font=label)
paint.text(((164 - width) / 2, 192), text, font=label, fill="white")
large.save(OUT / "wizard-large.bmp")

small = Image.new("RGB", (55, 55), "white")
mark = logo.resize((44, 44), Image.LANCZOS)
small.paste(mark, (5, 5), mark)
small.save(OUT / "wizard-small.bmp")
print("wizard images written to", OUT)
