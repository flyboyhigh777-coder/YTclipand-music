#!/usr/bin/env python3
"""Self-checks for the analysis side. Run: python3 tests/test_pipeline.py

Uses the synthetic demo track, whose tempo, bar count and sung phrases are
known in advance, so the numbers can be asserted instead of eyeballed.
"""
from __future__ import annotations

import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from ytclip import analysis as an           # noqa: E402
from ytclip import artwork, hooks, lyrics as ly, palette as pal  # noqa: E402

DEMO = ROOT / "assets" / "demo"
TRACK = DEMO / "demo-track.wav"
COVER = DEMO / "demo-cover.jpg"
LYRICS = DEMO / "demo-lyrics.txt"

PASS, FAIL = [], []


def check(name: str, cond: bool, detail: str = "") -> None:
    (PASS if cond else FAIL).append(name)
    mark = "ok  " if cond else "FAIL"
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail else ""))


def need_demo() -> bool:
    if TRACK.exists() and COVER.exists():
        return True
    print("Демо-ассетов нет. Сначала: python3 examples/make_demo_assets.py")
    return False


def test_analysis() -> an.Analysis:
    print("Анализ синтетического трека (эталон: 100 BPM, 14 тактов)")
    a = an.analyze(TRACK)
    check("темп в пределах ±3 BPM", abs(a.bpm - 100.0) <= 3.0, f"{a.bpm:.1f} BPM")
    check("длительность ~33.6 с", abs(a.duration - 33.6) < 1.0, f"{a.duration:.1f} с")
    check("биты найдены", len(a.beats) > 40, f"{len(a.beats)} битов")
    check("доли такта найдены", 10 <= len(a.downbeats) <= 18, f"{len(a.downbeats)}")
    check("вокал опознан", 0.25 < a.vocal_active.mean() < 0.85,
          f"{100 * a.vocal_active.mean():.0f}% времени")
    check("вокальные фразы найдены", len(an.vocal_phrases(a)) >= 3)
    check("кривые одной длины",
          len({len(a.rms), len(a.low), len(a.mid), len(a.high), len(a.vocal)}) == 1)
    check("спектр-бары в 0..1",
          all(0.0 <= v <= 1.0 for v in a.spectrum_bars(5.0, 24)))
    return a


def test_hooks(a: an.Analysis) -> None:
    print("Выбор фрагментов")
    segs = hooks.find_hooks(a, target=8.0, count=3)
    check("фрагменты найдены", len(segs) >= 2, f"{len(segs)}")
    check("длина близка к заданной",
          all(abs(s.duration - 8.0) < 3.0 for s in segs))
    check("фрагменты внутри трека",
          all(0 <= s.start and s.end <= a.duration + 0.01 for s in segs))
    check("фрагменты не пересекаются",
          all(segs[i].end <= segs[i + 1].start or segs[i + 1].end <= segs[i].start
              for i in range(len(segs) - 1)))


def test_lyrics(a: an.Analysis) -> None:
    print("Текст и тайминг")
    lyr = ly.load(LYRICS, analysis=a)
    check("строки разобраны", len(lyr.lines) == 6, f"{len(lyr.lines)}")
    check("тайминг проставлен", lyr.timed)
    check("у всех строк есть слова", all(l.words for l in lyr.lines))
    check("слова идут по возрастанию",
          all(w1.start <= w2.start for l in lyr.lines for w1, w2 in zip(l.words, l.words[1:])))
    check("слова внутри своей строки",
          all(l.words[0].start >= l.start - 0.05 and l.words[-1].end <= l.end + 0.6
              for l in lyr.lines))
    check("строки не наезжают друг на друга",
          all(a1.end <= b1.start + 0.05 for a1, b1 in zip(lyr.lines, lyr.lines[1:])))

    check("слоги: русский", ly.syllables("серьёзно") == 3, str(ly.syllables("серьёзно")))
    check("слоги: латиница", ly.syllables("stairwell") == 2, str(ly.syllables("stairwell")))
    check("слоги: минимум 1", ly.syllables("вдруг") == 1)

    with tempfile.TemporaryDirectory() as td:
        out = ly.write_lrc(lyr, Path(td) / "t.lrc")
        back = ly.parse_lrc(out.read_text(encoding="utf-8"))
        check("LRC пишется и читается обратно", len(back.lines) == len(lyr.lines))
        check("время при чтении сохраняется",
              abs(back.lines[0].start - lyr.lines[0].start) < 0.02)

    windowed = lyr.between(4.0, 12.0)
    check("окно вырезается", len(windowed) >= 1)
    check("время в окне от нуля",
          all(l.start >= -0.01 for l in windowed))


def test_palette_and_artwork() -> None:
    print("Палитра и обложка")
    p = pal.extract(COVER)
    check("палитра извлекается", len(p.colors) >= 2)
    check("цвета — корректный hex",
          all(len(v) == 7 and v.startswith("#") for k, v in p.as_dict().items()
              if k in ("bg", "bg2", "accent", "accent2", "text")))
    preset = ROOT / "assets" / "brand" / "th3rd.json"
    if preset.exists():
        q = pal.load_preset(preset)
        check("пресет th3rd читается", q.as_dict()["accent"].upper() == "#B33E2D",
              q.as_dict()["accent"])

    box = artwork.find_photo(COVER)
    check("на цельной обложке фото не выдумывается", box is None or box.w > 0.5,
          "нет вложенного фото" if box is None else f"w={box.w:.2f}")


def main() -> int:
    if not need_demo():
        return 1
    a = test_analysis()
    test_hooks(a)
    test_lyrics(a)
    test_palette_and_artwork()
    print()
    print(f"Итог: {len(PASS)} ок, {len(FAIL)} провалено")
    if FAIL:
        for f in FAIL:
            print(f"  провал: {f}")
    return 0 if not FAIL else 1


if __name__ == "__main__":
    raise SystemExit(main())
