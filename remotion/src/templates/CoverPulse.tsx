/** Cover art full-bleed, breathing with the kick. The default, works for any track. */
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ClipProps } from "../schema";
import { Captions, TrackTag } from "../lib/Captions";
import { Bloom, Grain, LightSweep, Vignette } from "../lib/Layers";
import { edgeFade, musicState, rgba } from "../lib/music";

export const CoverPulse: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const p = props.palette;
  const k = props.style.intensity;
  const cover = props.cover.file ? staticFile(props.cover.file) : null;

  const zoom = 1.06 + 0.055 * m.kick * k + 0.03 * m.rms;
  const drift = Math.sin(m.t * 0.22) * 14;
  const fade = edgeFade(frame, durationInFrames, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: p.bg }}>
      {/* blurred backdrop */}
      {cover && (
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <Img
            src={cover}
            style={{
              width: "140%",
              height: "140%",
              marginLeft: "-20%",
              marginTop: "-20%",
              objectFit: "cover",
              filter: `blur(58px) saturate(1.5) brightness(${0.42 + 0.22 * m.rms})`,
              transform: `scale(${1.08 + 0.04 * m.low})`,
            }}
          />
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          background: `linear-gradient(170deg, ${rgba(p.bg, 0.55)} 0%, ${rgba(
            p.bg2,
            0.72
          )} 55%, ${rgba(p.bg, 0.92)} 100%)`,
        }}
      />
      <Bloom color={p.accent} amount={0.35 + 0.65 * m.kick * k} y="38%" size={1300} />

      {/* the cover card */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
        <div
          style={{
            marginTop: height * 0.17,
            width: width * 0.78,
            height: width * 0.78,
            borderRadius: 42,
            overflow: "hidden",
            transform: `scale(${zoom}) translateY(${drift}px) rotate(${
              Math.sin(m.t * 0.35) * 0.7
            }deg)`,
            boxShadow: `0 40px 120px rgba(0,0,0,.6), 0 0 ${
              60 + 90 * m.kick
            }px ${rgba(p.accent, 0.35 * k)}`,
            border: `2px solid ${rgba(p.accent, 0.35)}`,
            backgroundColor: p.bg2,
          }}
        >
          {cover ? (
            <Img src={cover} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <AbsoluteFill
              style={{
                background: `conic-gradient(from ${m.t * 30}deg, ${p.accent}, ${p.accent2}, ${p.accent})`,
              }}
            />
          )}
        </div>
      </AbsoluteFill>

      <LightSweep progress={(m.bar % 4) / 4 + m.phase / 4} color={p.accent2} opacity={0.22 * k} />
      <Vignette strength={0.6} />
      <Grain frame={frame} opacity={0.12 * k} />

      <TrackTag
        artist={props.track.artist}
        title={props.track.title}
        color={p.text}
        accent={p.accent}
        top={props.captions.safeTop - 70}
      />
      <Captions
        lines={props.lyrics.lines}
        style={props.captions.style}
        frame={frame}
        fps={fps}
        palette={p}
        safeBottom={props.captions.safeBottom}
        height={height}
        width={width}
      />
      <AbsoluteFill style={{ backgroundColor: "#000", opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
