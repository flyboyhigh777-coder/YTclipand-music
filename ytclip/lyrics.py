"""Lyrics: parsing (.txt / .lrc / .srt) and word-level timing.

Three ways to get timings, in order of accuracy:
  1. enhanced .lrc with per-word tags  -> used as-is
  2. plain .lrc / .srt line timings     -> words spread inside each line
  3. plain .txt                         -> lines matched to detected sung phrases
Any result can be dumped to .lrc, hand-corrected, and fed back in.
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from .analysis import Analysis, vocal_phrases

VOWELS_RU = set("аеёиоуыэюяАЕЁИОУЫЭЮЯ")
VOWELS_LAT = set("aeiouyAEIOUY")


@dataclass
class Word:
    text: str
    start: float
    end: float

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)


@dataclass
class Line:
    text: str
    start: float = 0.0
    end: float = 0.0
    words: list[Word] = field(default_factory=list)

    @property
    def duration(self) -> float:
        return max(0.0, self.end - self.start)

    def tokens(self) -> list[str]:
        return [w for w in re.split(r"\s+", self.text.strip()) if w]


@dataclass
class Lyrics:
    lines: list[Line]
    source: str = "plain"

    @property
    def timed(self) -> bool:
        return bool(self.lines) and any(l.end > l.start for l in self.lines)

    def spans(self) -> list[tuple[float, float]]:
        return [(l.start, l.end) for l in self.lines if l.end > l.start]

    def between(self, t0: float, t1: float) -> list[Line]:
        """Lines overlapping a time window, re-based so the window starts at 0."""
        out: list[Line] = []
        for l in self.lines:
            if l.end <= t0 or l.start >= t1:
                continue
            words = [
                Word(w.text, max(0.0, w.start - t0), min(t1 - t0, w.end - t0))
                for w in l.words if w.end > t0 and w.start < t1
            ]
            out.append(Line(l.text, max(0.0, l.start - t0), min(t1 - t0, l.end - t0), words))
        return out


# --------------------------------------------------------------------------- #
# syllables (Russian + Latin)
# --------------------------------------------------------------------------- #
def syllables(word: str) -> int:
    w = unicodedata.normalize("NFC", word)
    letters = [c for c in w if c.isalpha()]
    if not letters:
        return 0
    count, prev_vowel = 0, False
    for c in letters:
        is_v = c in VOWELS_RU or c in VOWELS_LAT
        if c in VOWELS_RU:
            count += 1          # Russian: one vowel = one syllable
            prev_vowel = True
            continue
        if is_v and not prev_vowel:
            count += 1          # Latin: a vowel group = one syllable
        prev_vowel = is_v
    return max(1, count)


def weight(word: str) -> float:
    """Relative singing time of a token: syllables, with a nudge for long words."""
    s = syllables(word)
    return float(s) + 0.18 * max(0, len(word) - 4 * s) / 4.0 + 0.25


# --------------------------------------------------------------------------- #
# parsers
# --------------------------------------------------------------------------- #
_LRC_LINE = re.compile(r"\[(\d+):(\d+(?:[.:]\d+)?)\]")
_LRC_WORD = re.compile(r"<(\d+):(\d+(?:[.:]\d+)?)>")
_SRT_TIME = re.compile(
    r"(\d+):(\d+):(\d+)[,.](\d+)\s*-->\s*(\d+):(\d+):(\d+)[,.](\d+)"
)
_META = re.compile(r"^\[(ti|ar|al|by|offset|re|ve|length)\s*:", re.I)


def _mmss(m: str, s: str) -> float:
    return int(m) * 60 + float(s.replace(":", "."))


def load(path: str | Path, analysis: Analysis | None = None) -> Lyrics:
    """Load lyrics from .lrc / .srt / .txt and return them timed when possible."""
    path = Path(path)
    text = path.read_text(encoding="utf-8-sig")
    suffix = path.suffix.lower()
    if suffix == ".lrc" or _LRC_LINE.search(text):
        lyr = parse_lrc(text)
    elif suffix == ".srt" or _SRT_TIME.search(text):
        lyr = parse_srt(text)
    else:
        lyr = parse_plain(text)
    if not lyr.timed and analysis is not None:
        lyr = auto_time(lyr, analysis)
    elif lyr.timed and analysis is not None:
        lyr = fill_word_times(lyr, analysis)
    return lyr


def parse_plain(text: str) -> Lyrics:
    lines = [Line(text=l.strip()) for l in text.splitlines()
             if l.strip() and not _META.match(l.strip()) and not l.strip().startswith("#")]
    return Lyrics(lines=lines, source="plain")


def parse_lrc(text: str) -> Lyrics:
    out: list[Line] = []
    for raw in text.splitlines():
        raw = raw.strip()
        if not raw or _META.match(raw):
            continue
        stamps = _LRC_LINE.findall(raw)
        if not stamps:
            continue
        body = _LRC_LINE.sub("", raw).strip()
        words: list[Word] = []
        if _LRC_WORD.search(body):
            parts = _LRC_WORD.split(body)
            # split() yields: [pre, m, s, chunk, m, s, chunk, ...]
            pre = parts[0].strip()
            it = parts[1:]
            for i in range(0, len(it) - 2, 3):
                t = _mmss(it[i], it[i + 1])
                chunk = it[i + 2].strip()
                for tok in chunk.split():
                    words.append(Word(tok, t, t))
            body = " ".join(([pre] if pre else []) + [w.text for w in words]).strip()
        for mm, ss in stamps:
            start = _mmss(mm, ss)
            ws = [Word(w.text, w.start, w.end) for w in words] if words else []
            if ws:
                ws[0].start = min(ws[0].start, start)
            out.append(Line(text=body, start=start, end=start, words=ws))
    out.sort(key=lambda l: l.start)
    for a, b in zip(out, out[1:]):
        a.end = max(a.start + 0.4, min(b.start - 0.04, a.start + 12.0))
    if out:
        out[-1].end = out[-1].start + max(1.6, 0.42 * sum(weight(t) for t in out[-1].tokens()))
    for l in out:
        for w, nxt in zip(l.words, l.words[1:]):
            w.end = max(w.start + 0.08, nxt.start - 0.01)
        if l.words:
            l.words[-1].end = max(l.words[-1].start + 0.18, l.end)
    return Lyrics(lines=out, source="lrc")


def parse_srt(text: str) -> Lyrics:
    out: list[Line] = []
    blocks = re.split(r"\n\s*\n", text.strip())
    for b in blocks:
        m = _SRT_TIME.search(b)
        if not m:
            continue
        g = [int(x) for x in m.groups()]
        start = g[0] * 3600 + g[1] * 60 + g[2] + g[3] / (1000.0 if g[3] > 99 else 100.0)
        end = g[4] * 3600 + g[5] * 60 + g[6] + g[7] / (1000.0 if g[7] > 99 else 100.0)
        body = " ".join(
            l.strip() for l in b.splitlines()
            if l.strip() and not _SRT_TIME.search(l) and not l.strip().isdigit()
        )
        body = re.sub(r"<[^>]+>", "", body).strip()
        if body:
            out.append(Line(text=body, start=start, end=end))
    out.sort(key=lambda l: l.start)
    return Lyrics(lines=out, source="srt")


# --------------------------------------------------------------------------- #
# timing
# --------------------------------------------------------------------------- #
def auto_time(lyr: Lyrics, a: Analysis, min_line: float = 0.55) -> Lyrics:
    """Spread untimed lines over the stretches where the analyser hears singing.

    Sung phrases are concatenated into one 'singing timeline'; each line gets a
    share of it proportional to its syllable count, then mapped back to real time.
    """
    phrases = vocal_phrases(a)
    if not phrases or not lyr.lines:
        return _time_evenly(lyr, a)

    # if phrase count matches line count, trust the 1:1 mapping
    if abs(len(phrases) - len(lyr.lines)) <= 1 and len(lyr.lines) > 2:
        for line, (s, e) in zip(lyr.lines, phrases):
            line.start, line.end = s, max(e, s + min_line)
    else:
        durations = np.array([p[1] - p[0] for p in phrases], dtype=np.float64)
        cum = np.concatenate(([0.0], np.cumsum(durations)))
        total_sung = float(cum[-1])

        def to_real(x: float) -> float:
            x = float(np.clip(x, 0.0, total_sung))
            i = int(np.clip(np.searchsorted(cum, x) - 1, 0, len(phrases) - 1))
            return phrases[i][0] + (x - cum[i])

        w = np.array([max(sum(weight(t) for t in l.tokens()), 0.6) for l in lyr.lines])
        edges = np.concatenate(([0.0], np.cumsum(w / w.sum() * total_sung)))
        for i, line in enumerate(lyr.lines):
            line.start = to_real(edges[i])
            line.end = max(to_real(edges[i + 1]), line.start + min_line)

    lyr.source += "+auto"
    return fill_word_times(lyr, a)


def _time_evenly(lyr: Lyrics, a: Analysis) -> Lyrics:
    """Fallback when no singing was detected: spread lines across the track."""
    if not lyr.lines:
        return lyr
    w = np.array([max(sum(weight(t) for t in l.tokens()), 0.6) for l in lyr.lines])
    edges = np.concatenate(([0.0], np.cumsum(w / w.sum() * max(a.duration - 1.0, 1.0))))
    for i, line in enumerate(lyr.lines):
        line.start, line.end = float(edges[i]), float(edges[i + 1])
    lyr.source += "+even"
    return fill_word_times(lyr, a)


def snap_lines_to_beats(lyr: Lyrics, a: Analysis, window: float = 0.14) -> Lyrics:
    """Nudge line starts onto the nearest beat when they are already close.

    Singing almost always enters on or just before a beat; snapping removes the
    few-frame wobble that makes captions feel slightly off even when the words
    are right.
    """
    if not len(a.beats):
        return lyr
    beats = a.beats
    for line in lyr.lines:
        i = int(np.argmin(np.abs(beats - line.start)))
        cand = float(beats[i])
        delta = cand - line.start
        if abs(delta) <= window and line.duration > abs(delta) + 0.2:
            line.start = cand
            if line.words:
                line.words[0].start = cand
                line.words[0].end = max(line.words[0].end, cand + 0.09)
    return lyr


def fill_word_times(lyr: Lyrics, a: Analysis | None = None,
                    snap_window: float = 0.11) -> Lyrics:
    """Give every token a start/end inside its line, snapped to vocal onsets."""
    onsets = _vocal_onsets(a) if a is not None else np.array([])
    for line in lyr.lines:
        toks = line.tokens()
        if not toks:
            continue
        if len(line.words) == len(toks) and all(w.end > w.start for w in line.words):
            continue  # already word-timed (enhanced LRC)
        w = np.array([weight(t) for t in toks], dtype=np.float64)
        edges = line.start + np.concatenate(([0.0], np.cumsum(w / w.sum() * line.duration)))
        if onsets.size:
            for i in range(1, len(edges) - 1):      # keep line boundaries intact
                near = onsets[np.abs(onsets - edges[i]) < snap_window]
                if near.size:
                    cand = float(near[np.argmin(np.abs(near - edges[i]))])
                    if edges[i - 1] + 0.07 < cand < edges[i + 1] - 0.07:
                        edges[i] = cand
        line.words = [
            Word(t, float(edges[i]), float(max(edges[i + 1], edges[i] + 0.09)))
            for i, t in enumerate(toks)
        ]
    return lyr


def _vocal_onsets(a: Analysis, thresh: float = 0.55) -> np.ndarray:
    """Onset peaks that land where the voice is active — likely syllable attacks."""
    env = a.onset * (0.35 + 0.65 * a.vocal)
    env = env * a.vocal_active
    if not env.size:
        return np.array([])
    t = float(np.percentile(env[env > 0], 100 * thresh)) if (env > 0).any() else 1.0
    peaks = [
        i for i in range(1, len(env) - 1)
        if env[i] > t and env[i] >= env[i - 1] and env[i] > env[i + 1]
    ]
    return (np.array(peaks, dtype=np.float64) / a.fps) if peaks else np.array([])


def shift_all(lyr: Lyrics, offset: float) -> Lyrics:
    """Global nudge, e.g. --offset -0.25 when captions feel late."""
    for l in lyr.lines:
        l.start += offset
        l.end += offset
        for w in l.words:
            w.start += offset
            w.end += offset
    return lyr


def stretch(lyr: Lyrics, factor: float) -> Lyrics:
    for l in lyr.lines:
        l.start *= factor
        l.end *= factor
        for w in l.words:
            w.start *= factor
            w.end *= factor
    return lyr


def write_lrc(lyr: Lyrics, path: str | Path, words: bool = True,
              title: str | None = None, artist: str | None = None) -> Path:
    """Dump timings as (enhanced) LRC — the file to hand-correct and re-feed."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    out: list[str] = []
    if title:
        out.append(f"[ti:{title}]")
    if artist:
        out.append(f"[ar:{artist}]")
    out.append("[by:ytclip]")
    for l in lyr.lines:
        body = ""
        if words and l.words:
            body = "".join(f"<{_fmt(w.start)}>{w.text} " for w in l.words).rstrip()
        else:
            body = l.text
        out.append(f"[{_fmt(l.start)}]{body}")
    path.write_text("\n".join(out) + "\n", encoding="utf-8")
    return path


def _fmt(t: float) -> str:
    t = max(0.0, t)
    return f"{int(t // 60):02d}:{t % 60:05.2f}"


def chunk_line(line: Line, max_chars: int = 22, max_words: int = 4) -> list[list[Word]]:
    """Split a line into caption-sized groups (for one-word / few-word styles)."""
    groups: list[list[Word]] = []
    cur: list[Word] = []
    for w in line.words:
        projected = len(" ".join(x.text for x in cur + [w]))
        if cur and (projected > max_chars or len(cur) >= max_words):
            groups.append(cur)
            cur = []
        cur.append(w)
    if cur:
        groups.append(cur)
    return groups
