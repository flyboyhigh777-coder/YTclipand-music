/**
 * Karaoke captions. A word lights up exactly when it is sung (rules.md §2.3).
 *
 * Three styles:
 *   word-pop      — 2–4 words at a time, the sung one pops and glows (TikTok look)
 *   line-karaoke  — the whole line is visible, colour sweeps across each word
 *   line-fill     — the whole line is visible, each word snaps to the accent colour
 */
import React from "react";
import { interpolate, spring } from "remotion";
import type { Group, LyricLine, Palette, Word } from "../schema";
import { clamp, rgba, readableOn } from "./music";

export const FONT_STACK =
  "'Inter Display', 'Inter', 'Helvetica Neue', 'DejaVu Sans', sans-serif";

export type CaptionProps = {
  lines: LyricLine[];
  style: "word-pop" | "line-karaoke" | "line-fill";
  frame: number;
  fps: number;
  palette: Palette;
  safeBottom: number;
  height: number;
  width: number;
  /** vertical anchor; defaults to the caption band from rules.md §3.3 */
  centerY?: number;
  baseSize?: number;
  uppercase?: boolean;
  onDark?: boolean;
};

const activeLine = (lines: LyricLine[], t: number): LyricLine | null => {
  let best: LyricLine | null = null;
  for (const l of lines) {
    if (t >= l.start - 0.2 && t <= l.end + 0.3) best = l;
  }
  if (best) return best;
  // a moment before the next line starts, show it already (reads better)
  for (const l of lines) {
    if (l.start - t > 0 && l.start - t < 0.35) return l;
  }
  return null;
};

const activeGroup = (line: LyricLine, t: number): Group | null => {
  const groups = line.groups?.length ? line.groups : [
    { text: line.text, start: line.start, end: line.end, words: line.words },
  ];
  let best: Group | null = null;
  for (const g of groups) {
    if (t >= g.start - 0.12) best = g;
  }
  return best ?? groups[0] ?? null;
};

/** Font size that keeps a line inside the frame without manual tuning. */
const fitSize = (text: string, width: number, base: number): number => {
  const usable = width - 150;
  const perChar = 0.52; // rough advance width for a heavy sans
  const needed = usable / Math.max(text.length * perChar, 1);
  return Math.min(base, Math.max(base * 0.42, needed));
};

const wordProgress = (w: Word, t: number): number =>
  clamp((t - w.start) / Math.max(w.end - w.start, 0.08), 0, 1);

export const Captions: React.FC<CaptionProps> = ({
  lines,
  style,
  frame,
  fps,
  palette,
  safeBottom,
  height,
  width,
  centerY,
  baseSize = 108,
  uppercase = false,
  onDark = true,
}) => {
  const t = frame / fps;
  const line = activeLine(lines, t);
  if (!line) return null;

  const textColor = onDark ? readableOn(palette.bg) : readableOn(palette.text);
  const y = centerY ?? height - safeBottom - 260;

  const shell: React.CSSProperties = {
    position: "absolute",
    left: 60,
    right: 60,
    top: y,
    display: "flex",
    flexWrap: "wrap",
    gap: "0.28em 0.32em",
    justifyContent: "center",
    alignItems: "center",
    fontFamily: FONT_STACK,
    fontWeight: 800,
    letterSpacing: "-0.015em",
    lineHeight: 1.06,
    textAlign: "center",
    textWrap: "balance" as never,
  };

  if (style === "word-pop") {
    const group = activeGroup(line, t);
    if (!group) return null;
    const appear = spring({
      frame: frame - Math.round(group.start * fps),
      fps,
      config: { damping: 14, mass: 0.5, stiffness: 150 },
      durationInFrames: Math.round(fps * 0.45),
    });
    const size = fitSize(group.text, width, baseSize * 1.25);
    return (
      <div
        style={{
          ...shell,
          fontSize: size,
          transform: `translateY(${(1 - appear) * 28}px) scale(${0.88 + 0.12 * appear})`,
          opacity: clamp(appear * 1.2, 0, 1),
        }}
      >
        {group.words.map((w, i) => {
          const live = t >= w.start - 0.02;
          const p = wordProgress(w, t);
          const pop = live ? 1 + 0.085 * Math.exp(-7 * Math.max(0, t - w.start)) : 1;
          return (
            <span
              key={`${w.text}-${i}`}
              style={{
                display: "inline-block",
                transform: `scale(${pop})`,
                color: live ? palette.accent : rgba(textColor, 0.55),
                textShadow: live
                  ? `0 0 ${26 + 18 * (1 - p)}px ${rgba(palette.accent, 0.55)}, 0 6px 22px rgba(0,0,0,.55)`
                  : "0 4px 16px rgba(0,0,0,.5)",
                WebkitTextStroke: live ? `0px transparent` : `0px transparent`,
                transition: "none",
              }}
            >
              {uppercase ? w.text.toUpperCase() : w.text}
            </span>
          );
        })}
      </div>
    );
  }

  const size = fitSize(line.text, width, baseSize * 0.82);
  const lineIn = interpolate(t, [line.start - 0.25, line.start + 0.08], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lineOut = interpolate(t, [line.end + 0.05, line.end + 0.3], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const opacity = Math.min(lineIn, lineOut);

  return (
    <div
      style={{
        ...shell,
        fontSize: size,
        opacity,
        transform: `translateY(${(1 - lineIn) * 18}px)`,
      }}
    >
      {line.words.map((w, i) => {
        const p = wordProgress(w, t);
        if (style === "line-karaoke") {
          // hard-stop gradient = colour sweeping left→right across the glyphs
          const pct = (p * 100).toFixed(1);
          return (
            <span
              key={`${w.text}-${i}`}
              style={{
                display: "inline-block",
                backgroundImage: `linear-gradient(90deg, ${palette.accent} ${pct}%, ${rgba(
                  textColor,
                  0.62
                )} ${pct}%)`,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                filter: p > 0 && p < 1 ? `drop-shadow(0 0 18px ${rgba(palette.accent, 0.5)})` : "none",
                textShadow: "none",
              }}
            >
              {uppercase ? w.text.toUpperCase() : w.text}
            </span>
          );
        }
        // line-fill
        const on = interpolate(t, [w.start - 0.03, w.start + 0.09], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={`${w.text}-${i}`}
            style={{
              display: "inline-block",
              color: on > 0.5 ? palette.accent : rgba(textColor, 0.6),
              transform: `translateY(${(1 - on) * 6}px)`,
              textShadow:
                on > 0.5
                  ? `0 0 22px ${rgba(palette.accent, 0.45)}, 0 5px 18px rgba(0,0,0,.5)`
                  : "0 4px 14px rgba(0,0,0,.45)",
            }}
          >
            {uppercase ? w.text.toUpperCase() : w.text}
          </span>
        );
      })}
    </div>
  );
};

/** Small always-on credit line: band — track. */
export const TrackTag: React.FC<{
  artist: string;
  title: string;
  color: string;
  top: number;
  accent: string;
}> = ({ artist, title, color, top, accent }) => (
  <div
    style={{
      position: "absolute",
      top,
      left: 0,
      right: 0,
      textAlign: "center",
      fontFamily: FONT_STACK,
      fontWeight: 600,
      fontSize: 30,
      letterSpacing: "0.14em",
      textTransform: "uppercase",
      color: rgba(color, 0.78),
    }}
  >
    <span style={{ color: accent }}>{artist}</span>
    <span style={{ opacity: 0.5 }}>{"  ·  "}</span>
    <span>{title}</span>
  </div>
);
