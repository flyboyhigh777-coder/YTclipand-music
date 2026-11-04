"""Command line interface — every feature of the project is a subcommand here."""
from __future__ import annotations

import argparse
import json
import shutil
import sys
import time
from pathlib import Path

from . import analysis as an
from . import ffmpeg_io, hooks, lyrics as ly, palette as pal, project as pj
from . import remotion_bridge as rb

ROOT = Path(__file__).resolve().parent.parent
WORK = ROOT / "work"
OUT = ROOT / "out"
PUBLIC = ROOT / "remotion" / "public"


def _p(msg: str = "") -> None:
    print(msg, flush=True)


# --------------------------------------------------------------------------- #
# shared steps
# --------------------------------------------------------------------------- #
def _prepare_cover(audio: Path, cover: Path | None, work: Path) -> Path | None:
    if cover and cover.exists():
        return cover
    guess = work / "cover-embedded.jpg"
    if ffmpeg_io.extract_cover(audio, guess):
        _p(f"  обложка извлечена из тега: {guess.name}")
        return guess
    return None


def _get_lyrics(args, a: an.Analysis, work: Path) -> ly.Lyrics | None:
    """Timing priority chain from rules.md §2.4."""
    text_path = Path(args.lyrics) if getattr(args, "lyrics", None) else None
    lyr: ly.Lyrics | None = None

    if text_path and text_path.exists():
        lyr = ly.load(text_path)           # parse only; timing decided below
        _p(f"  текст: {len(lyr.lines)} строк ({lyr.source})")

    use_whisper = not getattr(args, "no_whisper", False)
    raw = None
    if use_whisper:
        cache = work / f"whisper-{args.model}.json"
        try:
            from . import transcribe as tr
            prompt = " ".join(l.text for l in lyr.lines[:8]) if lyr else None
            raw = tr.transcribe(
                a.path, model_size=args.model, language=args.lang,
                initial_prompt=prompt, cache=cache,
            )
        except Exception as exc:
            _p(f"  Whisper недоступен — перехожу на выравнивание по вокальным фразам.")
            _p(f"    причина: {str(exc).splitlines()[0]}")
            raw = None

    if raw:
        from . import transcribe as tr
        if lyr and lyr.lines:
            lyr = tr.align_to_lyrics(raw, lyr)
        else:
            lyr = tr.lyrics_from_whisper(raw)
    elif lyr is not None:
        lyr = ly.auto_time(lyr, a) if not lyr.timed else ly.fill_word_times(lyr, a)

    if lyr is not None:
        lyr = ly.snap_lines_to_beats(lyr, a)
        if getattr(args, "offset", 0.0):
            lyr = ly.shift_all(lyr, float(args.offset))
        ly.write_lrc(lyr, work / "timing.lrc", title=getattr(args, "title", None),
                     artist=getattr(args, "artist", None))
        _p(f"  тайминг сохранён: {work / 'timing.lrc'} (можно править руками и запустить снова)")
    return lyr


def _slug_and_dirs(audio: Path, title: str | None) -> tuple[str, Path, Path]:
    slug = pj.slugify(title or audio.stem)
    work, out = WORK / slug, OUT / slug
    work.mkdir(parents=True, exist_ok=True)
    out.mkdir(parents=True, exist_ok=True)
    return slug, work, out


# --------------------------------------------------------------------------- #
# commands
# --------------------------------------------------------------------------- #
def cmd_analyze(args) -> int:
    audio = Path(args.audio)
    _p(f"Анализ: {audio.name}")
    t0 = time.time()
    a = an.analyze(audio, verbose=True)
    _p(f"  длительность : {a.duration:.1f} с")
    _p(f"  темп         : {a.bpm:.1f} BPM  ({len(a.beats)} битов, {len(a.downbeats)} тактов)")
    _p(f"  вокал        : {100 * a.vocal_active.mean():.0f}% времени")
    phrases = an.vocal_phrases(a)
    _p(f"  вокальных фраз: {len(phrases)}")
    _p(f"  (за {time.time() - t0:.1f} с)")
    _p()
    _p("Лучшие фрагменты:")
    for i, s in enumerate(hooks.find_hooks(a, target=args.length, count=args.count), 1):
        _p(f"  {i}. {s}")
    return 0


