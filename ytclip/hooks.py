"""Pick the catchiest segments of a track for short-form clips.

Scoring blends loudness, vocal presence and *repetition* (a chorus repeats, a
verse usually does not), then snaps the result to bar boundaries.
"""
from __future__ import annotations

from dataclasses import dataclass

import numpy as np

from .analysis import Analysis, band_mask, normalize01


@dataclass
class Segment:
    start: float
    end: float
    score: float
    reason: str = ""

    @property
    def duration(self) -> float:
        return self.end - self.start

    def __str__(self) -> str:
        return f"{self.start:6.2f}s – {self.end:6.2f}s ({self.duration:4.1f}s) score {self.score:.2f} {self.reason}"


def chroma(a: Analysis) -> np.ndarray:
    """(12, n_frames) pitch-class energy — a cheap 'what chord is this' feature."""
    if a.chroma12.size:
        return a.chroma12
    f = a.freqs
    out = np.zeros((12, a.spec.shape[1]), dtype=np.float32)
    ok = f > 27.5
    if not ok.any():
        return out
    midi = 69 + 12 * np.log2(np.maximum(f, 1e-6) / 440.0)
    pc = np.round(midi).astype(int) % 12
    for k in range(12):
        m = ok & (pc == k) & band_mask(f, 60, 4000)
        if m.any():
            out[k] = a.spec[m].mean(axis=0)
    out /= out.sum(axis=0, keepdims=True) + 1e-9
    return out


def beat_sync(feature: np.ndarray, a: Analysis) -> tuple[np.ndarray, np.ndarray]:
    """Average a frame-rate feature inside each beat. Returns (feature, beat_times)."""
    beats = a.beats
    if len(beats) < 4:
        return feature, a.times
    idx = np.clip((beats * a.fps).astype(int), 0, feature.shape[-1] - 1)
    cols = []
    for s, e in zip(idx[:-1], idx[1:]):
        e = max(e, s + 1)
        cols.append(feature[..., s:e].mean(axis=-1))
    return np.stack(cols, axis=-1), beats[:-1]


