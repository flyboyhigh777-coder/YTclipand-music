/** Spectrum bars driven by the per-band analysis. Good for instrumental / beat-heavy parts. */
import React from "react";
import { AbsoluteFill, Img, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { ClipProps } from "../schema";
import { Captions, TrackTag } from "../lib/Captions";
import { Grain, Vignette } from "../lib/Layers";
import { clamp, curveSmooth, edgeFade, mixHex, musicState, rgba } from "../lib/music";

const BARS = 36;

export const Spectrum: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const p = props.palette;
  const k = props.style.intensity;
  const cover = props.cover.file ? staticFile(props.cover.file) : null;
  const fade = edgeFade(frame, durationInFrames, fps);
  const bands = props.curves.bands;

  // Real per-band data when available, otherwise interpolate the 3 broad bands.
  const values: number[] = React.useMemo(() => {
    const idx = clamp(Math.round(frame), 0, (bands?.length ?? 1) - 1);
    const row = bands?.[idx];
    if (row && row.length) {
      const out: number[] = [];
      for (let i = 0; i < BARS; i++) {
        const src = (i / (BARS - 1)) * (row.length - 1);
        const a = Math.floor(src);
        const b = Math.min(a + 1, row.length - 1);
        out.push(row[a] + (row[b] - row[a]) * (src - a));
      }
      return out;
    }
    const lo = curveSmooth(props.curves.low, frame, 1);
    const mi = curveSmooth(props.curves.mid, frame, 1);
    const hi = curveSmooth(props.curves.high, frame, 1);
    return Array.from({ length: BARS }, (_, i) => {
      const x = i / (BARS - 1);
      const base = x < 0.5 ? lo + (mi - lo) * (x * 2) : mi + (hi - mi) * ((x - 0.5) * 2);
      return base * (0.75 + 0.25 * Math.sin(i * 1.7 + m.t * 6));
    });
  }, [bands, frame, props.curves, m.t]);

  return (
    <AbsoluteFill style={{ backgroundColor: p.bg }}>
      {cover && (
        <AbsoluteFill style={{ overflow: "hidden" }}>
          <Img
            src={cover}
            style={{
              width: "130%", height: "130%", marginLeft: "-15%", marginTop: "-15%",
              objectFit: "cover",
              filter: `blur(70px) saturate(1.6) brightness(${0.3 + 0.2 * m.rms})`,
            }}
          />
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${rgba(p.bg, 0.6)}, ${rgba(p.bg2, 0.85)})` }} />

      {/* cover card */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-start" }}>
        <div
          style={{
            marginTop: height * 0.15,
            width: width * 0.62,
            height: width * 0.62,
            borderRadius: 34,
            overflow: "hidden",
            boxShadow: `0 30px 90px rgba(0,0,0,.6), 0 0 ${40 + 70 * m.kick}px ${rgba(p.accent, 0.4 * k)}`,
            transform: `scale(${1 + 0.03 * m.kick * k})`,
          }}
        >
          {cover ? (
            <Img src={cover} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <AbsoluteFill style={{ background: `linear-gradient(135deg, ${p.accent}, ${p.accent2})` }} />
          )}
        </div>
      </AbsoluteFill>

      {/* bars */}
      <div
        style={{
          position: "absolute",
          left: 0, right: 0,
          top: height * 0.56,
          height: 260,
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 8,
          padding: "0 70px",
        }}
      >
        {values.map((v, i) => {
          const h = 16 + Math.pow(clamp(v, 0, 1), 0.75) * 230 * (0.7 + 0.5 * k);
          const c = mixHex(p.accent, p.accent2, i / (BARS - 1));
          return (
            <div
              key={i}
              style={{
                flex: 1,
                height: h,
                borderRadius: 6,
                background: `linear-gradient(180deg, ${c}, ${rgba(c, 0.25)})`,
                boxShadow: `0 0 ${10 + 26 * clamp(v, 0, 1)}px ${rgba(c, 0.55)}`,
              }}
            />
          );
        })}
      </div>

      <Vignette strength={0.5} />
      <Grain frame={frame} opacity={0.1 * k} />
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
