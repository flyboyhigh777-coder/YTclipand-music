/**
 * th3rd. visual language, read off the album artwork.
 * The logo and the cover are used as supplied — never redrawn (rules.md §4.0).
 */

export const BRAND = {
  paper: "#E2DED5",      // warm off-white stock, sampled from the sleeve
  paperDeep: "#D4CFC3",  // shaded paper
  ink: "#1A1A1E",        // near-black type
  inkSoft: "#4A4A52",
  marker: "#3A4079",     // blue handwriting, sampled from the sleeve
  red: "#B33E2D",        // the dot in the logo, the circled accent
  tape: "rgba(205, 193, 164, 0.55)",
  tapeEdge: "rgba(188, 175, 143, 0.42)",
  photoFrame: "#FBFAF6", // polaroid border
} as const;

export const FONT_DISPLAY =
  "'Inter Display', 'Inter', 'Helvetica Neue', 'DejaVu Sans', sans-serif";
export const FONT_MONO =
  "'JetBrains Mono', 'IBM Plex Mono', 'DejaVu Sans Mono', monospace";
export const FONT_HAND = "'Caveat', 'Inter', cursive";

/** Deterministic wobble so hand-drawn things differ but never flicker. */
export const wobble = (seed: number, amp = 1): number => {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * amp;
};

/** Slight handheld camera drift — the whole frame breathes. */
export const handheld = (t: number, amount = 1) => ({
  x: (Math.sin(t * 0.7) * 3 + Math.sin(t * 1.9 + 1.2) * 1.6) * amount,
  y: (Math.cos(t * 0.55) * 2.6 + Math.sin(t * 2.3) * 1.1) * amount,
  r: (Math.sin(t * 0.42 + 0.6) * 0.22) * amount,
});

/** An irregular closed ellipse path — a circle drawn by hand, not by a compass. */
export const handEllipsePath = (
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  seed = 1,
  points = 14
): string => {
  const pts: [number, number][] = [];
  for (let i = 0; i < points; i++) {
    const a = (i / points) * Math.PI * 2 - Math.PI / 2;
    const jitterR = 1 + wobble(seed * 7 + i, 0.055);
    pts.push([cx + Math.cos(a) * rx * jitterR, cy + Math.sin(a) * ry * jitterR]);
  }
  // close the loop slightly past the start, the way a real pen overshoots
  let d = `M ${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
  for (let i = 1; i <= points + 1; i++) {
    const p = pts[i % points];
    const prev = pts[(i - 1) % points];
    const mx = (prev[0] + p[0]) / 2;
    const my = (prev[1] + p[1]) / 2;
    d += ` Q ${prev[0].toFixed(1)} ${prev[1].toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  return d;
};

/** A curved arrow like the one on the sleeve. */
export const handArrowPath = (
  x1: number, y1: number, x2: number, y2: number, bend = 0.3, seed = 2
): string => {
  const mx = (x1 + x2) / 2 + (y2 - y1) * bend + wobble(seed, 6);
  const my = (y1 + y2) / 2 - (x2 - x1) * bend + wobble(seed + 1, 6);
  return `M ${x1} ${y1} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${x2} ${y2}`;
};

export const arrowHead = (x: number, y: number, angle: number, size = 26): string => {
  const a1 = angle + 2.5;
  const a2 = angle - 2.5;
  return `M ${x} ${y} L ${(x + Math.cos(a1) * size).toFixed(1)} ${(y + Math.sin(a1) * size).toFixed(1)} M ${x} ${y} L ${(x + Math.cos(a2) * size).toFixed(1)} ${(y + Math.sin(a2) * size).toFixed(1)}`;
};
