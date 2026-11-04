"""Beat / energy / vocal / hook analysis on numpy only (no librosa needed).

Everything downstream (visual motion, cut points, caption timing) is driven by
the `Analysis` object produced here.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .ffmpeg_io import decode_mono, probe

SR = 22050
N_FFT = 2048
HOP = 256  # ~11.6 ms at 22050 Hz -> 86 frames/sec, enough for word-level work


# --------------------------------------------------------------------------- #
# low level helpers
# --------------------------------------------------------------------------- #
def stft_mag(y: np.ndarray, n_fft: int = N_FFT, hop: int = HOP) -> np.ndarray:
    """Magnitude STFT, shape (1 + n_fft//2, n_frames)."""
    pad = n_fft // 2
    yp = np.pad(y, pad, mode="reflect")
    n_frames = 1 + (len(yp) - n_fft) // hop
    if n_frames < 1:
        return np.zeros((1 + n_fft // 2, 1), dtype=np.float32)
    idx = np.arange(n_fft)[None, :] + hop * np.arange(n_frames)[:, None]
    frames = yp[idx] * np.hanning(n_fft).astype(np.float32)[None, :]
    spec = np.fft.rfft(frames, axis=1)
    return np.abs(spec).astype(np.float32).T


def smooth(x: np.ndarray, width: int) -> np.ndarray:
    """Moving average with edge padding."""
    if width <= 1:
        return x
    k = np.ones(width, dtype=np.float32) / float(width)
    return np.convolve(np.pad(x, width // 2, mode="edge"), k, mode="same")[
        width // 2 : width // 2 + len(x)
    ]


def normalize01(x: np.ndarray) -> np.ndarray:
    lo = float(np.percentile(x, 2)) if x.size else 0.0
    hi = float(np.percentile(x, 98)) if x.size else 1.0
    if hi - lo < 1e-9:
        return np.zeros_like(x)
    return np.clip((x - lo) / (hi - lo), 0.0, 1.0)


def _median_filter_1d(x: np.ndarray, k: int) -> np.ndarray:
    if k <= 1:
        return x
    if k % 2 == 0:
        k += 1
    pad = k // 2
    xp = np.pad(x, pad, mode="edge")
    strides = np.lib.stride_tricks.sliding_window_view(xp, k)
    return np.median(strides, axis=-1).astype(x.dtype)


def hpss(spec: np.ndarray, kt: int = 17, kf: int = 17) -> tuple[np.ndarray, np.ndarray]:
    """Crude median-filter harmonic/percussive split (Fitzgerald 2010)."""
    harm = np.apply_along_axis(_median_filter_1d, 1, spec, kt)   # smooth over time
    perc = np.apply_along_axis(_median_filter_1d, 0, spec, kf)   # smooth over freq
    total = harm + perc + 1e-9
    return spec * (harm / total), spec * (perc / total)


def band_mask(freqs: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return (freqs >= lo) & (freqs < hi)


# --------------------------------------------------------------------------- #
# beat tracking
# --------------------------------------------------------------------------- #
def onset_envelope(spec: np.ndarray) -> np.ndarray:
    """Spectral flux on a log-compressed spectrogram."""
    logspec = np.log1p(spec * 10.0)
    flux = np.diff(logspec, axis=1, prepend=logspec[:, :1])
    env = np.maximum(flux, 0.0).sum(axis=0)
    env = smooth(env, 3)
    return normalize01(env)


def estimate_tempo(env: np.ndarray, fps: float,
                   bpm_range: tuple[float, float] = (60.0, 190.0)) -> float:
    """Autocorrelation of the onset envelope, with a log-normal prior at 120 BPM."""
    x = env - env.mean()
    if np.allclose(x, 0):
        return 120.0
    ac = np.correlate(x, x, mode="full")[len(x) - 1 :]
    lags = np.arange(len(ac))
    with np.errstate(divide="ignore"):
        bpms = np.where(lags > 0, 60.0 * fps / np.maximum(lags, 1), 0.0)
    ok = (bpms >= bpm_range[0]) & (bpms <= bpm_range[1])
    if not ok.any():
        return 120.0
    prior = np.exp(-0.5 * ((np.log2(np.maximum(bpms, 1e-6) / 120.0)) / 0.9) ** 2)
    score = np.where(ok, ac * prior, -np.inf)
    return float(bpms[int(np.argmax(score))])


def track_beats(env: np.ndarray, fps: float, bpm: float, tightness: float = 180.0) -> np.ndarray:
    """Dynamic-programming beat tracker (Ellis 2007), returns beat times in seconds."""
    period = 60.0 * fps / max(bpm, 1e-6)
    if period < 2 or len(env) < 4:
        return np.array([], dtype=np.float32)
    local = env - smooth(env, max(3, int(round(period))))
    local = normalize01(local)
    n = len(local)
    score = np.full(n, -np.inf, dtype=np.float64)
    back = np.zeros(n, dtype=np.int32)
    lo = max(1, int(round(period * 0.5)))
    hi = min(n - 1, int(round(period * 2.0)))
    cand = np.arange(-hi, -lo + 1)
    txcost = -tightness * (np.log(-cand / period) ** 2)
    score[0] = local[0]
    for i in range(1, n):
        js = i + cand
        valid = js >= 0
        if not valid.any():
            score[i] = local[i]
            back[i] = 0
            continue
        vals = score[js[valid]] + txcost[valid]
        best = int(np.argmax(vals))
        score[i] = local[i] + vals[best]
        back[i] = int(js[valid][best])
    # backtrack from a strong late peak
    tail = score[int(n * 0.75):]
    start = int(n * 0.75) + int(np.argmax(tail)) if tail.size else n - 1
    beats = [start]
    while back[beats[-1]] > 0 and back[beats[-1]] < beats[-1]:
        beats.append(int(back[beats[-1]]))
    beats = np.array(sorted(set(beats)), dtype=np.int64)
    return (beats / fps).astype(np.float32)


def log_bands(spec: np.ndarray, freqs: np.ndarray, n: int = 24,
              fmin: float = 45.0, fmax: float = 9500.0) -> np.ndarray:
    """(n, frames) log-spaced band energy, 0..1 — the compact stand-in for the
    full spectrogram."""
    edges = np.geomspace(fmin, fmax, n + 1)
    rows = [
        spec[m].mean(axis=0) if (m := band_mask(freqs, edges[k], edges[k + 1])).any()
        else np.zeros(spec.shape[1], np.float32)
        for k in range(n)
    ]
    mat = np.log1p(np.stack(rows) * 45.0)
    peak = float(np.percentile(mat, 99.5)) or 1.0
    return np.clip(mat / max(peak, 1e-6), 0.0, 1.0).astype(np.float32)


def pitch_classes(spec: np.ndarray, freqs: np.ndarray) -> np.ndarray:
    """(12, frames) chroma — 'what chord is this', used to spot repeats."""
    out = np.zeros((12, spec.shape[1]), dtype=np.float32)
    ok = freqs > 27.5
    if not ok.any():
        return out
    midi = 69 + 12 * np.log2(np.maximum(freqs, 1e-6) / 440.0)
    pc = np.round(midi).astype(int) % 12
    for k in range(12):
        m = ok & (pc == k) & band_mask(freqs, 60, 4000)
        if m.any():
            out[k] = spec[m].mean(axis=0)
    out /= out.sum(axis=0, keepdims=True) + 1e-9
    return out


# --------------------------------------------------------------------------- #
# analysis container
# --------------------------------------------------------------------------- #
@dataclass
class Analysis:
    path: str
    duration: float
    sr: int
    fps: float                      # analysis frames per second
    times: np.ndarray               # (n_frames,) seconds
    rms: np.ndarray                 # 0..1 loudness
    onset: np.ndarray               # 0..1 onset strength
    low: np.ndarray                 # 0..1 bass energy (kick)
    mid: np.ndarray
    high: np.ndarray
    vocal: np.ndarray               # 0..1 harmonic energy in the voice band
    vocal_active: np.ndarray        # bool, voice present
    bpm: float
    beats: np.ndarray               # beat times, seconds
    downbeats: np.ndarray           # every 4th beat, seconds
    spec: np.ndarray = field(repr=False, default_factory=lambda: np.zeros((1, 1), np.float32))
    freqs: np.ndarray = field(repr=False, default_factory=lambda: np.zeros(1, np.float32))
    # compact derived features — enough for hooks, bars and caching, so the full
    # spectrogram (tens of megabytes) never has to be kept or stored
    bands24: np.ndarray = field(repr=False, default_factory=lambda: np.zeros((0, 0), np.float32))
    chroma12: np.ndarray = field(repr=False, default_factory=lambda: np.zeros((0, 0), np.float32))

    # ---- sampling helpers (used by the visual templates) ----
    def at(self, curve: np.ndarray, t: float) -> float:
        if not len(self.times):
            return 0.0
        return float(np.interp(t, self.times, curve))

    def beat_phase(self, t: float) -> float:
        """0 right on a beat, rising to 1 just before the next one."""
        b = self.beats
        if len(b) < 2:
            return float((t * self.bpm / 60.0) % 1.0)
        i = int(np.searchsorted(b, t) - 1)
        if i < 0:
            period = float(b[1] - b[0])
            return float(((t - b[0]) / period) % 1.0)
        if i >= len(b) - 1:
            period = float(b[-1] - b[-2]) or 0.5
            return float(((t - b[i]) / period) % 1.0)
        period = float(b[i + 1] - b[i]) or 0.5
        return float((t - b[i]) / period)

    def beat_pulse(self, t: float, decay: float = 6.0) -> float:
        """Exponentially decaying spike on every beat (1 at the hit)."""
        b = self.beats
        if not len(b):
            return 0.0
        i = int(np.clip(np.searchsorted(b, t) - 1, 0, len(b) - 1))
        dt = max(0.0, t - float(b[i]))
        return float(np.exp(-decay * dt))

    def bar_index(self, t: float, beats_per_bar: int = 4) -> int:
        b = self.beats
        if not len(b):
            return int(t * self.bpm / 60.0 / beats_per_bar)
        i = int(np.clip(np.searchsorted(b, t) - 1, 0, len(b) - 1))
        return i // beats_per_bar

    def spectrum_bars(self, t: float, n_bars: int = 48,
                      fmin: float = 40.0, fmax: float = 9000.0) -> np.ndarray:
        """Log-spaced, smoothed magnitude bars at time `t`, each 0..1."""
        if self.spec.size <= 1:
            if self.bands24.size:
                fi = int(np.clip(round(t * self.fps), 0, self.bands24.shape[1] - 1))
                col = self.bands24[:, fi]
                src = np.linspace(0, len(col) - 1, n_bars)
                return np.clip(np.interp(src, np.arange(len(col)), col), 0, 1).astype(np.float32)
            return np.zeros(n_bars, dtype=np.float32)
        fi = int(np.clip(round(t * self.fps), 0, self.spec.shape[1] - 1))
        col = self.spec[:, fi]
        edges = np.geomspace(fmin, fmax, n_bars + 1)
        out = np.zeros(n_bars, dtype=np.float32)
        for k in range(n_bars):
            m = band_mask(self.freqs, edges[k], edges[k + 1])
            if m.any():
                out[k] = float(col[m].mean())
        out = np.log1p(out * 40.0)
        peak = float(np.percentile(np.log1p(self.spec.mean(axis=0) * 40.0), 99)) or 1.0
        return np.clip(out / max(peak * 1.6, 1e-6), 0.0, 1.0)

    def snap_to_beat(self, t: float, prefer_downbeat: bool = True) -> float:
        grid = self.downbeats if (prefer_downbeat and len(self.downbeats) > 2) else self.beats
        if not len(grid):
            return t
        return float(grid[int(np.argmin(np.abs(grid - t)))])


def analyze(path: str | Path, sr: int = SR, verbose: bool = False) -> Analysis:
    """Full analysis pass over an audio file."""
    info = probe(path)
    y = decode_mono(path, sr=sr)
    y = y / (np.max(np.abs(y)) + 1e-9)
    spec = stft_mag(y, N_FFT, HOP)
    fps = sr / HOP
    freqs = np.fft.rfftfreq(N_FFT, 1.0 / sr).astype(np.float32)
    n = spec.shape[1]
    times = (np.arange(n) / fps).astype(np.float32)

    harm, perc = hpss(spec)

    rms = normalize01(smooth(np.sqrt((spec ** 2).mean(axis=0)), 9))
    onset = onset_envelope(perc if perc.size else spec)

    def band(src: np.ndarray, lo: float, hi: float, w: int = 5) -> np.ndarray:
        m = band_mask(freqs, lo, hi)
        if not m.any():
            return np.zeros(n, dtype=np.float32)
        return normalize01(smooth(src[m].mean(axis=0), w))

    low = band(spec, 20, 180, 5)
    mid = band(spec, 180, 2000, 5)
    high = band(spec, 2000, 9000, 5)
    voc = band(harm, 250, 3600, 7)

    # voice is harmonic energy in the voice band that stands above the local floor
    v_rel = normalize01(smooth(voc - 0.65 * normalize01(smooth(low, 31)), 11))
    thr = max(0.22, float(np.percentile(v_rel, 55)))
    active = v_rel > thr
    active = _bool_close_open(active, close=int(0.18 * fps), open_=int(0.12 * fps))

    bands24 = log_bands(spec, freqs, 24)
    chroma12 = pitch_classes(spec, freqs)

    bpm = estimate_tempo(onset, fps)
    beats = track_beats(onset, fps, bpm)
    if len(beats) > 2:
        bpm = float(60.0 / np.median(np.diff(beats)))
    downbeats = _pick_downbeats(beats, low, times)

    if verbose:
        print(f"  tempo ~{bpm:.1f} BPM | beats {len(beats)} | voice {100*active.mean():.0f}% of track")

    return Analysis(
        path=str(path), duration=info.duration or float(len(y) / sr), sr=sr, fps=fps,
        times=times, rms=rms, onset=onset, low=low, mid=mid, high=high,
        vocal=v_rel, vocal_active=active, bpm=bpm, beats=beats, downbeats=downbeats,
        spec=spec, freqs=freqs, bands24=bands24, chroma12=chroma12,
    )


def _bool_close_open(mask: np.ndarray, close: int, open_: int) -> np.ndarray:
    """Binary closing then opening on a 1-D boolean mask (fill gaps, drop blips)."""
    def runs(m: np.ndarray) -> list[tuple[int, int]]:
        d = np.diff(np.concatenate(([0], m.view(np.int8), [0])))
        return list(zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1)))

    m = mask.copy()
    if close > 0:
        segs = runs(m)
        for (a1, b1), (a2, _) in zip(segs, segs[1:]):
            if a2 - b1 <= close:
                m[b1:a2] = True
    if open_ > 0:
        for a, b in runs(m):
            if b - a < open_:
                m[a:b] = False
    return m


def _pick_downbeats(beats: np.ndarray, low: np.ndarray, times: np.ndarray,
                    beats_per_bar: int = 4) -> np.ndarray:
    """Choose the beat offset whose bass energy is strongest -> bar starts."""
    if len(beats) < beats_per_bar * 2:
        return beats
    energy = np.interp(beats, times, low)
    scores = [energy[o::beats_per_bar].mean() for o in range(beats_per_bar)]
    off = int(np.argmax(scores))
    return beats[off::beats_per_bar]


def vocal_phrases(a: Analysis, min_len: float = 0.35,
                  max_gap: float = 0.30) -> list[tuple[float, float]]:
    """Contiguous sung stretches as (start, end) seconds — the basis for auto lyric timing."""
    m = a.vocal_active
    d = np.diff(np.concatenate(([0], m.view(np.int8), [0])))
    spans = [
        (float(a.times[s]), float(a.times[min(e, len(a.times) - 1)]))
        for s, e in zip(np.flatnonzero(d == 1), np.flatnonzero(d == -1))
    ]
    merged: list[list[float]] = []
    for s, e in spans:
        if merged and s - merged[-1][1] <= max_gap:
            merged[-1][1] = e
        else:
            merged.append([s, e])
    return [(s, e) for s, e in merged if e - s >= min_len]


# --------------------------------------------------------------------------- #
# caching
# --------------------------------------------------------------------------- #
_CACHE_VERSION = 3


def _fingerprint(path: str | Path) -> str:
    st = Path(path).stat()
    return f"{_CACHE_VERSION}:{st.st_size}:{int(st.st_mtime)}"


def analyze_cached(path: str | Path, cache_dir: str | Path,
                   sr: int = SR, verbose: bool = False) -> Analysis:
    """Same as `analyze`, but keeps the result on disk.

    A full pass costs ~20 s on a four-minute track, and nothing about a track
    changes between runs — so repeated renders should not pay for it again.
    """
    cache = Path(cache_dir) / "analysis.npz"
    fp = _fingerprint(path)
    if cache.exists():
        try:
            d = np.load(cache, allow_pickle=False)
            if str(d["fingerprint"]) == fp:
                if verbose:
                    print(f"  анализ из кэша: {cache.name}")
                return Analysis(
                    path=str(path), duration=float(d["duration"]), sr=int(d["sr"]),
                    fps=float(d["fps"]), times=d["times"], rms=d["rms"],
                    onset=d["onset"], low=d["low"], mid=d["mid"], high=d["high"],
                    vocal=d["vocal"], vocal_active=d["vocal_active"].astype(bool),
                    bpm=float(d["bpm"]), beats=d["beats"], downbeats=d["downbeats"],
                    freqs=d["freqs"], bands24=d["bands24"], chroma12=d["chroma12"],
                )
        except Exception:
            pass  # a broken cache is simply ignored

    a = analyze(path, sr=sr, verbose=verbose)
    try:
        cache.parent.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(
            cache, fingerprint=np.array(fp), duration=a.duration, sr=a.sr, fps=a.fps,
            times=a.times, rms=a.rms, onset=a.onset, low=a.low, mid=a.mid,
            high=a.high, vocal=a.vocal, vocal_active=a.vocal_active.astype(np.uint8),
            bpm=a.bpm, beats=a.beats, downbeats=a.downbeats, freqs=a.freqs,
            bands24=a.bands24, chroma12=a.chroma12,
        )
    except Exception as exc:
        if verbose:
            print(f"  (кэш не сохранён: {exc})")
    return a
