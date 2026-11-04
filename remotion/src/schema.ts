/**
 * The clip.json contract (see rules.md §1 and ytclip/project.py).
 * Times are LOCAL to the clip and start at 0.
 */

export type Word = { text: string; start: number; end: number };

export type Group = {
  text: string;
  start: number;
  end: number;
  words: Word[];
};

export type LyricLine = {
  text: string;
  start: number;
  end: number;
  words: Word[];
  groups: Group[];
};

export type Palette = {
  colors: string[];
  bg: string;
  bg2: string;
  accent: string;
  accent2: string;
  text: string;
  dark: boolean;
};

export type Curves = {
  fps: number;
  rms: number[];
  low: number[];
  mid: number[];
  high: number[];
  vocal: number[];
  /** per-frame log-spaced spectrum, frames x bands (optional) */
  bands?: number[][];
};

export type ClipProps = {
  version: number;
  track: { title: string; artist: string; slug: string };
  clip: {
    index: number;
    template: string;
    sourceStart: number;
    sourceEnd: number;
    duration: number;
    frames: number;
    fps: number;
    width: number;
    height: number;
    reason?: string;
    score?: number;
  };
  cover: { file: string | null };
  audio?: { file: string | null };
  palette: Palette;
  music: { bpm: number; beats: number[]; downbeats: number[]; beatsPerBar: number };
  curves: Curves;
  lyrics: { source: string; lines: LyricLine[] };
  captions: {
    style: "word-pop" | "line-karaoke" | "line-fill";
    safeTop: number;
    safeBottom: number;
    safeRight: number;
  };
  style: { intensity: number };
};

/** Fallback props so every composition opens in Studio even with no JSON. */
export const demoProps: ClipProps = {
  version: 1,
  track: { title: "Демо-трек", artist: "Ваша группа", slug: "demo" },
  clip: {
    index: 1,
    template: "cover-pulse",
    sourceStart: 0,
    sourceEnd: 8,
    duration: 8,
    frames: 240,
    fps: 30,
    width: 1080,
    height: 1920,
  },
  cover: { file: null },
  audio: { file: null },
  palette: {
    colors: ["#1b1033", "#ff4d6d", "#38c7ff", "#ffd166"],
    bg: "#0d0718",
    bg2: "#1d1038",
    accent: "#ff4d6d",
    accent2: "#38c7ff",
    text: "#faf8f5",
    dark: true,
  },
  music: {
    bpm: 100,
    beats: Array.from({ length: 16 }, (_, i) => i * 0.6),
    downbeats: Array.from({ length: 4 }, (_, i) => i * 2.4),
    beatsPerBar: 4,
  },
  curves: {
    fps: 30,
    rms: Array.from({ length: 240 }, (_, i) => 0.5 + 0.4 * Math.sin(i / 9)),
    low: Array.from({ length: 240 }, (_, i) => 0.5 + 0.5 * Math.sin(i / 4.5)),
    mid: Array.from({ length: 240 }, (_, i) => 0.4 + 0.3 * Math.sin(i / 7)),
    high: Array.from({ length: 240 }, (_, i) => 0.3 + 0.3 * Math.sin(i / 3)),
    vocal: Array.from({ length: 240 }, (_, i) => (i % 90 < 60 ? 0.8 : 0.1)),
    bands: Array.from({ length: 240 }, (_, f) =>
      Array.from({ length: 24 }, (_, b) =>
        Math.max(0, 0.5 + 0.5 * Math.sin(f / 6 - b / 3) - b / 40)
      )
    ),
  },
  lyrics: {
    source: "demo",
    lines: [
      {
        text: "это демо строка для проверки",
        start: 0.4,
        end: 3.6,
        words: [
          { text: "это", start: 0.4, end: 0.9 },
          { text: "демо", start: 0.9, end: 1.5 },
          { text: "строка", start: 1.5, end: 2.2 },
          { text: "для", start: 2.2, end: 2.6 },
          { text: "проверки", start: 2.6, end: 3.6 },
        ],
        groups: [
          {
            text: "это демо",
            start: 0.4,
            end: 1.5,
            words: [
              { text: "это", start: 0.4, end: 0.9 },
              { text: "демо", start: 0.9, end: 1.5 },
            ],
          },
          {
            text: "строка для",
            start: 1.5,
            end: 2.6,
            words: [
              { text: "строка", start: 1.5, end: 2.2 },
              { text: "для", start: 2.2, end: 2.6 },
            ],
          },
          {
            text: "проверки",
            start: 2.6,
            end: 3.6,
            words: [{ text: "проверки", start: 2.6, end: 3.6 }],
          },
        ],
      },
      {
        text: "второй куплет идёт следом",
        start: 4.2,
        end: 7.6,
        words: [
          { text: "второй", start: 4.2, end: 5.0 },
          { text: "куплет", start: 5.0, end: 5.8 },
          { text: "идёт", start: 5.8, end: 6.5 },
          { text: "следом", start: 6.5, end: 7.6 },
        ],
        groups: [
          {
            text: "второй куплет",
            start: 4.2,
            end: 5.8,
            words: [
              { text: "второй", start: 4.2, end: 5.0 },
              { text: "куплет", start: 5.0, end: 5.8 },
            ],
          },
          {
            text: "идёт следом",
            start: 5.8,
            end: 7.6,
            words: [
              { text: "идёт", start: 5.8, end: 6.5 },
              { text: "следом", start: 6.5, end: 7.6 },
            ],
          },
        ],
      },
    ],
  },
  captions: { style: "word-pop", safeTop: 180, safeBottom: 320, safeRight: 140 },
  style: { intensity: 1 },
};
