"""Pull a colour palette out of the album cover so every clip matches it."""
from __future__ import annotations

import colorsys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

RGB = tuple[int, int, int]


@dataclass
class Palette:
    colors: list[RGB]         # dominant colours, most frequent first
    bg: RGB                   # deep background
    bg2: RGB                  # secondary background (for gradients)
    accent: RGB               # brightest / most saturated -> highlights, karaoke fill
    accent2: RGB              # second accent
    text: RGB                 # readable caption colour
    dark: bool = True         # is the cover predominantly dark

    def as_dict(self) -> dict:
        return {
            "colors": [_hex(c) for c in self.colors],
            "bg": _hex(self.bg), "bg2": _hex(self.bg2),
            "accent": _hex(self.accent), "accent2": _hex(self.accent2),
            "text": _hex(self.text), "dark": self.dark,
        }


def _hex(c: RGB) -> str:
    return "#%02X%02X%02X" % c


def _hsv(c: RGB) -> tuple[float, float, float]:
    return colorsys.rgb_to_hsv(*[v / 255.0 for v in c])


def _from_hsv(h: float, s: float, v: float) -> RGB:
    r, g, b = colorsys.hsv_to_rgb(h % 1.0, max(0.0, min(1.0, s)), max(0.0, min(1.0, v)))
    return (int(r * 255), int(g * 255), int(b * 255))


def shift(c: RGB, ds: float = 0.0, dv: float = 0.0, dh: float = 0.0) -> RGB:
    h, s, v = _hsv(c)
    return _from_hsv(h + dh, s + ds, v + dv)


def luma(c: RGB) -> float:
    return (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255.0


def extract(cover_path: str | Path, n: int = 6) -> Palette:
    """Quantise the cover, then assign roles to the resulting colours."""
    img = Image.open(cover_path).convert("RGB")
    img.thumbnail((400, 400))
    q = img.quantize(colors=max(n, 4), method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
    pal = q.getpalette() or []
    counts = sorted(q.getcolors() or [], key=lambda t: -t[0])
    colors: list[RGB] = []
    for _, idx in counts[:n]:
        c = (pal[idx * 3], pal[idx * 3 + 1], pal[idx * 3 + 2])
        if all(sum(abs(a - b) for a, b in zip(c, o)) > 36 for o in colors):
            colors.append(c)
    if not colors:
        colors = [(20, 20, 28), (240, 240, 240)]

    arr = np.asarray(img, dtype=np.float32) / 255.0
    mean_luma = float((0.2126 * arr[..., 0] + 0.7152 * arr[..., 1] + 0.0722 * arr[..., 2]).mean())
    dark = mean_luma < 0.5

    # accent = most saturated colour that is not nearly black or white
    def sat_score(c: RGB) -> float:
        h, s, v = _hsv(c)
        return s * (1.0 - abs(v - 0.62) * 0.8)

    ranked = sorted(colors, key=sat_score, reverse=True)
    accent = shift(ranked[0], ds=0.12, dv=0.18 if luma(ranked[0]) < 0.45 else 0.0)
    accent2 = shift(ranked[1] if len(ranked) > 1 else ranked[0], ds=0.08, dv=0.10, dh=0.06)

    base = min(colors, key=luma) if dark else max(colors, key=luma)
    bh, bs, bv = _hsv(base)
    bg = _from_hsv(bh, min(bs * 0.9, 0.55), 0.07 if dark else 0.93)
    bg2 = _from_hsv(bh + 0.05, min(bs * 0.95, 0.6), 0.16 if dark else 0.84)
    text = (250, 248, 245) if dark else (16, 14, 20)

    return Palette(colors=colors, bg=bg, bg2=bg2, accent=accent, accent2=accent2,
                   text=text, dark=dark)


def ass_color(c: RGB, alpha: int = 0) -> str:
    """ASS uses &HAABBGGRR."""
    r, g, b = c
    return f"&H{alpha:02X}{b:02X}{g:02X}{r:02X}"