def repetition_score(a: Analysis, beats_per_window: int) -> tuple[np.ndarray, np.ndarray]:
    """How often each window's harmonic content recurs elsewhere in the track."""
    ch, bt = beat_sync(chroma(a), a)
    n = ch.shape[1]
    w = max(2, min(beats_per_window, max(2, n // 2)))
    if n <= w + 1:
        return np.zeros(max(n, 1), dtype=np.float32), bt
    # stack each window into a vector, L2-normalise, then cosine-compare all pairs
    wins = np.stack([ch[:, i : i + w].reshape(-1) for i in range(n - w)], axis=0)
    wins /= np.linalg.norm(wins, axis=1, keepdims=True) + 1e-9
    sim = wins @ wins.T
    # ignore self and neighbours (a window always matches its own surroundings)
    for off in range(-w, w + 1):
        np.fill_diagonal(sim[max(0, off):, max(0, -off):], 0.0)
    thr = float(np.percentile(sim, 93))
    rep = (sim > thr).sum(axis=1).astype(np.float32)
    return normalize01(rep), bt[: len(rep)]


def find_hooks(
    a: Analysis,
    target: float = 22.0,
    count: int = 4,
    min_gap: float = 6.0,
    bars: int | None = None,
    beats_per_bar: int = 4,
    vocal_weight: float = 1.0,
) -> list[Segment]:
    """Return up to `count` non-overlapping candidate segments, best first."""
    sec_per_beat = 60.0 / max(a.bpm, 1e-6)
    if bars is None:
        bars = max(2, int(round(target / (sec_per_beat * beats_per_bar))))
    win_beats = bars * beats_per_bar
    win_len = win_beats * sec_per_beat

    rep, bt = repetition_score(a, win_beats)
    if len(bt) < 2:
        end = min(a.duration, target)
        return [Segment(0.0, end, 0.0, "(трек слишком короткий для анализа)")]

    starts = a.downbeats if len(a.downbeats) > 3 else a.beats
    starts = starts[starts + win_len <= a.duration - 0.05]
    if not len(starts):
        end = min(a.duration, target)
        return [Segment(0.0, end, 0.0, "(трек короче окна)")]

    loud = np.array([_mean_between(a.times, a.rms, s, s + win_len) for s in starts])
    voc = np.array([_mean_between(a.times, a.vocal_active.astype(np.float32), s, s + win_len)
                    for s in starts])
    repw = np.interp(starts, bt, rep)
    # a hook usually enters after a quieter bar — reward the contrast
    pre = np.array([_mean_between(a.times, a.rms, max(0.0, s - 2 * sec_per_beat), s) for s in starts])
    entrance = np.clip(loud - pre, 0, None)
    # mild penalty for the very first and very last moments of the track
    pos = starts / max(a.duration, 1e-6)
    edge = np.exp(-((pos - 0.45) ** 2) / 0.22)

    score = (
        1.00 * normalize01(loud)
        + 1.15 * normalize01(repw)
        + vocal_weight * voc
        + 0.55 * normalize01(entrance)
        + 0.35 * edge
    )

    order = np.argsort(-score)
    chosen: list[Segment] = []
    for i in order:
        s = float(starts[i])
        if any(abs(s - c.start) < min_gap or (s < c.end and s + win_len > c.start) for c in chosen):
            continue
        chosen.append(Segment(s, min(s + win_len, a.duration), float(score[i]),
                              _reason(voc[i], repw[i], entrance[i])))
        if len(chosen) >= count:
            break
    return chosen


def _reason(voc: float, rep: float, ent: float) -> str:
    tags = []
    if voc > 0.6:
        tags.append("вокал")
    if rep > 0.6:
        tags.append("повторяется (похоже на припев)")
    if ent > 0.15:
        tags.append("эффектный вход")
    return ("· " + ", ".join(tags)) if tags else ""


def _mean_between(times: np.ndarray, curve: np.ndarray, t0: float, t1: float) -> float:
    if t1 <= t0 or not len(times):
        return 0.0
    i0, i1 = np.searchsorted(times, [t0, t1])
    i1 = max(i1, i0 + 1)
    return float(curve[i0:i1].mean())


def fit_segment_to_lines(seg: Segment, line_spans: list[tuple[float, float]],
                         max_extend: float = 2.5) -> Segment:
    """Nudge a segment so it does not cut a lyric line in half."""
    if not line_spans:
        return seg
    start, end = seg.start, seg.end
    for s, e in line_spans:
        if s < start < e and (start - s) <= max_extend:
            start = s - 0.12
        if s < end < e and (e - end) <= max_extend:
            end = e + 0.12
    return Segment(max(0.0, start), end, seg.score, seg.reason)


def silence_gaps(
    phrases: list[tuple[float, float]], duration: float
) -> list[tuple[float, float]]:
    """The quiet stretches between sung phrases — the only safe places to cut."""
    if not phrases:
        return [(0.0, duration)]
    gaps: list[tuple[float, float]] = []
    if phrases[0][0] > 0.2:
        gaps.append((0.0, phrases[0][0]))
    for (_, e), (s2, _) in zip(phrases, phrases[1:]):
        if s2 - e > 0.12:
            gaps.append((e, s2))
    if duration - phrases[-1][1] > 0.2:
        gaps.append((phrases[-1][1], duration))
    return gaps


def snap_to_phrases(
    start: float,
    end: float,
    phrases: list[tuple[float, float]],
    min_len: float,
    max_len: float,
    duration: float,
    lead: float = 0.25,
    tail: float = 0.40,
) -> tuple[float, float]:
    """Move a cut's edges into silence, so no sung line is chopped in half.

    Nothing sounds worse in a short clip than a line cut mid-word. Both edges
    are placed inside the gaps between phrases: the start just before a line
    begins, the end just after one finishes, while the length stays in range.
    """
    gaps = silence_gaps(phrases, duration)
    if not gaps:
        return start, end

    def place_start(t: float) -> float:
        """A point in a gap, as late in it as possible (right before the line)."""
        best = None
        for gs, ge in gaps:
            pos = max(gs + 0.05, ge - lead)
            score = abs(pos - t)
            if best is None or score < best[0]:
                best = (score, pos)
        return best[1] if best else t

    def end_options(s0: float, lo: float, hi: float) -> list[float]:
        """Points in gaps, just after a line ends, that give a usable length."""
        out = []
        for gs, ge in gaps:
            pos = min(ge - 0.05, gs + tail)
            if pos <= s0:
                continue
            if lo <= pos - s0 <= hi:
                out.append(pos)
        return out

    s2 = place_start(start)
    target = end - start
    # exact range first; then a wider one, because ending in silence matters
    # more than hitting the requested length to the second
    for lo, hi in ((min_len, max_len), (min_len * 0.8, max_len * 1.3)):
        opts = end_options(s2, lo, hi)
        if opts:
            e2 = min(opts, key=lambda p: abs((p - s2) - target))
            break
    else:
        e2 = min(s2 + max_len, duration)
    return max(0.0, s2), min(e2, duration)


def plan_cuts(
    a: Analysis,
    min_len: float = 10.0,
    max_len: float = 15.0,
    count: int = 6,
    beats_per_bar: int = 4,
    prefer_vocal: bool = True,
    respect_phrases: bool = True,
    duration_slack: float = 1.5,
) -> list[Segment]:
    """Slice the whole track into short, bar-aligned cuts for short-form video.

    Unlike `find_hooks`, which hunts for the single best moment, this spreads
    the cuts across the song: the track is divided into as many zones as there
    are cuts, and the strongest bar-aligned window inside each zone wins. That
    way a set of clips covers the verse, the chorus and the outro instead of
    four variations on the same eight bars.
    """
    sec_per_bar = beats_per_bar * 60.0 / max(a.bpm, 1e-6)
    bars_min = max(1, int(np.ceil(min_len / sec_per_bar)))
    bars_max = max(bars_min, int(np.floor(max_len / sec_per_bar)))
    bar_options = list(range(bars_min, bars_max + 1)) or [bars_min]

    starts = a.downbeats if len(a.downbeats) > 3 else a.beats
    if not len(starts):
        step = max_len
        out = []
        t = 0.0
        while t + min_len <= a.duration and len(out) < count:
            out.append(Segment(t, min(t + max_len, a.duration), 0.0, ""))
            t += max_len
        return out

    rep, bt = repetition_score(a, bars_max * beats_per_bar)

    cands: list[tuple[float, float, float, str]] = []
    for s in starts:
        for bars in bar_options:
            length = bars * sec_per_bar
            if length < min_len - 0.35 or length > max_len + 0.35:
                continue
            e = s + length
            if e > a.duration - 0.05:
                continue
            loud = _mean_between(a.times, a.rms, s, e)
            voc = _mean_between(a.times, a.vocal_active.astype(np.float32), s, e)
            repw = float(np.interp(s, bt, rep)) if len(bt) else 0.0
            pre = _mean_between(a.times, a.rms, max(0.0, s - sec_per_bar / 2), s)
            entrance = max(0.0, loud - pre)
            score = (
                1.0 * loud
                + (1.1 if prefer_vocal else 0.3) * voc
                + 0.8 * repw
                + 0.5 * entrance
            )
            cands.append((float(s), float(e), float(score),
                          _reason(voc, repw, entrance)))

    if not cands:
        return []

    # one cut per zone, so the set covers the whole song
    zones = max(1, count)
    zone_len = a.duration / zones
    chosen: list[Segment] = []
    for z in range(zones):
        lo, hi = z * zone_len, (z + 1) * zone_len
        inside = [c for c in cands if lo <= c[0] < hi]
        pool = inside or [c for c in cands if lo - zone_len * 0.4 <= c[0] < hi + zone_len * 0.4]
        if not pool:
            continue
        pool.sort(key=lambda c: -c[2])
        for s, e, sc, why in pool:
            if all(e <= c.start or s >= c.end for c in chosen):
                chosen.append(Segment(s, e, sc, why))
                break

    chosen.sort(key=lambda s: s.start)
    chosen = chosen[:count]

    if respect_phrases:
        from .analysis import vocal_phrases
        phrases = vocal_phrases(a)
        adjusted: list[Segment] = []
        for seg in chosen:
            s2, e2 = snap_to_phrases(
                seg.start, seg.end, phrases,
                min_len=min_len, max_len=max_len,
                duration=a.duration,
            )
            if e2 > a.duration:
                e2 = a.duration
            adjusted.append(Segment(s2, e2, seg.score, seg.reason))
        # drop any overlap the nudging may have created
        adjusted.sort(key=lambda s: s.start)
        out: list[Segment] = []
        for seg in adjusted:
            if out and seg.start < out[-1].end:
                seg = Segment(out[-1].end + 0.05, seg.end, seg.score, seg.reason)
            if seg.end - seg.start >= min_len * 0.7:
                out.append(seg)
        chosen = out

    return chosen
