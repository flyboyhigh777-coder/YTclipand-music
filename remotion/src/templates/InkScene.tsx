/**
 * ink-scene — a drawing that builds itself while the song plays.
 *
 * No artwork is used. Elements of a yard scene — the entrance, the bench with
 * two figures, the moon, a lit window, a cat — are added one per bar, each
 * drawn stroke by stroke, so the frame is never static and never finished too
 * early. Abstract ink answers the bass underneath.
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ClipProps } from "../schema";
import { BRAND, FONT_MONO, handheld, wobble } from "../lib/brand";
import { Paper, SleeveFooter } from "../lib/Paper";
import { PaperCaptions } from "../lib/PaperCaptions";
import {
  Doodle, type DoodleDef,
  BENCH, BUS_STOP, CAT, CIGARETTE, DOORWAY, FACADE, HEART, LAMPPOST, MOON, PHONE,
  STAIRS, TWO_ON_BENCH, WINDOW,
} from "../lib/Doodles";
import { BeatRings, GroundLine, Skyline } from "../lib/Ink";
import { Grain, Vignette } from "../lib/Layers";
import { edgeFade, musicState } from "../lib/music";

type Placed = {
  def: DoodleDef;
  /** horizontal position, 0..1 of the frame */
  x: number;
  /** size, as a fraction of frame width */
  size: number;
  /** things that stand on the ground, versus things in the sky */
  anchor?: "ground" | "sky";
  /** vertical position for sky items, 0..1 of the frame */
  y?: number;
  rotate?: number;
  color?: string;
};

/**
 * Each scene is a little stage. Items marked "ground" stand on the horizon, so
 * the drawing reads as a place rather than as floating icons.
 */
const SCENES: { name: string; items: Placed[] }[] = [
  {
    name: "подъезд",
    items: [
      { def: DOORWAY, x: 0.50, size: 0.80, anchor: "ground" },
      { def: LAMPPOST, x: 0.89, size: 0.42, anchor: "ground", rotate: 1 },
      { def: CAT, x: 0.13, size: 0.17, anchor: "ground", rotate: -2 },
      { def: MOON, x: 0.17, y: 0.17, size: 0.13, anchor: "sky", color: BRAND.red },
    ],
  },
  {
    name: "двое",
    items: [
      { def: TWO_ON_BENCH, x: 0.52, size: 0.76, anchor: "ground" },
      { def: LAMPPOST, x: 0.11, size: 0.44, anchor: "ground", rotate: -1 },
      { def: MOON, x: 0.84, y: 0.17, size: 0.13, anchor: "sky" },
      { def: HEART, x: 0.80, y: 0.40, size: 0.12, anchor: "sky", color: BRAND.red },
    ],
  },
  {
    name: "дом",
    items: [
      { def: FACADE, x: 0.52, size: 0.92, anchor: "ground" },
      { def: BENCH, x: 0.15, size: 0.30, anchor: "ground", rotate: 1.5 },
      { def: CAT, x: 0.86, size: 0.16, anchor: "ground" },
      { def: MOON, x: 0.14, y: 0.15, size: 0.12, anchor: "sky", color: BRAND.red },
    ],
  },
  {
    name: "лестница",
    items: [
      { def: STAIRS, x: 0.50, y: 0.42, size: 0.84, anchor: "sky" },
      { def: WINDOW, x: 0.80, y: 0.20, size: 0.18, anchor: "sky" },
      { def: CIGARETTE, x: 0.20, y: 0.26, size: 0.17, anchor: "sky", color: BRAND.red },
      { def: CAT, x: 0.74, size: 0.16, anchor: "ground" },
    ],
  },
  {
    name: "ожидание",
    items: [
      { def: BUS_STOP, x: 0.32, size: 0.56, anchor: "ground" },
      { def: BENCH, x: 0.76, size: 0.32, anchor: "ground", rotate: -1 },
      { def: PHONE, x: 0.80, y: 0.30, size: 0.19, anchor: "sky", color: BRAND.red },
      { def: MOON, x: 0.16, y: 0.16, size: 0.12, anchor: "sky" },
    ],
  },
  {
    name: "окна",
    items: [
      { def: WINDOW, x: 0.27, y: 0.26, size: 0.28, anchor: "sky" },
      { def: WINDOW, x: 0.64, y: 0.23, size: 0.28, anchor: "sky", rotate: 1.5 },
      { def: WINDOW, x: 0.44, y: 0.49, size: 0.28, anchor: "sky", rotate: -1.5 },
      { def: CAT, x: 0.82, size: 0.16, anchor: "ground" },
      { def: MOON, x: 0.84, y: 0.16, size: 0.12, anchor: "sky", color: BRAND.red },
    ],
  },
];

