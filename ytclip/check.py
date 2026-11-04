"""Quality gate for a finished clip (the checklist in rules.md §10).

Catches the failures that are easy to ship by accident: wrong container, audio
clipping, a clip that is too long for the platform, or captions that sit under
the TikTok buttons.
"""
from __future__ import annotations

import json
import re
import subprocess
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .ffmpeg_io import ffmpeg, ffprobe
from .project import SAFE_BOTTOM, SAFE_RIGHT, SAFE_TOP


@dataclass
class Report:
    path: str
    ok: list[str] = field(default_factory=list)
    warn: list[str] = field(default_factory=list)
    fail: list[str] = field(default_factory=list)

    @property
    def passed(self) -> bool:
        return not self.fail

    def text(self) -> str:
        lines = [f"Проверка: {Path(self.path).name}"]
        lines += [f"  [ок]     {m}" for m in self.ok]
        lines += [f"  [!]      {m}" for m in self.warn]
        lines += [f"  [ОШИБКА] {m}" for m in self.fail]
        lines.append("  итог: " + ("годен" if self.passed else "НЕ годен"))
        return "\n".join(lines)


def _probe(path: Path) -> dict:
    out = subprocess.run(
        [ffprobe(), "-v", "error", "-print_format", "json",
         "-show_format", "-show_streams", str(path)],
        capture_output=True, check=True, text=True,
    ).stdout
    return json.loads(out)


def _faststart(path: Path) -> bool:
    """moov before mdat means the file starts playing without a full download."""
    head = path.read_bytes()[:400_000]
    i_moov, i_mdat = head.find(b"moov"), head.find(b"mdat")
    if i_moov < 0:
        return False
    return i_mdat < 0 or i_moov < i_mdat


def _audio_peak_db(path: Path) -> float | None:
    r = subprocess.run(
        [ffmpeg(), "-v", "info", "-nostdin", "-i", str(path),
         "-af", "volumedetect", "-f", "null", "-"],
        capture_output=True, text=True,
    )
    m = re.search(r"max_volume:\s*(-?\d+(\.\d+)?) dB", r.stderr or "")
    return float(m.group(1)) if m else None


def _frames(path: Path, times: list[float], w: int = 270, h: int = 480) -> list[np.ndarray]:
    out: list[np.ndarray] = []
    for t in times:
        r = subprocess.run(
            [ffmpeg(), "-v", "error", "-nostdin", "-ss", f"{t:.3f}", "-i", str(path),
             "-frames:v", "1", "-vf", f"scale={w}:{h}", "-f", "rawvideo",
             "-pix_fmt", "gray", "-"],
            capture_output=True,
        )
        if r.returncode == 0 and len(r.stdout) == w * h:
            out.append(np.frombuffer(r.stdout, dtype=np.uint8).reshape(h, w).astype(np.float32))
    return out


def _edge_density(img: np.ndarray) -> np.ndarray:
    """Per-row edge energy — text and graphics show up as high values."""
    gx = np.abs(np.diff(img, axis=1)).mean(axis=1)
    gy = np.abs(np.diff(img, axis=0)).mean(axis=1)
    gy = np.concatenate([gy, gy[-1:]])
    return gx + gy


def check(path: str | Path, min_len: float = 10.0, max_len: float = 60.0,
          target: tuple[int, int] = (1080, 1920), fps: float = 30.0) -> Report:
    path = Path(path)
    rep = Report(path=str(path))
    if not path.exists():
        rep.fail.append("файл не найден")
        return rep

    data = _probe(path)
    v = next((s for s in data["streams"] if s["codec_type"] == "video"), None)
    a = next((s for s in data["streams"] if s["codec_type"] == "audio"), None)
    fmt = data["format"]

    if v is None:
        rep.fail.append("нет видеодорожки")
        return rep

    size = (int(v["width"]), int(v["height"]))
    if size == target:
        rep.ok.append(f"формат кадра {size[0]}x{size[1]}")
    else:
        rep.fail.append(f"кадр {size[0]}x{size[1]}, ожидается {target[0]}x{target[1]}")

    num, den = (v.get("r_frame_rate") or "0/1").split("/")
    real_fps = float(num) / float(den or 1)
    if abs(real_fps - fps) < 0.02:
        rep.ok.append(f"{real_fps:.0f} кадров/с")
    else:
        rep.warn.append(f"частота кадров {real_fps:.2f}, ожидалась {fps:.0f}")

    if v.get("codec_name") == "h264":
        rep.ok.append("видео H.264")
    else:
        rep.fail.append(f"видеокодек {v.get('codec_name')}, нужен h264")

    if v.get("pix_fmt") == "yuv420p":
        rep.ok.append("цвет yuv420p")
    else:
        rep.fail.append(f"pix_fmt {v.get('pix_fmt')}, нужен yuv420p")

    if a is None:
        rep.fail.append("нет звуковой дорожки")
    else:
        if a.get("codec_name") == "aac":
            rep.ok.append("звук AAC")
        else:
            rep.fail.append(f"аудиокодек {a.get('codec_name')}, нужен aac")
        if int(a.get("channels", 0)) != 2:
            rep.warn.append(f"каналов {a.get('channels')}, ожидалось 2")

    dur = float(fmt.get("duration", 0))
    if min_len <= dur <= max_len:
        rep.ok.append(f"длительность {dur:.1f} с")
    else:
        rep.warn.append(f"длительность {dur:.1f} с вне диапазона {min_len:.0f}–{max_len:.0f} с")

    if _faststart(path):
        rep.ok.append("moov в начале файла (быстрый старт)")
    else:
        rep.warn.append("нет faststart — ролик будет дольше стартовать")

    peak = _audio_peak_db(path)
    if peak is None:
        rep.warn.append("не удалось измерить громкость")
    elif peak > -0.1:
        rep.fail.append(f"звук в клиппинге (пик {peak:.1f} dB)")
    elif peak < -6.0:
        rep.warn.append(f"звук тихий (пик {peak:.1f} dB)")
    else:
        rep.ok.append(f"пик звука {peak:.1f} dB")

    # safe zones: content in the strips the platform covers with its own UI
    frames = _frames(path, [dur * q for q in (0.15, 0.4, 0.65, 0.9)])
    if frames:
        h = frames[0].shape[0]
        top_px = int(SAFE_TOP / target[1] * h)
        bot_px = int(SAFE_BOTTOM / target[1] * h)
        dens = np.mean([_edge_density(f) for f in frames], axis=0)
        mid = float(dens[top_px: h - bot_px].mean()) + 1e-6
        top = float(dens[:top_px].mean())
        bot = float(dens[h - bot_px:].mean())
        if bot > mid * 0.9:
            rep.warn.append("в нижней зоне интерфейса TikTok много графики — текст может перекрыться")
        else:
            rep.ok.append("нижняя безопасная зона чистая")
        if top > mid * 1.1:
            rep.warn.append("в верхней зоне много графики")
    else:
        rep.warn.append("не удалось снять кадры для проверки безопасных зон")

    return rep
