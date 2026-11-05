/**
 * ink-pulse — fully generated visuals, no artwork at all.
 *
 * A hand-drawn waveform follows the spectrum, rings leave the centre on every
 * beat, blots land on the kick, and a red mark answers the bass. Everything on
 * screen is driven by the track.
 */
import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { ClipProps } from "../schema";
import { BRAND, FONT_MONO, handheld, wobble } from "../lib/brand";
import { Paper, SleeveFooter } from "../lib/Paper";
import { PaperCaptions } from "../lib/PaperCaptions";
import { BeatRings, Blot, InkBars, InkWave } from "../lib/Ink";
import { Grain, Vignette } from "../lib/Layers";
import { clamp, edgeFade, musicState } from "../lib/music";

export const InkPulse: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const k = props.style.intensity;
  const fade = edgeFade(frame, durationInFrames, fps);
  const hh = handheld(m.t, 0.8);

  const bands = props.curves.bands;
  const row: number[] = React.useMemo(() => {
    const idx = clamp(Math.round(frame), 0, (bands?.length ?? 1) - 1);
    const raw = bands?.[idx] ?? [];
    if (!raw.length) return [];
    // stretch each frame across the full range: the raw bands sit in a narrow
    // band of their own and render as an almost flat comb
    const lo = Math.min(...raw);
    const hi = Math.max(...raw);
    const span = Math.max(hi - lo, 0.05);
    return raw.map((v) => Math.pow((v - lo) / span, 0.85));
  }, [bands, frame]);

  const centerY = height * 0.42;
  const beats = props.music.beats;

  // blots land on strong kicks and then sit there for a moment
  const recentKicks = beats.filter((b) => b <= m.t && m.t - b < 0.9);

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.paper }}>
      <Paper />

      <AbsoluteFill
        style={{ transform: `translate(${hh.x}px, ${hh.y}px) rotate(${hh.r * 0.4}deg)` }}
      >
        <BeatRings
          beats={beats}
          t={m.t}
          cx={width / 2}
          cy={centerY}
          maxRadius={width * 0.95}
          life={1.8}
          color={BRAND.marker}
          strokeWidth={3.5 * k}
        />

        {/* the red mark at the centre, breathing with the bass */}
        <div
          style={{
            position: "absolute",
            left: width / 2,
            top: centerY,
            width: 96 + 120 * m.low * k,
            height: 96 + 120 * m.low * k,
            transform: `translate(-50%, -50%) rotate(${m.t * 12}deg)`,
            backgroundColor: BRAND.red,
            opacity: 0.9,
          }}
        />

        {recentKicks.map((b, i) => {
          const age = (m.t - b) / 0.9;
          const r = 26 + 30 * (1 - age);
          return (
            <Blot
              key={`${b}-${i}`}
              x={width * (0.18 + 0.64 * ((i * 0.37) % 1))}
              y={centerY + wobble(i * 23, 320)}
              r={r * k}
              seed={i + 3}
              color={i % 3 === 0 ? BRAND.red : BRAND.marker}
              opacity={0.5 * (1 - age)}
            />
          );
        })}

        <InkWave
          values={row.length ? row : [0.5, 0.5]}
          width={width}
          height={height}
          y={centerY + height * 0.2}
          amplitude={320 * k}
          color={BRAND.ink}
          strokeWidth={5}
          seed={Math.floor(m.t * 3)}
          opacity={0.85}
        />
        <InkWave
          values={row.length ? [...row].reverse() : [0.5, 0.5]}
          width={width}
          height={height}
          y={centerY - height * 0.16}
          amplitude={220 * k}
          color={BRAND.marker}
          strokeWidth={3.5}
          seed={Math.floor(m.t * 3) + 50}
          opacity={0.55}
        />

        <InkBars
          values={row.slice(0, 18)}
          x={width * 0.07}
          y={height * 0.70}
          width={width * 0.86}
          maxHeight={260 * k}
          color={BRAND.ink}
          strokeWidth={9}
        />
      </AbsoluteFill>

      <div
        style={{
          position: "absolute",
          left: 0, right: 0, top: props.captions.safeTop - 96,
          textAlign: "center",
          fontFamily: FONT_MONO, fontSize: 26, letterSpacing: "0.26em",
          textTransform: "uppercase", color: BRAND.ink, opacity: 0.6,
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
        caption={`${props.track.artist} — ${props.music.bpm.toFixed(0)} bpm`}
        bottom={props.captions.safeBottom - 150}
      />
      <Grain frame={frame} opacity={0.09} />
      <Vignette strength={0.3} color="#4a4336" />
      <AbsoluteFill style={{ backgroundColor: BRAND.paper, opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
