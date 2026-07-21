#!/usr/bin/env python3
"""Generate Blinks extension icons: indigo rounded square, white chain-link.

Pure stdlib (zlib + struct), no PIL needed. Run: python3 gen_icons.py
"""
import math
import os
import struct
import zlib

SIZES = [16, 32, 48, 96, 128, 256, 512]
BG = (79, 70, 229)  # indigo #4F46E5
FG = (255, 255, 255)
SS = 4  # supersample factor


def rounded_rect_alpha(x, y, size, radius):
    """1.0 inside a rounded square [0,size]^2, 0.0 outside."""
    rx = min(max(x, radius), size - radius)
    ry = min(max(y, radius), size - radius)
    d = math.hypot(x - rx, y - ry)
    return 1.0 if d <= radius else 0.0


def ring_alpha(x, y, cx, cy, r_outer, r_inner):
    d = math.hypot(x - cx, y - cy)
    return 1.0 if r_inner <= d <= r_outer else 0.0


def render(size):
    s = size * SS
    corner = s * 0.22
    # two overlapping rings, offset along the diagonal: a chain link
    r_out = s * 0.185
    r_in = s * 0.115
    off = s * 0.105
    c1 = (s / 2 - off, s / 2 - off)
    c2 = (s / 2 + off, s / 2 + off)

    rows = []
    for py in range(size):
        row = bytearray([0])  # PNG filter byte
        for px in range(size):
            a_sum = 0.0
            fg_sum = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    x = px * SS + sx + 0.5
                    y = py * SS + sy + 0.5
                    a = rounded_rect_alpha(x, y, s, corner)
                    if a == 0.0:
                        continue
                    a_sum += 1.0
                    if ring_alpha(x, y, *c1, r_out, r_in) or ring_alpha(x, y, *c2, r_out, r_in):
                        fg_sum += 1.0
            n = SS * SS
            alpha = a_sum / n
            fg = (fg_sum / a_sum) if a_sum else 0.0
            r = round(BG[0] * (1 - fg) + FG[0] * fg)
            g = round(BG[1] * (1 - fg) + FG[1] * fg)
            b = round(BG[2] * (1 - fg) + FG[2] * fg)
            row += bytes((r, g, b, round(alpha * 255)))
        rows.append(bytes(row))
    return b"".join(rows)


def png_chunk(tag, data):
    return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))


def write_png(path, size, raw):
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n"
           + png_chunk(b"IHDR", ihdr)
           + png_chunk(b"IDAT", zlib.compress(raw, 9))
           + png_chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)


def main():
    outdir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "icons")
    os.makedirs(outdir, exist_ok=True)
    for size in SIZES:
        path = os.path.join(outdir, f"icon-{size}.png")
        write_png(path, size, render(size))
        print(f"wrote {path}")


if __name__ == "__main__":
    main()
