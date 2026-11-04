"""Find the photographic region inside a scrapbook-style sleeve.

A square sleeve dropped into a 9:16 frame leaves a third of the screen empty.
The photo taped onto it, however, fills a phone screen properly — so we locate
it once and let the templates frame it. The artwork itself is never altered
(rules.md §4.0); this only reports where to point the camera.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image


@dataclass
class PhotoBox:
    """Normalised 0..1 rectangle inside the artwork."""
    x: float
    y: float
    w: float
    h: float
    confidence: float

    @property
    def cx(self) -> float:
        return self.x + self.w / 2

    @property
    def cy(self) -> float:
        return self.y + self.h / 2

    def as_dict(self) -> dict:
        return {
            "x": round(self.x, 4), "y": round(self.y, 4),
            "w": round(self.w, 4), "h": round(self.h, 4),
            "cx": round(self.cx, 4), "cy": round(self.cy, 4),
            "confidence": round(self.confidence, 3),
        }


def _run_bounds(coverage: np.ndarray, thresh: float) -> tuple[int, int]:
    """Longest contiguous run above `thresh` in a 1-D coverage profile."""
    above = coverage > thresh
    best = (0, 0)
    start = None
    for i, v in enumerate(above):
        if v and start is None:
            start = i
        elif not v and start is not None:
            if i - start > best[1] - best[0]:
                best = (start, i)
            start = None
    if start is not None and len(above) - start > best[1] - best[0]:
        best = (start, len(above))
    return best


def find_photo(cover_path: str | Path, size: int = 256) -> PhotoBox | None:
    """Locate the largest non-paper block — the taped-on photograph.

    Returns None when the artwork is one edge-to-edge image (nothing to find).
    """
    img = Image.open(cover_path).convert("RGB")
    img.thumbnail((size, size))
    a = np.asarray(img, dtype=np.float32) / 255.0
    h, w, _ = a.shape

    # the paper colour is whatever dominates the outer border
    border = np.concatenate([
        a[: max(2, h // 20)].reshape(-1, 3),
        a[-max(2, h // 20):].reshape(-1, 3),
        a[:, : max(2, w // 20)].reshape(-1, 3),
        a[:, -max(2, w // 20):].reshape(-1, 3),
    ])
    paper = np.median(border, axis=0)

    dist = np.linalg.norm(a - paper[None, None, :], axis=-1)
    mask = dist > 0.17

    # A collage has a quiet, uniform margin around its contents. A full-bleed
    # cover does not — and without this guard the border gradient of an ordinary
    # photographic sleeve looks like a "photo pasted on paper" and gets cropped.
    ring = max(2, min(h, w) // 16)
    border_vals = np.concatenate([
        dist[:ring].reshape(-1), dist[-ring:].reshape(-1),
        dist[:, :ring].reshape(-1), dist[:, -ring:].reshape(-1),
    ])
    uniform = float((border_vals < 0.12).mean())
    if uniform < 0.72:
        return None                      # no paper margin: the sleeve *is* the image

    if mask.mean() > 0.80:
        return None                      # contents fill the sheet

    rows = _run_bounds(mask.mean(axis=1), 0.22)
    cols = _run_bounds(mask.mean(axis=0), 0.22)
    rh, cw = rows[1] - rows[0], cols[1] - cols[0]
    if rh < h * 0.16 or cw < w * 0.16:
        return None

    # tighten: drop the polaroid's white border, which reads as paper
    sub = mask[rows[0]:rows[1], cols[0]:cols[1]]
    inner_rows = _run_bounds(sub.mean(axis=1), 0.55)
    inner_cols = _run_bounds(sub.mean(axis=0), 0.55)
    if inner_rows[1] - inner_rows[0] > rh * 0.5:
        rows = (rows[0] + inner_rows[0], rows[0] + inner_rows[1])
    if inner_cols[1] - inner_cols[0] > cw * 0.5:
        cols = (cols[0] + inner_cols[0], cols[0] + inner_cols[1])

    x, y = cols[0] / w, rows[0] / h
    bw, bh = (cols[1] - cols[0]) / w, (rows[1] - rows[0]) / h
    if bw * bh > 0.78:
        return None                      # that is the whole sheet, not a photo
    conf = float(mask[rows[0]:rows[1], cols[0]:cols[1]].mean())
    if conf < 0.75:
        return None                      # too ragged to be a solid print
    return PhotoBox(x=x, y=y, w=bw, h=bh, confidence=conf)


def describe(cover_path: str | Path) -> str:
    box = find_photo(cover_path)
    if box is None:
        return "обложка — цельное изображение, кадрируем её саму"
    return (f"фото внутри обложки: x={box.x:.2f} y={box.y:.2f} "
            f"w={box.w:.2f} h={box.h:.2f} (уверенность {box.confidence:.2f})")


def export_photo(
    cover_path: str | Path,
    out_path: str | Path,
    box: PhotoBox | None = None,
    target_w: int = 1500,
    trim_bottom: float = 0.0,
    sharpen: bool = True,
) -> Path | None:
    """Cut the photograph out of the sleeve and upscale it properly.

    The sleeve is often small (a 1024px JPEG embedded in the mp3), and the photo
    inside it smaller still. A browser scaling that up bilinearly looks mushy on
    a 1080x1920 frame, so we do the resize once, with Lanczos plus a touch of
    unsharp mask, and hand the renderer a clean file.

    This produces a *derived render asset*; the artwork file itself is untouched.
    """
    from PIL import ImageFilter

    cover_path = Path(cover_path)
    box = box or find_photo(cover_path)
    if box is None:
        return None

    img = Image.open(cover_path).convert("RGB")
    W, H = img.size
    h = box.h * (1.0 - max(0.0, min(0.6, trim_bottom)))
    crop = img.crop((
        int(round(box.x * W)), int(round(box.y * H)),
        int(round((box.x + box.w) * W)), int(round((box.y + h) * H)),
    ))
    if crop.width < 8 or crop.height < 8:
        return None
    source_px = crop.width

    scale = max(1.0, target_w / crop.width)
    if scale > 1.0:
        crop = crop.resize(
            (int(round(crop.width * scale)), int(round(crop.height * scale))),
            Image.LANCZOS,
        )
    if sharpen:
        amount = 120 if scale > 2.0 else 80
        crop = crop.filter(ImageFilter.UnsharpMask(radius=1.6, percent=amount, threshold=3))

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    crop.save(out_path, quality=94, subsampling=1)
    # remember how many REAL pixels the crop had before upscaling: templates use
    # it to refuse magnification the source cannot support
    out_path.with_suffix(".src.txt").write_text(str(source_px), encoding="utf-8")
    return out_path
