#!/usr/bin/env python3
"""OG image for bobbby.online/blinks — an old.reddit-styled card.

Run: uv run --with pillow tools/gen_og.py
Writes ../blog/priv/static/static/blinks-og.png (1200x630).
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
FONTS = "/System/Library/Fonts/Supplemental"
OUT = os.path.join(
    os.path.dirname(os.path.abspath(__file__)),
    "..", "..", "blog", "priv", "static", "static", "blinks-og.png",
)

BAND = (206, 227, 248)      # #cee3f8
BAND_EDGE = (95, 153, 207)  # #5f99cf
ORANGE = (255, 69, 0)       # #ff4500
LINK = (0, 0, 255)
VISITED = (85, 26, 139)
GRAY = (136, 136, 136)
DARK = (51, 51, 51)
TAG_BG = (245, 245, 245)
TAG_EDGE = (221, 221, 221)
TAG_TEXT = (51, 102, 153)   # #369
INDIGO = (79, 70, 229)


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def draw_icon(d, x, y, size):
    """The app icon: indigo rounded square, two white rings."""
    d.rounded_rectangle([x, y, x + size, y + size], radius=size * 0.22, fill=INDIGO)
    r_out, width = size * 0.185, max(3, int(size * 0.07))
    off = size * 0.105
    for cx, cy in [(x + size / 2 - off, y + size / 2 - off), (x + size / 2 + off, y + size / 2 + off)]:
        d.ellipse([cx - r_out, cy - r_out, cx + r_out, cy + r_out], outline="white", width=width)


def tag(d, x, y, text, f):
    tw = d.textlength(text, font=f)
    d.rounded_rectangle([x, y, x + tw + 22, y + 40], radius=6, fill=TAG_BG, outline=TAG_EDGE, width=2)
    d.text((x + 11, y + 7), text, font=f, fill=TAG_TEXT)
    return x + tw + 22 + 12


img = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(img)

# header band
d.rectangle([0, 0, W, 120], fill=BAND)
d.rectangle([0, 120, W, 124], fill=BAND_EDGE)
draw_icon(d, 40, 26, 68)
logo_b = font("Verdana Bold.ttf", 56)
x = 130
d.text((x, 30), "b", font=logo_b, fill=(0, 0, 0))
x += d.textlength("b", font=logo_b)
d.text((x, 30), "links", font=logo_b, fill=ORANGE)
d.text((W - 300, 48), "bobbby.online", font=font("Verdana.ttf", 26), fill=TAG_TEXT)

# giant "link" title
title_f = font("Verdana Bold.ttf", 68)
title = "Blinks: Bobbby's links"
d.text((60, 170), title, font=title_f, fill=LINK)
tw = d.textlength(title, font=title_f)
d.line([60, 254, 60 + tw, 254], fill=LINK, width=4)
d.text((70 + tw, 208), "(self.bobbby)", font=font("Verdana.ttf", 26), fill=GRAY)
d.text((62, 268), "every link I want to keep — tagged, searched, archived", font=font("Verdana.ttf", 28), fill=DARK)

# mock list rows
rows = [
    ("2", "that article you swore you'd read later", "longform", ["read-later"]),
    ("3", "a tool too good to lose", "github.com", ["tools", "elixir"]),
    ("4", "proof it existed before the link rotted", "wayback", ["archive"]),
]
rank_f = font("Verdana.ttf", 34)
row_f = font("Verdana.ttf", 32)
dom_f = font("Verdana.ttf", 22)
tag_f = font("Verdana.ttf", 22)
y = 360
for rank, text, dom, tags in rows:
    d.text((60, y), rank, font=rank_f, fill=(198, 198, 198))
    x = 120
    d.text((x, y), text, font=row_f, fill=VISITED if rank == "4" else LINK)
    x += d.textlength(text, font=row_f) + 14
    d.text((x, y + 8), f"({dom})", font=dom_f, fill=GRAY)
    x += d.textlength(f"({dom})", font=dom_f) + 24
    for t in tags:
        x = tag(d, x, y - 2, t, tag_f)
    y += 78

os.makedirs(os.path.dirname(OUT), exist_ok=True)
img.save(OUT, optimize=True)
print("wrote", os.path.normpath(OUT))
