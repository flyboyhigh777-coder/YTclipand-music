/**
 * Captions in the th3rd. language: typewriter text on torn paper, the sung word
 * in sleeve red. Same timing contract as the neon captions (rules.md §2.3).
 */
import React from "react";
import { interpolate, spring } from "remotion";
import type { LyricLine, Word } from "../schema";
import { BRAND, FONT_HAND, FONT_MONO, wobble } from "./brand";
import { TornStrip } from "./Paper";

type Style = "word-pop" | "line-karaoke" | "line-fill";

const visibleLine = (lines: LyricLine[], t: number): LyricLine | null => {
  let best: LyricLine | null = null;
  for (const l of lines) if (t >= l.start - 0.25 && t <= l.end + 0.35) best = l;
  if (best) return best;
  for (const l of lines) if (l.start - t > 0 && l.start - t < 0.4) return l;
  return null;
};

const currentGroup = (line: LyricLine, t: number) => {
  const groups = line.groups?.length
    ? line.groups
    : [{ text: line.text, start: line.start, end: line.end, words: line.words }];
  let best = groups[0];
  for (const g of groups) if (t >= g.start - 0.12) best = g;
  return best;
};

const sizeFor = (text: string, width: number, base: number) =>
  Math.min(base, Math.max(base * 0.45, (width - 260) / Math.max(text.length * 0.62, 1)));

const WordSpan: React.FC<{ w: Word; t: number; size: number; hand?: boolean }> = ({
  w, t, size, hand,
}) => {
  const live = t >= w.start - 0.02;
  const pop = live ? 1 + 0.06 * Math.exp(-9 * Math.max(0, t - w.start)) : 1;
  return (
    <span
      style={{
        display: "inline-block",
        transform: `scale(${pop})`,
        color: live ? BRAND.red : BRAND.ink,
        opacity: live ? 1 : 0.42,
        fontWeight: hand ? 700 : 500,
      }}
    >
      {w.text}
    </span>
  );
};

export const PaperCaptions: React.FC<{
  lines: LyricLine[];
  style: Style;
  frame: number;
  fps: number;
  width: number;
  bottom: number;         // distance from the bottom of the frame
  baseSize?: number;
  hand?: boolean;         // handwritten instead of typewriter
  maxWidth?: number;
}> = ({ lines, style, frame, fps, width, bottom, baseSize = 56, hand = false, maxWidth }) => {
  const t = frame / fps;
  const line = visibleLine(lines, t);
  if (!line) return null;

  const isGroup = style === "word-pop";
  const block = isGroup ? currentGroup(line, t) : line;
  if (!block) return null;

  const appear = spring({
    frame: frame - Math.round(block.start * fps),
    fps,
    config: { damping: 16, mass: 0.4, stiffness: 170 },
    durationInFrames: Math.round(fps * 0.35),
  });
  const out = interpolate(t, [line.end + 0.1, line.end + 0.32], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const size = sizeFor(block.text, maxWidth ?? width, hand ? baseSize * 1.5 : baseSize);
  const rot = wobble(Math.round(block.start * 7), 1.4);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom,
        display: "flex",
        justifyContent: "center",
        opacity: Math.min(appear, out),
        transform: `translateY(${(1 - appear) * 16}px)`,
      }}
    >
      <TornStrip
        rotate={rot}
        padding={hand ? "10px 40px 18px" : "20px 42px"}
        style={{
          maxWidth: (maxWidth ?? width) - 120,
          backgroundColor: hand ? "transparent" : "#FCFBF7",
          boxShadow: hand ? "none" : "0 12px 30px rgba(60,52,38,.24)",
          clipPath: hand ? "none" : undefined,
        }}
      >
        <div
          style={{
            fontFamily: hand ? FONT_HAND : FONT_MONO,
            fontSize: size,
            lineHeight: hand ? 1.05 : 1.28,
            letterSpacing: hand ? "0" : "-0.01em",
            display: "flex",
            flexWrap: "wrap",
            gap: hand ? "0.06em 0.3em" : "0.04em 0.42em",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          {block.words.map((w, i) => (
            <WordSpan key={`${w.text}-${i}`} w={w} t={t} size={size} hand={hand} />
          ))}
        </div>
      </TornStrip>
    </div>
  );
};
