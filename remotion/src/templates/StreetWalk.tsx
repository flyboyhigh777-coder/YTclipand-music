/**
 * street-walk — a side-scrolling cartoon: someone walks, the city slides past
 * in parallax layers, and the steps land on the beat.
 */
import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import type { ClipProps } from "../schema";
import { FONT_MONO } from "../lib/brand";
import { PaperCaptions } from "../lib/PaperCaptions";
import { Cat, GlowPool, Lamppost, NIGHT, NIGHT_DIM, NIGHT_INK, Person, WindowGrid } from "../lib/Cartoon";
import { Grain, Vignette } from "../lib/Layers";
import { edgeFade, musicState, rgba } from "../lib/music";

/** Repeat a drawing across the frame at a given spacing and offset. */
const repeated = (
  spacing: number,
  offset: number,
  width: number,
  margin = 1
): number[] => {
  const out: number[] = [];
  const first = -((offset % spacing) + spacing) % spacing;
  for (let x = first - spacing * margin; x < width + spacing * margin; x += spacing) {
    out.push(x);
  }
  return out;
};

export const StreetWalk: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const k = props.style.intensity;
  const fade = edgeFade(frame, durationInFrames, fps);

  const ground = height * 0.76;
  const accent = props.palette.accent;

  // walking speed is derived from the tempo: one stride every two beats,
  // and the world moves by one stride length each time
  const stride = (m.t * props.music.bpm) / 60 / 2;
  const strideLength = width * 0.34;
  const travel = stride * strideLength;

  const personH = height * 0.27;

  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT.sky }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${NIGHT.sky} 0%, ${NIGHT.skyLow} 58%, #241F27 100%)`,
        }}
      />

      {/* moon stays put; everything else slides */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path
          d={`M ${width * 0.78} ${height * 0.13} a 40 40 0 1 0 0 62 a 30 30 0 1 1 0 -62 Z`}
          fill="none"
          stroke={accent}
          strokeWidth={3}
          opacity={0.8}
        />
      </svg>

      {/* far skyline: slowest */}
      {repeated(width * 0.62, travel * 0.18, width).map((x, i) => (
        <WindowGrid
          key={`far-${i}`}
          x={x}
          y={height * 0.34}
          width={width * 0.5}
          height={height * 0.42}
          cols={3}
          rows={5}
          energy={m.rms * 0.5 * k}
          seed={11 + i}
          color={NIGHT_DIM}
          strokeWidth={2}
          opacity={0.45}
        />
      ))}

      {/* mid blocks */}
      {repeated(width * 0.78, travel * 0.45, width).map((x, i) => (
        <WindowGrid
          key={`mid-${i}`}
          x={x}
          y={height * 0.44}
          width={width * 0.44}
          height={height * 0.32}
          cols={3}
          rows={3}
          energy={m.low * k}
          seed={31 + i}
          color={NIGHT_DIM}
          strokeWidth={2.4}
          opacity={0.8}
        />
      ))}

      {/* ground line */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path d={`M 0 ${ground} L ${width} ${ground}`} stroke={NIGHT_INK} strokeWidth={3} opacity={0.6} />
        {repeated(width * 0.09, travel, width).map((x, i) => (
          <path
            key={`dash-${i}`}
            d={`M ${x} ${ground + height * 0.045} L ${x + width * 0.045} ${ground + height * 0.045}`}
            stroke={NIGHT_INK}
            strokeWidth={3}
            opacity={0.22}
          />
        ))}
      </svg>

      {/* lampposts: fastest layer, each with its own pool of light */}
      {repeated(width * 0.72, travel * 0.95 + width * 0.36, width).map((x, i) => (
        <Lamppost
          key={`lamp-${i}`}
          x={x}
          y={ground}
          height={height * 0.3}
          glow={0.5 + 0.7 * m.kick * k}
        />
      ))}

      <GlowPool x={width * 0.36} y={ground} radius={width * 0.26} strength={0.25 + 0.35 * m.rms} />

      {/* the walker stays in frame; the world moves instead */}
      <Person
        x={width * 0.34}
        y={ground + personH * 0.03}
        height={personH}
        phase={stride}
        pose="walk"
        facing={1}
        color={NIGHT_INK}
        strokeWidth={2.1}
      />

      {/* a cat trotting a little behind */}
      <Cat
        x={width * 0.14}
        y={ground + height * 0.02}
        height={height * 0.07}
        phase={stride * 1.7}
        facing={1}
        color={NIGHT_INK}
        strokeWidth={2.6}
        opacity={0.85}
      />

      <div
        style={{
          position: "absolute",
          left: 0, right: 0, top: props.captions.safeTop - 96,
          textAlign: "center",
          fontFamily: FONT_MONO, fontSize: 25, letterSpacing: "0.26em",
          textTransform: "uppercase", color: NIGHT_INK, opacity: 0.45,
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
        baseSize={58}
      />

      <div
        style={{
          position: "absolute",
          left: 72, right: 72, bottom: props.captions.safeBottom - 150,
          display: "flex", justifyContent: "space-between",
          fontFamily: FONT_MONO, fontSize: 23, letterSpacing: "0.16em",
          textTransform: "uppercase", color: rgba(NIGHT_INK, 0.5),
        }}
      >
        <span>the third stairwell</span>
        <span>{props.track.artist}</span>
      </div>

      <Vignette strength={0.6} color="#000000" />
      <Grain frame={frame} opacity={0.09} />
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
