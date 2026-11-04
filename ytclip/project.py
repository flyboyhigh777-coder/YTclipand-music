"""Build `clip.json` — the single contract between the Python side and Remotion.

Everything Remotion needs (palette, beats, energy curves, word timings, paths)
lives in this file. Times inside it are LOCAL to the clip and start at 0.
"""
from __future__ import annotations

import json
import re
import shutil
import unicodedata
from dataclasses import dataclass
from pathlib import Path

import numpy as np

from .analysis import Analysis
from .hooks import Segment
from .lyrics import Lyrics, chunk_line
from .palette import Palette

SCHEMA_VERSION = 1

TEMPLATES: dict[str, str] = {
    "cover-pulse": "Обложка во весь экран, пульсирует в такт, зерно и виньетка. Универсальный.",
    "lyric-focus": "Текст крупно по центру на живом градиенте из палитры. Под строчки, которые цепляют.",
    "vinyl-3d":    "3D-сцена: обложка как вращающаяся пластинка со светом. Эффектное интро.",
    "spectrum":    "Спектр-бары и обложка-карточка. Под инструментальные и битовые куски.",
    "glitch-cut":  "Жёсткие монтажные склейки по тактам, RGB-сдвиг, вспышки. Под самый хук.",
}

CAPTION_STYLES = ("word-pop", "line-karaoke", "line-fill")

# rules.md §3.3
SAFE_TOP = 180
SAFE_BOTTOM = 320
SAFE_RIGHT = 140


