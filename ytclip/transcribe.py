"""Whisper wrapper: speech -> words with timestamps, then matched to the real lyrics.

Rule (rules.md §2.5): Whisper supplies *timing only*. The spelling always comes
from the lyrics the author wrote, because Whisper mishears sung words.
"""
from __future__ import annotations

import difflib
import json
import re
import unicodedata
from dataclasses import dataclass, asdict
from pathlib import Path

from .lyrics import Line, Lyrics, Word

MODEL_HINT = """
Whisper model could not be loaded.

  pip install faster-whisper

The model itself is downloaded from huggingface.co on first run. If this
machine's network policy blocks that host, the download fails — allow
`huggingface.co` and `cdn-lfs.huggingface.co` for the environment, or run
`ytclip transcribe` on a machine with open access and copy the resulting
JSON next to the track.
""".strip()


@dataclass
class RawWord:
    text: str
    start: float
    end: float
    probability: float = 1.0


# --------------------------------------------------------------------------- #
# recognition
# --------------------------------------------------------------------------- #
def transcribe(
    audio: str | Path,
    model_size: str = "small",
    language: str | None = None,
    device: str = "cpu",
    compute_type: str = "int8",
    initial_prompt: str | None = None,
    cache: str | Path | None = None,
    vad: bool = True,
    verbose: bool = True,
) -> list[RawWord]:
    """Run faster-whisper with word timestamps. Results are cached as JSON."""
    if cache is not None:
        cache = Path(cache)
        if cache.exists():
            data = json.loads(cache.read_text(encoding="utf-8"))
            if verbose:
                print(f"  cached transcript: {cache} ({len(data['words'])} words)")
            return [RawWord(**w) for w in data["words"]]

    try:
        from faster_whisper import WhisperModel  # type: ignore
    except Exception as exc:  # pragma: no cover - depends on the host
        raise RuntimeError(f"{MODEL_HINT}\n\n(import error: {exc})") from exc

    if verbose:
        print(f"  whisper: loading model '{model_size}' ({device}/{compute_type})…")
    try:
        model = WhisperModel(model_size, device=device, compute_type=compute_type)
    except Exception as exc:  # pragma: no cover
        raise RuntimeError(f"{MODEL_HINT}\n\n(load error: {exc})") from exc

    segments, info = model.transcribe(
        str(audio),
        language=language,
        word_timestamps=True,
        vad_filter=vad,
        vad_parameters={"min_silence_duration_ms": 350} if vad else None,
        initial_prompt=initial_prompt,
        beam_size=5,
        condition_on_previous_text=False,   # lyrics repeat; avoid runaway context
    )
    words: list[RawWord] = []
    for seg in segments:
        for w in (seg.words or []):
            t = w.word.strip()
            if t:
                words.append(RawWord(t, float(w.start), float(w.end), float(w.probability or 0)))
    if verbose:
        print(f"  whisper: language={getattr(info, 'language', '?')}, {len(words)} words")

    if cache is not None:
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(
            json.dumps({"model": model_size, "words": [asdict(w) for w in words]},
                       ensure_ascii=False, indent=1),
            encoding="utf-8",
        )
    return words


# --------------------------------------------------------------------------- #
# matching recognised audio against the written lyrics
# --------------------------------------------------------------------------- #
_PUNCT = re.compile(r"[^\w\s]", re.UNICODE)


def norm(token: str) -> str:
    t = unicodedata.normalize("NFC", token).lower().replace("ё", "е")
    return _PUNCT.sub("", t).strip()