def cmd_hooks(args) -> int:
    a = an.analyze(Path(args.audio), verbose=True)
    segs = hooks.find_hooks(a, target=args.length, count=args.count)
    if args.json:
        print(json.dumps([{"start": s.start, "end": s.end, "score": s.score} for s in segs],
                         ensure_ascii=False, indent=1))
    else:
        for i, s in enumerate(segs, 1):
            _p(f"{i}. {s}")
    return 0


def cmd_transcribe(args) -> int:
    from . import transcribe as tr
    audio = Path(args.audio)
    slug, work, _ = _slug_and_dirs(audio, args.title)
    raw = tr.transcribe(audio, model_size=args.model, language=args.lang,
                        cache=work / f"whisper-{args.model}.json")
    out = Path(args.out) if args.out else work / "whisper-words.json"
    tr.save_words(raw, out)
    _p(f"Слова с таймкодами: {out} ({len(raw)} слов)")
    return 0


def cmd_align(args) -> int:
    audio = Path(args.audio)
    slug, work, _ = _slug_and_dirs(audio, args.title)
    a = an.analyze(audio, verbose=True)
    lyr = _get_lyrics(args, a, work)
    if lyr is None:
        _p("Нет ни текста, ни распознавания — выравнивать нечего.")
        return 1
    out = Path(args.out) if args.out else work / "timing.lrc"
    ly.write_lrc(lyr, out, title=args.title, artist=args.artist)
    _p(f"Готово: {out}")
    for l in lyr.lines[:6]:
        _p(f"  [{l.start:6.2f}–{l.end:6.2f}] {l.text}")
    return 0


def cmd_templates(args) -> int:
    _p("Доступные шаблоны:")
    for name, desc in pj.TEMPLATES.items():
        _p(f"  {name:<12} — {desc}")
    _p()
    _p("Стили субтитров: " + ", ".join(pj.CAPTION_STYLES))
    return 0


