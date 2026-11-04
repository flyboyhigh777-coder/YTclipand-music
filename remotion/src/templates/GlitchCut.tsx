/** Hard cuts on bar boundaries, RGB split and flashes. Built for the hook. */
import React from "react";
import { AbsoluteFill, Img, random, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ClipProps } from "../schema";
import { Captions } from "../lib/Captions";
import { Grain, Scanlines, Vignette } from "../lib/Layers";
import { clamp, edgeFade, musicState, rgba } from "../lib/music";

/** Each bar gets its own framing, so the picture changes in time with the music. */
const framing = (bar: number) => {
  const zoom = 1.0 + random(`z-${bar}`) * 0.5;
  const x = (random(`x-${bar}`) - 0.5) * 22;
  const y = (random(`y-${bar}`) - 0.5) * 18;
  const rot = (random(`r-${bar}`) - 0.5) * 5;
  const mirror = random(`m-${bar}`) > 0.72;
  return { zoom, x, y, rot, mirror };
};

export const GlitchCut: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const p = props.palette;
  const k = props.style.intensity;
  const cover = props.cover.file ? staticFile(props.cover.file) : null;
  const fade = edgeFade(frame, durationInFrames, fps);

  const f = framing(m.bar);
  const hit = m.kick;
  const split = (2 + 16 * hit) * k;             // chromatic aberration
  const flash = clamp(hit * 0.5 - 0.12, 0, 1) * k;
  const shake = m.barT < 0.1 ? (1 - m.barT / 0.1) * 12 * k : 0;

  const layer = (dx: number, color: string, blend: string): React.CSSProperties => ({
    position: "absolute",
    inset: 0,
    transform: `translateX(${dx}px) scale(${f.zoom}) translate(${f.x}%, ${f.y}%) rotate(${f.rot}deg) scaleX(${f.mirror ? -1 : 1})`,
    mixBlendMode: blend as never,
    filter: `saturate(1.3) contrast(1.12)`,
    backgroundColor: color,
  });

  return (
    <AbsoluteFill style={{ backgroundColor: p.bg, overflow: "hidden" }}>
      {cover ? (
        <>
          <AbsoluteFill style={{ ...layer(-split, "transparent", "normal") }}>
            <Img src={cover} style={{ width: "100%", height: "100%", objectFit: "cover", filter: "url(#none)" }} />
            <AbsoluteFill style={{ background: rgba(p.accent, 0.18), mixBlendMode: "color" }} />
          </AbsoluteFill>
          <AbsoluteFill style={{ ...layer(split, "transparent", "screen"), opacity: 0.55 }}>
            <Img src={cover} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            <AbsoluteFill style={{ background: rgba(p.accent2, 0.5), mixBlendMode: "color" }} />
          </AbsoluteFill>
        </>
      ) : (
        <AbsoluteFill
          style={{ background: `conic-gradient(from ${m.bar * 40}deg, ${p.accent}, ${p.accent2}, ${p.bg2})` }}
        />
      )}

      {/* torn slices on strong hits */}
      {hit > 0.55 &&
        Array.from({ length: 3 }).map((_, i) => {
          const top = random(`st-${m.bar}-${i}-${Math.floor(m.t * 8)}`) * height;
          const h = 14 + random(`sh-${m.bar}-${i}`) * 70;
          const dx = (random(`sx-${m.bar}-${i}`) - 0.5) * 160 * hit;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: 0, right: 0, top, height: h,
                overflow: "hidden",
                transform: `translateX(${dx}px)`,
                opacity: 0.85,
              }}
            >
              {cover && (
                <Img
                  src={cover}
                  style={{
                    position: "absolute",
                    top: -top, left: 0,
                    width: "100%", height,
                    objectFit: "cover",
                    filter: "hue-rotate(40deg) saturate(1.6)",
                  }}
                />
              )}
            </div>
          );
        })}

      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${rgba(p.bg, 0.25)} 0%, ${rgba(p.bg, 0.0)} 40%, ${rgba(p.bg, 0.8)} 100%)`,
        }}
      />
      <Scanlines opacity={0.12 * k} gap={5} />
      <AbsoluteFill style={{ backgroundColor: p.accent, opacity: flash * 0.35, mixBlendMode: "screen" }} />
      <Vignette strength={0.62} />
      <Grain frame={frame} opacity={0.18 * k} />

      <div style={{ transform: `translateY(${shake}px)` }}>
        <Captions
          lines={props.lyrics.lines}
          style={props.captions.style}
          frame={frame}
          fps={fps}
          palette={p}
          safeBottom={props.captions.safeBottom}
          height={height}
          width={width}
          uppercase
          baseSize={118}
        />
      </div>
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
