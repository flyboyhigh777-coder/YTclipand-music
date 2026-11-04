/** Text-forward: big karaoke lines over a living gradient built from the cover palette. */
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ClipProps } from "../schema";
import { Captions, FONT_STACK } from "../lib/Captions";
import { Grain, Vignette } from "../lib/Layers";
import { edgeFade, musicState, rgba } from "../lib/music";

const Blob: React.FC<{ color: string; x: number; y: number; size: number; o: number }> = ({
  color, x, y, size, o,
}) => (
  <div
    style={{
      position: "absolute",
      left: `${x}%`,
      top: `${y}%`,
      width: size,
      height: size,
      transform: "translate(-50%, -50%)",
      background: `radial-gradient(circle, ${rgba(color, o)} 0%, transparent 68%)`,
      filter: "blur(60px)",
    }}
  />
);

export const LyricFocus: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const p = props.palette;
  const k = props.style.intensity;
  const cover = props.cover.file ? staticFile(props.cover.file) : null;
  const fade = edgeFade(frame, durationInFrames, fps);
  const pal = [p.accent, p.accent2, ...(p.colors ?? [])].slice(0, 4);

  return (
    <AbsoluteFill style={{ backgroundColor: p.bg }}>
      <AbsoluteFill style={{ overflow: "hidden" }}>
        {pal.map((c, i) => (
          <Blob
            key={i}
            color={c}
            x={50 + 32 * Math.sin(m.t * (0.21 + i * 0.07) + i * 1.7)}
            y={42 + 30 * Math.cos(m.t * (0.17 + i * 0.05) + i * 2.1)}
            size={900 + 260 * (i % 2) + 300 * m.rms}
            o={0.5 - i * 0.07 + 0.2 * m.kick * k}
          />
        ))}
      </AbsoluteFill>
      <AbsoluteFill
        style={{ background: `linear-gradient(180deg, ${rgba(p.bg, 0.3)}, ${rgba(p.bg, 0.78)})` }}
      />

      {/* small cover chip + band name at the top */}
      <div
        style={{
          position: "absolute",
          top: props.captions.safeTop - 40,
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 24,
        }}
      >
        {cover && (
          <Img
            src={cover}
            style={{
              width: 108,
              height: 108,
              borderRadius: 22,
              objectFit: "cover",
              border: `2px solid ${rgba(p.accent, 0.5)}`,
              boxShadow: `0 10px 36px rgba(0,0,0,.5), 0 0 ${24 + 40 * m.kick}px ${rgba(p.accent, 0.4)}`,
            }}
          />
        )}
        <div style={{ fontFamily: FONT_STACK, textAlign: "left" }}>
          <div
            style={{
              fontWeight: 800,
              fontSize: 40,
              color: p.text,
              letterSpacing: "-0.01em",
              textShadow: "0 4px 18px rgba(0,0,0,.5)",
            }}
          >
            {props.track.artist}
          </div>
          <div
            style={{
              fontWeight: 600,
              fontSize: 26,
              color: rgba(p.text, 0.65),
              letterSpacing: "0.1em",
              textTransform: "uppercase",
            }}
          >
            {props.track.title}
          </div>
        </div>
      </div>

      {/* beat ticks — a quiet rhythm indicator */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: props.captions.safeBottom - 80,
          display: "flex",
          justifyContent: "center",
          gap: 12,
        }}
      >
        {Array.from({ length: 8 }).map((_, i) => {
          const on = i === Math.floor((m.bar * 4 + Math.floor(m.phase * 4)) % 8);
          return (
            <div
              key={i}
              style={{
                width: on ? 42 : 12,
                height: 12,
                borderRadius: 999,
                background: on ? p.accent : rgba(p.text, 0.22),
                boxShadow: on ? `0 0 22px ${rgba(p.accent, 0.7)}` : "none",
              }}
            />
          );
        })}
      </div>

      <Vignette strength={0.45} />
      <Grain frame={frame} opacity={0.1 * k} />
      <Captions
        lines={props.lyrics.lines}
        style={props.captions.style}
        frame={frame}
        fps={fps}
        palette={p}
        safeBottom={props.captions.safeBottom}
        height={height}
        width={width}
        centerY={height * 0.42}
        baseSize={122}
      />
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