def cmd_reels(args) -> int:
    audio = Path(args.audio)
    if not audio.exists():
        _p(f"Файл не найден: {audio}")
        return 1
    title = args.title or audio.stem
    artist = args.artist or "—"
    slug, work, out_dir = _slug_and_dirs(audio, title)

    _p(f"=== {artist} — {title} ===")
    _p("1/5 Анализ трека…")
    a = an.analyze_cached(audio, work, verbose=True)

    _p("2/5 Обложка и палитра…")
    cover = _prepare_cover(audio, Path(args.cover) if args.cover else None, work)
    if getattr(args, "palette", None) and cover is not None:
        pass
    if cover is None and not getattr(args, "palette", None):
        _p("  обложки нет — графика пойдёт на цветах по умолчанию")
        palette = pal.Palette(colors=["#1b1033", "#ff4d6d"], bg="#0d0718", bg2="#1d1038",
                              accent="#ff4d6d", accent2="#38c7ff", text="#faf8f5", dark=True)
    elif getattr(args, "palette", None):
        palette = pal.load_preset(args.palette)
        _p(f"  палитра из пресета: {args.palette}")
    else:
        palette = pal.extract(cover)
        _p(f"  палитра: {palette.as_dict()['accent']} / {palette.as_dict()['accent2']} "
           f"(фон {palette.as_dict()['bg']})")

    _p("3/5 Текст и тайминг слов…")
    lyr = _get_lyrics(args, a, work)

    _p("4/5 Выбор фрагментов…")
    segs = hooks.find_hooks(a, target=args.length, count=max(args.count, 1))
    if lyr is not None:
        segs = [hooks.fit_segment_to_lines(s, lyr.spans()) for s in segs]
    for i, s in enumerate(segs, 1):
        _p(f"  {i}. {s}")

    templates = args.templates.split(",") if args.templates else None
    plans = pj.plan_clips(segs, templates, caption_style=args.captions, count=args.count)

    _p("5/5 Рендер…")
    results: list[dict] = []
    for plan in plans:
        props = pj.build_clip(
            a, lyr, palette, plan,
            audio_source=audio, cover_source=cover,
            logo_source=Path(args.logo) if getattr(args, "logo", None) else None,
            slug=slug,
            title=title, artist=artist,
            public_dir=PUBLIC, work_dir=work,
            fps=args.fps, intensity=args.intensity,
        )
        name = f"{slug}__{plan.template}__{plan.index:02d}"
        _p(f"  [{plan.index}/{len(plans)}] {plan.template}  "
           f"{plan.segment.start:.1f}–{plan.segment.end:.1f}s  -> {name}.mp4")
        if args.dry_run:
            results.append({"clip": name, "props": props.get("_json_path"), "rendered": False})
            continue
        try:
            silent = work / f"{name}.silent.mp4"
            rb.render(plan.template, props, silent, concurrency=args.concurrency)
            slice_wav = work / f"{name}.wav"
            ffmpeg_io.cut_audio(audio, slice_wav, plan.segment.start, plan.segment.duration)
            final = out_dir / f"{name}.mp4"
            ffmpeg_io.mux(silent, slice_wav, final)
            size = final.stat().st_size / 1e6
            _p(f"      готово: {final}  ({size:.1f} МБ)")
            results.append({"clip": name, "file": str(final), "rendered": True})
        except Exception as exc:
            _p(f"      ОШИБКА: {exc}")
            results.append({"clip": name, "error": str(exc), "rendered": False})

    report = out_dir / "report.json"
    report.write_text(json.dumps(
        {"track": {"title": title, "artist": artist, "slug": slug, "bpm": a.bpm},
         "palette": palette.as_dict(),
         "lyrics_source": lyr.source if lyr else "none",
         "clips": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = sum(1 for r in results if r.get("rendered"))
    _p()
    _p(f"Готово: {ok}/{len(results)} клипов в {out_dir}")
    _p(f"Отчёт: {report}")
    return 0 if ok or args.dry_run else 2


def cmd_render(args) -> int:
    props_path = Path(args.clip_json)
    props = json.loads(props_path.read_text(encoding="utf-8"))
    template = args.template or props["clip"]["template"]
    out = Path(args.out) if args.out else OUT / f"{props['track']['slug']}-{template}.mp4"
    silent = out.with_suffix(".silent.mp4")
    rb.render(template, props_path, silent, concurrency=args.concurrency)
    src = Path(args.audio) if args.audio else Path(props.get("debug", {}).get("audioSource", ""))
    if src.exists():
        wav = out.with_suffix(".wav")
        ffmpeg_io.cut_audio(src, wav, props["clip"]["sourceStart"], props["clip"]["duration"])
        ffmpeg_io.mux(silent, wav, out)
    else:
        shutil.move(str(silent), str(out))
        _p("  исходный трек не найден — видео без звука")
    _p(f"Готово: {out}")
    return 0


def cmd_check(args) -> int:
    from .check import check
    bad = 0
    for f in args.files:
        rep = check(f, min_len=args.min_len, max_len=args.max_len)
        _p(rep.text())
        bad += 0 if rep.passed else 1
    return 0 if bad == 0 else 2


def cmd_doctor(args) -> int:
    _p("Проверка окружения:")
    ok = True
    for tool in ("ffmpeg", "ffprobe", "node", "npx"):
        path = shutil.which(tool)
        _p(f"  {tool:<8} {'OK  ' + path if path else 'НЕТ'}")
        ok &= bool(path)
    try:
        import numpy, PIL  # noqa: F401
        _p("  numpy    OK")
        _p("  Pillow   OK")
    except Exception as exc:
        _p(f"  numpy/Pillow НЕТ ({exc})")
        ok = False
    try:
        import faster_whisper  # noqa: F401
        _p("  faster-whisper OK")
    except Exception:
        _p("  faster-whisper НЕТ  (pip install faster-whisper) — тайминг будет по вокальным фразам")
    try:
        rb.ensure_installed()
        _p(f"  remotion OK ({rb.REMOTION_DIR})")
    except Exception as exc:
        _p(f"  remotion НЕТ ({exc})")
        ok = False
    b = rb.find_browser()
    _p(f"  chromium {'OK  ' + b if b else 'НЕТ (нужен для рендера Remotion)'}")
    return 0 if ok else 1


# --------------------------------------------------------------------------- #
def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(
        prog="ytclip",
        description="Треки → вертикальные клипы с караоке-субтитрами (см. rules.md)",
    )
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add_common(p):
        p.add_argument("--title", help="название трека")
        p.add_argument("--artist", help="название группы")
        p.add_argument("--model", default="small",
                       help="модель Whisper: tiny/base/small/medium/large-v3 (по умолчанию small)")
        p.add_argument("--lang", default=None, help="язык, например ru (по умолчанию авто)")
        p.add_argument("--no-whisper", action="store_true",
                       help="не использовать Whisper, выравнивать по вокальным фразам")
        p.add_argument("--offset", type=float, default=0.0,
                       help="сдвиг субтитров в секундах (минус = раньше)")

    p = sub.add_parser("analyze", help="темп, биты, вокал и лучшие фрагменты")
    p.add_argument("audio")
    p.add_argument("--length", type=float, default=22.0)
    p.add_argument("--count", type=int, default=4)
    p.set_defaults(func=cmd_analyze)

    p = sub.add_parser("hooks", help="только список лучших фрагментов")
    p.add_argument("audio")
    p.add_argument("--length", type=float, default=22.0)
    p.add_argument("--count", type=int, default=4)
    p.add_argument("--json", action="store_true")
    p.set_defaults(func=cmd_hooks)

    p = sub.add_parser("transcribe", help="Whisper: слова с таймкодами")
    p.add_argument("audio")
    p.add_argument("--out")
    add_common(p)
    p.set_defaults(func=cmd_transcribe)

    p = sub.add_parser("align", help="свести текст с музыкой и выдать .lrc")
    p.add_argument("audio")
    p.add_argument("--lyrics", required=False, help="файл с текстом (.txt/.lrc/.srt)")
    p.add_argument("--out")
    add_common(p)
    p.set_defaults(func=cmd_align)

    p = sub.add_parser("reels", help="полный конвейер: трек -> несколько клипов")
    p.add_argument("audio")
    p.add_argument("--cover", help="обложка альбома (jpg/png)")
    p.add_argument("--lyrics", help="файл с текстом (.txt/.lrc/.srt)")
    p.add_argument("--count", type=int, default=4, help="сколько клипов (по умолчанию 4)")
    p.add_argument("--length", type=float, default=22.0, help="длина клипа в секундах")
    p.add_argument("--templates", help="список шаблонов через запятую")
    p.add_argument("--captions", default="word-pop", choices=list(pj.CAPTION_STYLES))
    p.add_argument("--fps", type=int, default=30)
    p.add_argument("--intensity", type=float, default=1.0, help="сила эффектов 0..1.5")
    p.add_argument("--palette", help="JSON с палитрой вместо авто-подбора, напр. assets/brand/th3rd.json")
    p.add_argument("--logo", help="файл логотипа (png с прозрачностью)")
    p.add_argument("--concurrency", type=int, default=None)
    p.add_argument("--dry-run", action="store_true", help="только подготовить clip.json")
    add_common(p)
    p.set_defaults(func=cmd_reels)

    p = sub.add_parser("render", help="отрендерить один готовый clip.json")
    p.add_argument("clip_json")
    p.add_argument("--template")
    p.add_argument("--audio")
    p.add_argument("--out")
    p.add_argument("--concurrency", type=int, default=None)
    p.set_defaults(func=cmd_render)

    p = sub.add_parser("templates", help="список шаблонов")
    p.set_defaults(func=cmd_templates)

    p = sub.add_parser("check", help="проверить готовый клип по чек-листу")
    p.add_argument("files", nargs="+")
    p.add_argument("--min-len", type=float, default=10.0)
    p.add_argument("--max-len", type=float, default=60.0)
    p.set_defaults(func=cmd_check)

    p = sub.add_parser("doctor", help="проверить окружение")
    p.set_defaults(func=cmd_doctor)
    return ap


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return int(args.func(args) or 0)
    except KeyboardInterrupt:
        _p("\nПрервано.")
        return 130
    except Exception as exc:
        _p(f"Ошибка: {exc}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