def align_to_lyrics(raw: list[RawWord], lyr: Lyrics, verbose: bool = True) -> Lyrics:
    """Transfer Whisper timings onto the author's own words.

    Uses a sequence match over normalised tokens; words Whisper missed get times
    interpolated from their matched neighbours, so no word is ever left untimed.
    """
    official: list[tuple[int, int, str]] = []   # (line index, token index, token)
    for li, line in enumerate(lyr.lines):
        for ti, tok in enumerate(line.tokens()):
            official.append((li, ti, tok))
    if not official or not raw:
        return lyr

    a = [norm(t) for _, _, t in official]
    b = [norm(w.text) for w in raw]
    sm = difflib.SequenceMatcher(a=a, b=b, autojunk=False)

    start: list[float | None] = [None] * len(official)
    end: list[float | None] = [None] * len(official)
    matched = 0
    for i, j, n in sm.get_matching_blocks():
        for k in range(n):
            start[i + k] = raw[j + k].start
            end[i + k] = raw[j + k].end
            matched += 1

    if verbose:
        pct = 100.0 * matched / max(len(official), 1)
        print(f"  alignment: {matched}/{len(official)} words matched ({pct:.0f}%)")
    if matched < max(3, 0.15 * len(official)):
        if verbose:
            print("  alignment too weak — keeping existing timings")
        return lyr

    _interpolate(start, end, raw)

    # write back, grouped per line
    per_line: dict[int, list[Word]] = {}
    for idx, (li, _ti, tok) in enumerate(official):
        s, e = start[idx], end[idx]
        if s is None or e is None:
            continue
        per_line.setdefault(li, []).append(Word(tok, float(s), float(max(e, s + 0.08))))
    for li, line in enumerate(lyr.lines):
        ws = per_line.get(li) or []
        if not ws:
            continue
        ws.sort(key=lambda w: w.start)
        for w, nxt in zip(ws, ws[1:]):          # no overlaps
            w.end = min(w.end, max(w.start + 0.08, nxt.start))
        line.words = ws
        line.start, line.end = ws[0].start, max(ws[-1].end, ws[0].start + 0.4)
    lyr.lines.sort(key=lambda l: l.start)
    lyr.source = (lyr.source.split("+")[0] if lyr.source else "txt") + "+whisper"
    return lyr


def _interpolate(start: list[float | None], end: list[float | None],
                 raw: list[RawWord]) -> None:
    """Fill gaps left by unmatched words by spreading time between anchors."""
    n = len(start)
    known = [i for i in range(n) if start[i] is not None]
    if not known:
        return
    # leading / trailing gaps
    first, last = known[0], known[-1]
    for i in range(first):
        span = max(0.12, (start[first] - raw[0].start) / max(first, 1)) if first else 0.2
        start[i] = max(0.0, start[first] - (first - i) * span)
        end[i] = start[i] + span * 0.85
    for i in range(last + 1, n):
        span = 0.25
        start[i] = end[last] + (i - last - 1) * span
        end[i] = start[i] + span * 0.85
    # interior gaps
    for p, q in zip(known, known[1:]):
        if q - p <= 1:
            continue
        t0, t1 = float(end[p]), float(start[q])
        step = max((t1 - t0) / (q - p), 0.09)
        for k in range(p + 1, q):
            start[k] = t0 + (k - p - 1) * step
            end[k] = start[k] + step * 0.9


def lyrics_from_whisper(raw: list[RawWord], max_words_per_line: int = 7) -> Lyrics:
    """Build lyrics purely from recognition (used when no written text is given)."""
    lines: list[Line] = []
    cur: list[Word] = []
    for w in raw:
        cur.append(Word(w.text, w.start, w.end))
        gap_next = False
        if len(cur) >= max_words_per_line:
            gap_next = True
        if gap_next:
            lines.append(Line(" ".join(x.text for x in cur), cur[0].start, cur[-1].end, cur))
            cur = []
    if cur:
        lines.append(Line(" ".join(x.text for x in cur), cur[0].start, cur[-1].end, cur))
    return Lyrics(lines=lines, source="whisper")


def save_words(raw: list[RawWord], path: str | Path) -> Path:
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps([asdict(w) for w in raw], ensure_ascii=False, indent=1),
                    encoding="utf-8")
    return path


def load_words(path: str | Path) -> list[RawWord]:
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if isinstance(data, dict):
        data = data.get("words", [])
    return [RawWord(**w) for w in data]