/** small ink stars, scattered deterministically */
const STARS = Array.from({ length: 9 }).map((_, i) => ({
  x: 0.08 + ((i * 0.1734) % 0.84),
  y: 0.10 + ((i * 0.0917) % 0.34),
  s: 6 + (i % 3) * 3,
}));

export const InkScene: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const k = props.style.intensity;
  const fade = edgeFade(frame, durationInFrames, fps);
  const hh = handheld(m.t, 0.9);

  const scene = SCENES[(props.clip.index - 1 + SCENES.length) % SCENES.length];
  const bars = props.music.downbeats;
  const barLen = (props.music.beatsPerBar * 60) / Math.max(props.music.bpm, 1);

  /** element i starts on the i-th bar of the clip and draws over ~1.2 s */
  const startOf = (i: number): number => {
    const b = bars[i];
    return b !== undefined ? b : i * barLen;
  };

  const groundY = height * 0.70;

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.paper }}>
      <Paper />

      <AbsoluteFill
        style={{
          transform: `translate(${hh.x}px, ${hh.y}px) rotate(${hh.r * 0.4}deg) scale(${1 + 0.012 * m.kick * k})`,
        }}
      >
        {/* quiet rings under the drawing, so the page reacts to the bass */}
        <BeatRings
          beats={props.music.downbeats}
          t={m.t}
          cx={width * 0.5}
          cy={groundY}
          maxRadius={width * 0.42}
          life={1.8}
          color={BRAND.marker}
          strokeWidth={1.2 * k}
        />

        <Skyline
          y={groundY}
          width={width}
          progress={interpolate(m.t, [0.2, 1.6], [0, 1], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          })}
          color={BRAND.ink}
          opacity={0.16}
        />
        <GroundLine y={groundY} width={width} color={BRAND.ink} strokeWidth={4} />

        {/* stars come in first, before anything is drawn */}
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
          {STARS.map((st, i) => {
            const p = interpolate(m.t, [i * 0.12, i * 0.12 + 0.5], [0, 1], {
              extrapolateLeft: "clamp", extrapolateRight: "clamp",
            });
            const x = st.x * width;
            const y = st.y * height;
            return (
              <g key={i} opacity={0.35 * p}>
                <line x1={x - st.s} y1={y} x2={x + st.s} y2={y} stroke={BRAND.ink} strokeWidth={2.2} strokeLinecap="round" />
                <line x1={x} y1={y - st.s} x2={x} y2={y + st.s} stroke={BRAND.ink} strokeWidth={2.2} strokeLinecap="round" />
              </g>
            );
          })}
        </svg>

        {scene.items.map((it, i) => {
          const t0 = startOf(i);
          const p = interpolate(m.t, [t0, t0 + 1.2], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          if (p <= 0) return null;
          const size = it.size * width;
          const onGround = (it.anchor ?? "ground") === "ground";
          return (
            <Doodle
              key={`${scene.name}-${i}`}
              def={it.def}
              progress={p}
              size={size}
              x={it.x * width}
              y={onGround ? groundY + size * 0.08 : (it.y ?? 0.3) * height}
              anchor={onGround ? "bottom" : "center"}
              rotate={(it.rotate ?? 0) + wobble(i * 9, 1.0)}
              color={it.color ?? BRAND.marker}
              strokeWidth={Math.max(2.4, 4.2 - it.size * 2.4)}
              boilFrame={frame}
              opacity={0.92}
            />
          );
        })}
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left: 0, right: 0, top: props.captions.safeTop - 96,
          textAlign: "center",
          fontFamily: FONT_MONO, fontSize: 26, letterSpacing: "0.26em",
          textTransform: "uppercase", color: BRAND.ink, opacity: 0.55,
        }}
      >
        {props.track.title}
      </div>

      <PaperCaptions
        lines={props.lyrics.lines}
        style={props.captions.style}
        frame={frame}
        fps={fps}
        width={width}
        bottom={props.captions.safeBottom + 20}
        baseSize={60}
      />
      <SleeveFooter
        logo={null}
        caption={props.track.artist}
        bottom={props.captions.safeBottom - 150}
      />
      <Grain frame={frame} opacity={0.08} />
      <Vignette strength={0.28} color="#4a4336" />
      <AbsoluteFill style={{ backgroundColor: BRAND.paper, opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
