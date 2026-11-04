/**
 * Hand-drawn doodles in the band's blue marker: little people and objects from
 * the world of the sleeve. They draw themselves on, then "boil" like cel
 * animation, so the frame always feels made by hand.
 *
 * Every drawing lives in a 100x100 viewBox so it can be placed at any size.
 */
import React from "react";
import { BRAND } from "./brand";

export type Stroke = { d: string; w?: number };
export type DoodleDef = { strokes: Stroke[]; name: string };

const circle = (cx: number, cy: number, r: number) =>
  `M ${cx - r} ${cy} a ${r} ${r} 0 1 1 ${r * 2} 0 a ${r} ${r} 0 1 1 ${-r * 2} 0`;

/** two silhouettes on a bench — the pair circled on the sleeve */
export const TWO_ON_BENCH: DoodleDef = {
  name: "двое на лавке",
  strokes: [
    { d: "M 8 70 L 92 70" },                       // seat
    { d: "M 12 60 L 88 60" },                      // backrest
    { d: "M 24 70 L 24 90 M 76 70 L 76 90" },      // legs
    { d: circle(38, 38, 7) },                      // head A
    { d: "M 38 45 L 38 64" },
    { d: "M 38 50 L 29 58 M 38 50 L 47 56" },
    { d: "M 38 64 L 32 84 M 38 64 L 44 84" },
    { d: circle(60, 36, 7) },                      // head B
    { d: "M 60 43 L 60 64" },
    { d: "M 60 48 L 51 56 M 60 48 L 69 55" },
    { d: "M 60 64 L 55 84 M 60 64 L 66 84" },
  ],
};

/** the entrance door with its lamp — подъезд №3 */
export const DOORWAY: DoodleDef = {
  name: "подъезд",
  strokes: [
    { d: "M 28 34 L 28 92 L 72 92 L 72 34 Z" },
    { d: "M 50 34 L 50 92" },
    { d: "M 40 62 L 44 62 M 56 62 L 60 62" },      // handles
    { d: "M 34 18 L 66 18 L 60 30 L 40 30 Z" },    // canopy
    { d: circle(50, 26, 4) },                      // lamp
    { d: "M 50 10 L 50 16 M 38 14 L 42 19 M 62 14 L 58 19" }, // light rays
    { d: "M 78 72 L 86 72 L 86 80 L 78 80 Z" },    // the "3" plate
    { d: "M 80 74 Q 85 74 83 77 Q 85 77 83 79 L 80 79" },
  ],
};

/** the stair line lifted straight from the logo */
export const STAIRS: DoodleDef = {
  name: "ступени",
  strokes: [
    { d: "M 6 82 L 34 82 L 34 64 L 62 64 L 62 46 L 90 46" },
    { d: "M 6 88 L 34 88 M 34 70 L 62 70 M 62 52 L 90 52", w: 2 },
  ],
};

/** a yard cat */
export const CAT: DoodleDef = {
  name: "кот",
  strokes: [
    { d: "M 34 84 Q 30 58 46 54 Q 62 50 62 84" },  // body
    { d: circle(50, 42, 12) },                     // head
    { d: "M 40 33 L 36 22 L 47 29 M 60 33 L 64 22 L 53 29" }, // ears
    { d: "M 45 41 L 45 44 M 55 41 L 55 44" },      // eyes
    { d: "M 48 47 L 52 47 M 50 47 L 50 50" },      // nose
    { d: "M 62 80 Q 80 78 76 60" },                // tail
  ],
};

/** a lit window, the one glowing on the sleeve */
export const WINDOW: DoodleDef = {
  name: "окно",
  strokes: [
    { d: "M 26 22 L 74 22 L 74 78 L 26 78 Z" },
    { d: "M 50 22 L 50 78 M 26 50 L 74 50" },
    { d: "M 20 84 L 80 84", w: 3 },
    { d: "M 74 30 L 92 18 M 74 50 L 94 44 M 74 70 L 92 80", w: 2 }, // light
  ],
};

/** a cigarette with smoke — the classic stairwell prop */
export const CIGARETTE: DoodleDef = {
  name: "сигарета",
  strokes: [
    { d: "M 20 78 L 58 60" },
    { d: "M 52 63 L 58 60 L 60 65 L 54 68 Z" },
    { d: "M 60 56 Q 70 48 62 40 Q 54 32 64 22 Q 72 14 66 8", w: 2.4 },
  ],
};

