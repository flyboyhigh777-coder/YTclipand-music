/**
 * th3rd-marker — the page of a notebook: the lyrics are written out in blue
 * marker as they are sung, with a doodle in the margin. The photograph from the
 * sleeve is taped to the top of the page, unaltered.
 */
import React from "react";
import {
  AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import type { ClipProps, LyricLine } from "../schema";
import { BRAND, FONT_HAND, FONT_MONO, handheld, wobble } from "../lib/brand";
import { Paper, PhotoFill, SleeveFooter, Tape } from "../lib/Paper";
import { Doodle, DOODLES } from "../lib/Doodles";
import { Grain, Vignette } from "../lib/Layers";
import { edgeFade, musicState } from "../lib/music";
import { photoSource } from "../lib/photo";

/** One handwritten line; every word wipes in at the moment it is sung. */
const HandLine: React.FC<{
  line: LyricLine; t: number; size: number; age: number;
}> = ({ line, t, size, age }) => {
  const opacity = age === 0 ? 1 : Math.max(0.14, 0.4 - (age - 1) * 0.13);
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "0.02em 0.3em",
        fontFamily: FONT_HAND,
        fontWeight: 600,
        fontSize: age === 0 ? size : size * 0.78,
        lineHeight: 1.1,
        color: BRAND.marker,
        opacity,
        transform: `rotate(${wobble(Math.round(line.start * 3), 0.7)}deg)`,
        marginBottom: size * 0.2,
      }}
    >
      {line.words.map((w, i) => {
        const p = interpolate(t, [w.start - 0.02, w.start + 0.14], [0, 1], {
          extrapolateLeft: "clamp",
          extrapolateRight: "clamp",
        });
        return (
          <span
            key={`${w.text}-${i}`}
            style={{
              display: "inline-block",
              clipPath: `inset(-30% ${(1 - p) * 100}% -30% -5%)`,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};

export const Marker: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const cover = props.cover.file ? staticFile(props.cover.file) : null;
  const logo = props.logo?.file ? staticFile(props.logo.file) : null;
  const fade = edgeFade(frame, durationInFrames, fps);
  const hh = handheld(m.t, 0.6);
  const photo = photoSource(props);

  const lines = props.lyrics.lines;
  let cur = lines.findIndex((l) => m.t >= l.start - 0.25 && m.t <= l.end + 0.45);
  if (cur < 0) {
    const next = lines.findIndex((l) => l.start > m.t);
    cur = next >= 0 ? next : lines.length - 1;
  }
  const shown = cur >= 0 ? lines.slice(Math.max(0, cur - 2), cur + 1).reverse() : [];

  const photoW = Math.round(width * 0.47);
  const photoH = Math.round(photoW * 1.12);
  const photoTop = props.captions.safeTop + 18;

  const doodle = DOODLES[(m.bar + 3) % DOODLES.length];
  const drawP = interpolate(m.barT, [0.2, 1.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.paper }}>
      <Paper />
      {/* notebook margin */}
      <div
        style={{
          position: "absolute", left: 104, top: 0, bottom: 0, width: 2,
          backgroundColor: BRAND.red, opacity: 0.2,
        }}
      />

      <AbsoluteFill style={{ transform: `translate(${hh.x}px, ${hh.y}px) rotate(${hh.r * 0.4}deg)` }}>
        {/* the photograph, taped to the page */}
        <div style={{ position: "absolute", right: 64, top: photoTop, transform: "rotate(2.6deg)" }}>
          <div style={{ padding: 14, paddingBottom: 34, backgroundColor: BRAND.photoFrame, boxShadow: "0 20px 46px rgba(60,52,38,.3)" }}>
            <PhotoFill
              src={photo.src}
              box={photo.box}
              width={photoW}
              height={photoH}
              zoom={1.04}
              panX={Math.sin(m.t * 0.35) * 6}
            />
          </div>
          <Tape x={photoW * 0.5} y={-4} w={150} h={46} rotate={-7} opacity={0.75} />
        </div>

        {/* the handwriting fills the page from the middle down */}
        <div
          style={{
            position: "absolute",
            left: 136, right: 110,
            top: height * 0.52,
            display: "flex",
            flexDirection: "column-reverse",
            alignItems: "flex-start",
          }}
        >
          {shown.map((l, i) => (
            <HandLine key={`${l.start}-${i}`} line={l} t={m.t} size={104} age={i} />
          ))}
        </div>
      </AbsoluteFill>

      <Doodle
        def={doodle}
        progress={drawP}
        size={250}
        x={210}
        y={height - props.captions.safeBottom - 60}
        rotate={wobble(m.bar + 5, 8)}
        boilFrame={frame}
        strokeWidth={3.4}
        opacity={0.9}
      />

      <div
        style={{
          position: "absolute",
          left: 136, right: 110,
          bottom: props.captions.safeBottom - 86,
          fontFamily: FONT_MONO, fontSize: 24, letterSpacing: "0.2em",
          textTransform: "uppercase", color: BRAND.ink, opacity: 0.5,
        }}
      >
        {props.track.title}
      </div>
      <SleeveFooter
        logo={logo}
        caption={`${props.track.artist} — 2026`}
        bottom={props.captions.safeBottom - 150}
      />
      <Grain frame={frame} opacity={0.07} />
      <Vignette strength={0.24} color="#4a4336" />
      <AbsoluteFill style={{ backgroundColor: BRAND.paper, opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