def slugify(text: str, fallback: str = "track") -> str:
    translit = {
        "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e", "ж": "zh",
        "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m", "н": "n", "о": "o",
        "п": "p", "р": "r", "с": "s", "т": "t", "у": "u", "ф": "f", "х": "h", "ц": "ts",
        "ч": "ch", "ш": "sh", "щ": "sch", "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu",
        "я": "ya",
    }
    s = unicodedata.normalize("NFC", text or "").lower()
    s = "".join(translit.get(c, c) for c in s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s or fallback


def band_matrix(a: Analysis, n_bands: int = 24,
                 fmin: float = 45.0, fmax: float = 9500.0) -> np.ndarray:
    """(n_bands, n_frames) log-spaced spectrum energy, normalised to 0..1."""
    edges = np.geomspace(fmin, fmax, n_bands + 1)
    rows = []
    for k in range(n_bands):
        m = (a.freqs >= edges[k]) & (a.freqs < edges[k + 1])
        rows.append(a.spec[m].mean(axis=0) if m.any() else np.zeros(a.spec.shape[1], np.float32))
    mat = np.log1p(np.stack(rows) * 45.0)
    peak = float(np.percentile(mat, 99.5)) or 1.0
    return np.clip(mat / max(peak, 1e-6), 0.0, 1.0)


def _curve(values: np.ndarray, times: np.ndarray, t0: float, t1: float,
           fps: float, digits: int = 3) -> list[float]:
    """Resample an analysis curve onto the clip's own frame grid."""
    n = max(1, int(round((t1 - t0) * fps)))
    grid = t0 + np.arange(n) / fps
    return [round(float(v), digits) for v in np.interp(grid, times, values)]


def _bands_payload(a: Analysis, t0: float, t1: float, fps: float,
                   n_bands: int = 24) -> list[list[float]]:
    """Spectrum resampled onto the clip's frame grid: frames x bands."""
    mat = band_matrix(a, n_bands)
    n = max(1, int(round((t1 - t0) * fps)))
    grid = t0 + np.arange(n) / fps
    out = np.stack([np.interp(grid, a.times, mat[k]) for k in range(n_bands)], axis=1)
    return [[round(float(v), 2) for v in row] for row in out]


@dataclass
class ClipPlan:
    index: int
    template: str
    segment: Segment
    caption_style: str


def build_clip(
    analysis: Analysis,
    lyrics: Lyrics | None,
    palette: Palette,
    plan: ClipPlan,
    *,
    audio_source: Path,
    cover_source: Path | None,
    slug: str,
    title: str,
    artist: str,
    public_dir: Path,
    work_dir: Path,
    fps: int = 30,
    width: int = 1080,
    height: int = 1920,
    intensity: float = 1.0,
) -> dict:
    """Assemble the props dict for one reel and copy its assets into Remotion's public/."""
    seg = plan.segment
    t0, t1 = float(seg.start), float(seg.end)
    duration = max(0.5, t1 - t0)
    n_frames = int(round(duration * fps))

    asset_dir = public_dir / "clips" / slug
    asset_dir.mkdir(parents=True, exist_ok=True)

    cover_rel = None
    if cover_source is not None and Path(cover_source).exists():
        ext = Path(cover_source).suffix.lower() or ".jpg"
        dest = asset_dir / f"cover{ext}"
        if not dest.exists() or dest.stat().st_mtime < Path(cover_source).stat().st_mtime:
            shutil.copyfile(cover_source, dest)
        cover_rel = f"clips/{slug}/{dest.name}"

    # beats inside the window, rebased to clip time
    beats = [round(float(b - t0), 4) for b in analysis.beats if t0 - 0.5 <= b <= t1 + 0.5]
    downbeats = [round(float(b - t0), 4) for b in analysis.downbeats if t0 - 0.5 <= b <= t1 + 0.5]

    lines_payload = []
    if lyrics is not None:
        for line in lyrics.between(t0, t1):
            words = [
                {"text": w.text, "start": round(w.start, 3), "end": round(w.end, 3)}
                for w in line.words
            ]
            groups = [
                {
                    "text": " ".join(w.text for w in g),
                    "start": round(g[0].start, 3),
                    "end": round(g[-1].end, 3),
                    "words": [
                        {"text": w.text, "start": round(w.start, 3), "end": round(w.end, 3)}
                        for w in g
                    ],
                }
                for g in chunk_line(line)
            ]
            lines_payload.append({
                "text": line.text,
                "start": round(line.start, 3),
                "end": round(line.end, 3),
                "words": words,
                "groups": groups,
            })

    props = {
        "version": SCHEMA_VERSION,
        "track": {"title": title, "artist": artist, "slug": slug},
        "clip": {
            "index": plan.index,
            "template": plan.template,
            "sourceStart": round(t0, 3),
            "sourceEnd": round(t1, 3),
            "duration": round(duration, 3),
            "frames": n_frames,
            "fps": fps,
            "width": width,
            "height": height,
            "reason": seg.reason,
            "score": round(float(seg.score), 3),
        },
        "cover": {"file": cover_rel},
        "palette": palette.as_dict(),
        "music": {
            "bpm": round(float(analysis.bpm), 2),
            "beats": beats,
            "downbeats": downbeats,
            "beatsPerBar": 4,
        },
        "curves": {
            "fps": fps,
            "rms": _curve(analysis.rms, analysis.times, t0, t1, fps),
            "low": _curve(analysis.low, analysis.times, t0, t1, fps),
            "mid": _curve(analysis.mid, analysis.times, t0, t1, fps),
            "high": _curve(analysis.high, analysis.times, t0, t1, fps),
            "vocal": _curve(analysis.vocal, analysis.times, t0, t1, fps),
            "bands": _bands_payload(analysis, t0, t1, fps),
        },
        "lyrics": {
            "source": lyrics.source if lyrics else "none",
            "lines": lines_payload,
        },
        "captions": {
            "style": plan.caption_style,
            "safeTop": SAFE_TOP,
            "safeBottom": SAFE_BOTTOM,
            "safeRight": SAFE_RIGHT,
        },
        "style": {"intensity": round(float(intensity), 3)},
        "debug": {"audioSource": str(Path(audio_source).resolve())},
    }

    work_dir.mkdir(parents=True, exist_ok=True)
    json_path = work_dir / f"clip-{plan.index:02d}-{plan.template}.json"
    json_path.write_text(json.dumps(props, ensure_ascii=False, indent=1), encoding="utf-8")
    props["_json_path"] = str(json_path)
    return props


def plan_clips(
    segments: list[Segment],
    templates: list[str] | None = None,
    caption_style: str = "word-pop",
    count: int | None = None,
) -> list[ClipPlan]:
    """Pair each chosen segment with a template, cycling through the template list."""
    tpl = templates or ["cover-pulse", "lyric-focus", "glitch-cut", "vinyl-3d"]
    for t in tpl:
        if t not in TEMPLATES:
            raise ValueError(f"unknown template '{t}'. Available: {', '.join(TEMPLATES)}")
    n = count or len(segments)
    plans: list[ClipPlan] = []
    for i in range(min(n, len(segments))):
        plans.append(ClipPlan(
            index=i + 1,
            template=tpl[i % len(tpl)],
            segment=segments[i],
            caption_style=caption_style,
        ))
    return plans
