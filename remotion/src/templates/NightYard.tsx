/**
 * night-yard — a small cartoon. Someone walks into the yard, stops under the
 * lamp and smokes; a cat crosses in front; windows wake up with the bass.
 *
 * Dark palette, line drawing, everything generated from the track.
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ClipProps } from "../schema";
import { FONT_MONO } from "../lib/brand";
import { PaperCaptions } from "../lib/PaperCaptions";
import {
  Cat, GlowPool, Lamppost, NIGHT, NIGHT_DIM, NIGHT_INK, Person, Smoke, WindowGrid,
} from "../lib/Cartoon";
import { Grain, Vignette } from "../lib/Layers";
import { clamp, edgeFade, musicState, rgba } from "../lib/music";

const STARS = Array.from({ length: 22 }).map((_, i) => ({
  x: (Math.abs(Math.sin(i * 12.9898)) % 1),
  y: (Math.abs(Math.sin(i * 78.233)) % 1) * 0.42,
  r: 1.4 + (i % 3) * 0.9,
}));

export const NightYard: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const k = props.style.intensity;
  const fade = edgeFade(frame, durationInFrames, fps);
  const total = durationInFrames / fps;

  const ground = height * 0.78;
  const accent = props.palette.accent;

  // one stride every two beats, so the steps land on the music
  const stride = (m.t * props.music.bpm) / 60 / 2;

  // the walk: in from the right, stops under the lamp, then smokes
  const arriveAt = total * 0.42;
  const walking = m.t < arriveAt;
  const personX = interpolate(m.t, [0, arriveAt], [width * 1.15, width * 0.58], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const personH = height * 0.26;

  // the cat crosses later, in the foreground
  const catStart = total * 0.46;
  const catX = interpolate(m.t, [catStart, total], [-width * 0.12, width * 1.1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lampX = width * 0.84;
  const lampH = height * 0.30;

  return (
    <AbsoluteFill style={{ backgroundColor: NIGHT.sky }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${NIGHT.sky} 0%, ${NIGHT.skyLow} 62%, #23202B 100%)`,
        }}
      />

      {/* sky */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        {STARS.map((s, i) => (
          <circle
            key={i}
            cx={s.x * width}
            cy={s.y * height}
            r={s.r}
            fill={NIGHT_INK}
            opacity={0.25 + 0.45 * Math.abs(Math.sin(m.t * 1.3 + i))}
          />
        ))}
        <path
          d={`M ${width * 0.2} ${height * 0.12} a 46 46 0 1 0 0 70 a 34 34 0 1 1 0 -70 Z`}
          fill="none"
          stroke={accent}
          strokeWidth={3}
          opacity={0.85}
        />
      </svg>

      {/* two blocks of flats, windows waking with the bass */}
      <WindowGrid
        x={-width * 0.04}
        y={height * 0.30}
        width={width * 0.46}
        height={height * 0.48}
        cols={3}
        rows={5}
        energy={m.low * k}
        seed={3}
        color={NIGHT_DIM}
        opacity={0.9}
      />
      <WindowGrid
        x={width * 0.46}
        y={height * 0.40}
        width={width * 0.40}
        height={height * 0.38}
        cols={3}
        rows={4}
        energy={m.rms * k}
        seed={9}
        color={NIGHT_DIM}
        opacity={0.75}
      />

      {/* ground */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
        <path
          d={`M 0 ${ground} L ${width} ${ground - 6}`}
          stroke={NIGHT_INK}
          strokeWidth={3}
          opacity={0.55}
        />
      </svg>

      <Lamppost x={lampX} y={ground} height={lampH} glow={0.6 + 0.8 * m.kick * k} />
      <GlowPool x={lampX} y={ground} radius={width * 0.3} strength={0.35 + 0.5 * m.kick * k} />

      {/* the character */}
      <Person
        x={personX}
        y={ground + personH * 0.03}
        height={personH}
        phase={stride}
        pose={walking ? "walk" : "smoke"}
        facing={-1}
        color={NIGHT_INK}
        strokeWidth={2.1}
        bob={walking ? 0 : -2 * m.kick}
      />
      {!walking && (
        <Smoke
          x={personX - personH * 0.05}
          y={ground - personH * 0.68}
          t={m.t - arriveAt}
          height={height * 0.22}
          color={NIGHT_INK}
          opacity={0.35}
        />
      )}

      {/* the cat, closer to camera */}
      {m.t > catStart && (
        <Cat
          x={catX}
          y={ground + height * 0.05}
          height={height * 0.075}
          phase={stride * 1.6}
          facing={1}
          color={NIGHT_INK}
          strokeWidth={2.6}
          opacity={0.95}
        />
      )}

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

      <Vignette strength={0.62} color="#000000" />
      <Grain frame={frame} opacity={0.09} />
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
