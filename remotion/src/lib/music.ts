/** Helpers that turn the analysis data in clip.json into animation values. */
import type { ClipProps, Curves } from "../schema";

export const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Sample an analysis curve at a frame (curves are stored at clip fps). */
export const curveAt = (curve: number[], frame: number): number => {
  if (!curve || curve.length === 0) return 0;
  return curve[clamp(Math.round(frame), 0, curve.length - 1)];
};

/** Smoothed sample — avoids jitter on fast-moving curves. */
export const curveSmooth = (curve: number[], frame: number, width = 3): number => {
  if (!curve || curve.length === 0) return 0;
  let sum = 0;
  let n = 0;
  for (let i = -width; i <= width; i++) {
    const idx = clamp(Math.round(frame) + i, 0, curve.length - 1);
    sum += curve[idx];
    n++;
  }
  return sum / n;
};

/** 1 exactly on a beat, decaying exponentially until the next one. */
export const beatPulse = (beats: number[], t: number, decay = 7): number => {
  if (!beats || beats.length === 0) return 0;
  let last = -Infinity;
  for (let i = 0; i < beats.length; i++) {
    if (beats[i] <= t) last = beats[i];
    else break;
  }
  if (!isFinite(last)) return 0;
  return Math.exp(-decay * (t - last));
};

/** 0 → 1 across the current beat interval. */
export const beatPhase = (beats: number[], t: number, bpm: number): number => {
  if (!beats || beats.length < 2) return (t * bpm) / 60 % 1;
  let i = 0;
  while (i < beats.length - 1 && beats[i + 1] <= t) i++;
  const period = (beats[i + 1] ?? beats[i] + 60 / bpm) - beats[i];
  return clamp((t - beats[i]) / (period || 0.5), 0, 1);
};

/** Which bar we are in (used to cut scenes on musical boundaries). */
export const barIndex = (downbeats: number[], t: number): number => {
  if (!downbeats || downbeats.length === 0) return 0;
  let n = 0;
  for (const d of downbeats) if (d <= t) n++;
  return Math.max(0, n - 1);
};

/** Time of the bar start we are currently inside. */
export const barStart = (downbeats: number[], t: number): number => {
  let last = downbeats?.[0] ?? 0;
  for (const d of downbeats ?? []) if (d <= t) last = d;
  return last;
};

/** Convenience bundle for templates. */
export type MusicState = {
  t: number;
  rms: number;
  low: number;
  mid: number;
  high: number;
  vocal: number;
  kick: number;      // sharp pulse on beats, weighted by bass energy
  pulse: number;     // plain beat pulse
  phase: number;     // position within the beat
  bar: number;
  barT: number;      // seconds since the current bar started
};

export const musicState = (
  props: ClipProps,
  frame: number,
  fps: number
): MusicState => {
  const t = frame / fps;
  const c: Curves = props.curves;
  const pulse = beatPulse(props.music.beats, t, 7);
  const low = curveSmooth(c.low, frame, 2);
  return {
    t,
    rms: curveSmooth(c.rms, frame, 3),
    low,
    mid: curveSmooth(c.mid, frame, 3),
    high: curveSmooth(c.high, frame, 2),
    vocal: curveSmooth(c.vocal, frame, 2),
    kick: pulse * (0.45 + 0.55 * low),
    pulse,
    phase: beatPhase(props.music.beats, t, props.music.bpm),
    bar: barIndex(props.music.downbeats, t),
    barT: t - barStart(props.music.downbeats, t),
  };
};

/** Fade helper for clip head/tail (rules.md §3.5 — no dead air at the start). */
export const edgeFade = (frame: number, total: number, fps: number): number => {
  const inF = Math.round(fps * 0.25);
  const outF = Math.round(fps * 0.35);
  const a = clamp(frame / Math.max(inF, 1), 0, 1);
  const b = clamp((total - frame) / Math.max(outF, 1), 0, 1);
  return Math.min(a, b);
};

export const hexToRgb = (hex: string): [number, number, number] => {
  const h = hex.replace("#", "");
  const s = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
  ];
};

export const rgba = (hex: string, alpha: number): string => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const mixHex = (a: string, b: string, k: number): string => {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * clamp(k, 0, 1));
  return `rgb(${m(r1, r2)}, ${m(g1, g2)}, ${m(b1, b2)})`;
};

export const luma = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

/** Readable caption colour against a given backdrop (rules.md §4.3). */
export const readableOn = (bg: string): string =>
  luma(bg) > 0.55 ? "#12101a" : "#fdfbf7";
