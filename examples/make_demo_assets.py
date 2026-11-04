"""Synthesise a test track + cover + lyrics so the pipeline can be verified offline.

The 'vocal' is gated to known phrases, so caption timing can be checked against
ground truth. Run:  python3 examples/make_demo_assets.py
"""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = Path(__file__).resolve().parent.parent / "assets" / "demo"
SR = 44100
BPM = 100.0
BARS = 14

LINES = [
    "ночь горит неоном над рекой",
    "мы с тобой на крыше золотой",
    "город спит а мы ещё поём",
    "этот трек мы завтра не вернём",
    "ночь горит неоном над рекой",
    "мы с тобой на крыше золотой",
]
FONT_CANDIDATES = [
    "/usr/share/fonts/opentype/inter/InterDisplay-Bold.otf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _font(size: int) -> ImageFont.FreeTypeFont:
    for p in FONT_CANDIDATES:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def make_track(path: Path) -> list[tuple[float, float]]:
    beat = 60.0 / BPM
    total = BARS * 4 * beat
    n = int(total * SR)
    t = np.arange(n) / SR
    out = np.zeros(n, dtype=np.float64)
    rng = np.random.default_rng(7)

    def add(sig: np.ndarray, at: float, gain: float = 1.0) -> None:
        i = int(at * SR)
        j = min(n, i + len(sig))
        if i < n:
            out[i:j] += sig[: j - i] * gain

    # kick on every beat, snare on 2 and 4, hats on eighths
    for b in range(BARS * 4):
        at = b * beat
        env = np.exp(-np.linspace(0, 1, int(0.22 * SR)) * 18)
        f = np.linspace(110, 46, len(env))
        add(np.sin(2 * np.pi * np.cumsum(f) / SR) * env, at, 0.95)
        if b % 4 in (1, 3):
            ns = rng.normal(0, 1, int(0.14 * SR)) * np.exp(-np.linspace(0, 1, int(0.14 * SR)) * 14)
            add(ns, at, 0.3)
        for h in (0.0, 0.5):
            ns = rng.normal(0, 1, int(0.05 * SR)) * np.exp(-np.linspace(0, 1, int(0.05 * SR)) * 40)
            add(ns, at + h * beat, 0.11)

    # bass + pad, 4-chord loop
    roots = [55.0, 73.42, 65.41, 49.0]
    for bar in range(BARS * 4 // 4):
        root = roots[bar % 4]
        at, dur = bar * 4 * beat, 4 * beat
        seg = np.arange(int(dur * SR)) / SR
        env = np.minimum(1.0, seg * 8) * np.exp(-seg * 0.35)
        add(np.sign(np.sin(2 * np.pi * root * seg)) * 0.18 * env, at, 0.55)
        for mult in (2.0, 2.5, 3.0):
            add(np.sin(2 * np.pi * root * mult * seg + mult) * 0.1 * env, at, 0.5)

    # 'vocal': a vibrato saw gated to the lyric phrases (ground truth for timing)
    spans: list[tuple[float, float]] = []
    phrase_len = 2 * 4 * beat
    for i, line in enumerate(LINES):
        start = (1 + i * 2) * 4 * beat          # every other bar pair, after a 1-bar intro
        if start + phrase_len > total:
            break
        words = line.split()
        wt = start
        for w in words:
            syll = max(1, sum(c in "аеёиоуыэюя" for c in w))
            dur = phrase_len / sum(max(1, sum(c in "аеёиоуыэюя" for c in x)) for x in words) * syll
            seg = np.arange(int(dur * 0.92 * SR)) / SR
            if len(seg) < 10:
                continue
            pitch = 220 * (2 ** ((i % 3) / 12)) * (1 + 0.012 * np.sin(2 * np.pi * 5.5 * seg))
            ph = 2 * np.pi * np.cumsum(pitch) / SR
            tone = sum(np.sin(ph * k) / k for k in (1, 2, 3, 4, 5))
            env = np.minimum(1.0, seg * 22) * np.minimum(1.0, (dur - seg) * 12)
            add(tone * 0.22 * env, wt, 0.75)
            wt += dur
        spans.append((start, start + phrase_len))

    out /= np.max(np.abs(out)) + 1e-9
    out *= 0.9
    path.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(path), "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        pcm = (np.clip(out, -1, 1) * 32767).astype("<i2")
        w.writeframes(np.repeat(pcm, 2).tobytes())
    return spans


def make_cover(path: Path, size: int = 1400) -> None:
    img = Image.new("RGB", (size, size), (14, 8, 28))
    d = ImageDraw.Draw(img)
    # gradient sky
    for y in range(size):
        k = y / size
        d.line([(0, y), (size, y)],
               fill=(int(18 + 60 * k), int(8 + 18 * k), int(44 + 70 * (1 - k))))
    # sun
    d.ellipse([size * 0.26, size * 0.2, size * 0.74, size * 0.68], fill=(255, 92, 120))
    for i in range(14):   # retro scanlines over the sun
        y = size * (0.36 + i * 0.024)
        d.rectangle([size * 0.2, y, size * 0.8, y + size * 0.006], fill=(14, 8, 28))
    img = img.filter(ImageFilter.GaussianBlur(1.2))
    d = ImageDraw.Draw(img)
    # horizon grid
    for i in range(18):
        y = size * (0.68 + (i / 18) ** 1.7 * 0.32)
        d.line([(0, y), (size, y)], fill=(56, 199, 255), width=2)
    for i in range(-9, 10):
        d.line([(size / 2 + i * size * 0.055, size * 0.68), (size / 2 + i * size * 0.55, size)],
               fill=(56, 199, 255), width=2)
    f1, f2 = _font(int(size * 0.105)), _font(int(size * 0.035))
    d.text((size / 2, size * 0.1), "НЕОН НАД РЕКОЙ", font=f1, fill=(255, 240, 230), anchor="mm")
    d.text((size / 2, size * 0.16), "DEMO EP", font=f2, fill=(255, 209, 102), anchor="mm")
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, quality=92)


def main() -> None:
    track = OUT / "demo-track.wav"
    spans = make_track(track)
    make_cover(OUT / "demo-cover.jpg")
    (OUT / "demo-lyrics.txt").write_text("\n".join(LINES) + "\n", encoding="utf-8")
    (OUT / "ground-truth.txt").write_text(
        "\n".join(f"{s:.2f}-{e:.2f}  {LINES[i]}" for i, (s, e) in enumerate(spans)) + "\n",
        encoding="utf-8",
    )
    print(f"track  : {track}")
    print(f"cover  : {OUT / 'demo-cover.jpg'}")
    print(f"lyrics : {OUT / 'demo-lyrics.txt'}")
    print(f"BPM {BPM:.0f}, {BARS} bars, {len(spans)} sung phrases")
    for i, (s, e) in enumerate(spans):
        print(f"  {s:6.2f}–{e:6.2f}  {LINES[i]}")


if __name__ == "__main__":
    main()