/** a heart, drawn fast */
export const HEART: DoodleDef = {
  name: "сердце",
  strokes: [
    { d: "M 50 84 C 18 62 18 32 36 28 C 45 26 50 36 50 42 C 50 36 55 26 64 28 C 82 32 82 62 50 84 Z" },
  ],
};

/** a crossed-out heart, for the lines that need it */
export const HEART_CROSSED: DoodleDef = {
  name: "перечёркнутое сердце",
  strokes: [
    ...HEART.strokes,
    { d: "M 20 20 L 82 88", w: 4.5 },
  ],
};

/** a moon over the block */
export const MOON: DoodleDef = {
  name: "луна",
  strokes: [
    { d: "M 64 18 A 34 34 0 1 0 64 82 A 26 26 0 1 1 64 18 Z" },
    { d: "M 16 16 L 16 24 M 12 20 L 20 20", w: 2 },
    { d: "M 84 70 L 84 76 M 81 73 L 87 73", w: 2 },
  ],
};

/** a phone with an unanswered message */
export const PHONE: DoodleDef = {
  name: "телефон",
  strokes: [
    { d: "M 34 14 L 66 14 L 66 86 L 34 86 Z" },
    { d: "M 44 20 L 56 20", w: 2 },
    { d: circle(50, 80, 3) },
    { d: "M 40 36 L 60 36 M 40 46 L 56 46", w: 2.6 },
    { d: "M 68 28 Q 86 26 86 38 Q 86 48 74 48 L 70 54 L 70 48 Q 68 46 68 40 Z" },
  ],
};

/** a bus stop sign — leaving the block */
export const BUS_STOP: DoodleDef = {
  name: "остановка",
  strokes: [
    { d: "M 50 90 L 50 28", w: 4 },
    { d: "M 24 14 L 76 14 L 76 34 L 24 34 Z" },
    { d: "M 32 22 L 60 22 M 32 28 L 52 28", w: 2.2 },
    { d: "M 40 90 L 60 90", w: 3 },
  ],
};

export const DOODLES: DoodleDef[] = [
  TWO_ON_BENCH, DOORWAY, STAIRS, CAT, WINDOW, CIGARETTE, HEART, MOON, PHONE, BUS_STOP,
];

export const byName = (name: string): DoodleDef =>
  DOODLES.find((d) => d.name === name) ?? TWO_ON_BENCH;

/** Rough path length — good enough to drive a dash-offset reveal. */
const pathLength = (d: string): number => {
  const nums = d.match(/-?\d+(\.\d+)?/g)?.map(Number) ?? [];
  let len = 0;
  for (let i = 2; i < nums.length; i += 2) {
    len += Math.hypot(nums[i] - nums[i - 2], nums[i + 1] - nums[i - 1]) || 0;
  }
  return Math.max(len * 1.4, 40);
};

/**
 * Draws a doodle. `progress` 0..1 runs the pen across the strokes in order;
 * `boil` adds the small per-frame wobble of hand-drawn animation.
 */
export const Doodle: React.FC<{
  def: DoodleDef;
  progress: number;
  size: number;
  x: number;
  y: number;
  color?: string;
  strokeWidth?: number;
  rotate?: number;
  boilFrame?: number;
  opacity?: number;
}> = ({
  def, progress, size, x, y,
  color = BRAND.marker, strokeWidth = 3.2, rotate = 0, boilFrame = 0, opacity = 1,
}) => {
  const n = def.strokes.length;
  const p = Math.max(0, Math.min(1, progress));
  // cel-animation boil: the whole drawing shifts a hair every few frames
  const b = Math.floor(boilFrame / 3);
  const jx = ((Math.sin(b * 12.9898) * 43758.5453) % 1) * 1.4;
  const jy = ((Math.sin(b * 78.233) * 12345.678) % 1) * 1.4;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      style={{
        position: "absolute",
        left: x,
        top: y,
        overflow: "visible",
        transform: `translate(-50%, -50%) rotate(${rotate}deg) translate(${jx.toFixed(2)}px, ${jy.toFixed(2)}px)`,
        opacity,
      }}
    >
      {def.strokes.map((s, i) => {
        const share = 1 / n;
        const local = Math.max(0, Math.min(1, (p - i * share) / share));
        const len = pathLength(s.d);
        return (
          <path
            key={i}
            d={s.d}
            fill="none"
            stroke={color}
            strokeWidth={s.w ?? strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={len}
            strokeDashoffset={len * (1 - local)}
          />
        );
      })}
    </svg>
  );
};
