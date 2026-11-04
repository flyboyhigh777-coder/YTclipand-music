/**
 * th3rd-sheet — the photograph from the sleeve fills the phone screen, the page
 * below carries the lyrics. Nothing is drawn on top of the artwork; the doodles
 * live on the paper margin (rules.md §4.0).
 */
import React from "react";
import {
  AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import type { ClipProps } from "../schema";
import { BRAND, FONT_MONO, handheld, wobble } from "../lib/brand";
import { Paper, PhotoFill, SleeveFooter, Tape } from "../lib/Paper";
import { PaperCaptions } from "../lib/PaperCaptions";
import { Doodle, DOODLES } from "../lib/Doodles";
import { Grain, Vignette } from "../lib/Layers";
import { edgeFade, musicState } from "../lib/music";
import { photoSource } from "../lib/photo";

export const Sheet: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const k = props.style.intensity;
  const cover = props.cover.file ? staticFile(props.cover.file) : null;
  const logo = props.logo?.file ? staticFile(props.logo.file) : null;
  const fade = edgeFade(frame, durationInFrames, fps);
  const hh = handheld(m.t, 1);

  // the photo occupies the top of the frame like a print laid on the page
  const padX = 54;
  const photoW = width - padX * 2;
  const photoH = Math.round(height * 0.64);
  const photoTop = Math.round(height * 0.085);

  const push = interpolate(frame, [0, durationInFrames], [1.0, 1.08], {
    extrapolateRight: "clamp",
  });
  const beat = 1 + 0.01 * m.kick * k;

  // one doodle per bar, drawn in the margin under the photo
  const photo = photoSource(props);

  const doodle = DOODLES[m.bar % DOODLES.length];
  const drawP = interpolate(m.barT, [0.15, 1.5], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.paper }}>
      <Paper />

      <AbsoluteFill style={{ transform: `translate(${hh.x}px, ${hh.y}px) rotate(${hh.r * 0.5}deg)` }}>
        <div
          style={{
            position: "absolute",
            left: padX,
            top: photoTop,
            transform: `rotate(-0.6deg) scale(${push * beat})`,
            transformOrigin: "50% 40%",
            padding: 16,
            paddingBottom: 54,
            backgroundColor: BRAND.photoFrame,
            boxShadow: "0 28px 64px rgba(60,52,38,.32)",
          }}
        >
          <PhotoFill
            src={photo.src}
            box={photo.box}
            width={photoW - 32}
            height={photoH}
            zoom={1.02}
            panX={Math.sin(m.t * 0.3) * 10}
            panY={Math.cos(m.t * 0.24) * 8}
          />
          <div
            style={{
              position: "absolute",
              left: 0, right: 0, bottom: 14,
              textAlign: "center",
              fontFamily: FONT_MONO,
              fontSize: 26,
              letterSpacing: "0.16em",
              color: BRAND.ink,
              opacity: 0.72,
            }}
          >
            {props.track.title}
          </div>
          <Tape x={photoW * 0.16} y={-6} w={150} h={46} rotate={-9} opacity={0.72} />
          <Tape x={photoW * 0.85} y={-6} w={132} h={42} rotate={8} opacity={0.72} />
        </div>
      </AbsoluteFill>

      {/* margin doodle, on the page and never on the artwork */}
      <Doodle
        def={doodle}
        progress={drawP}
        size={200}
        x={width - 150}
        y={photoTop + photoH + 196}
        rotate={wobble(m.bar, 7)}
        boilFrame={frame}
        strokeWidth={3.4}
        opacity={0.85}
      />

      <PaperCaptions
        lines={props.lyrics.lines}
        style={props.captions.style}
        frame={frame}
        fps={fps}
        width={width}
        bottom={props.captions.safeBottom + 10}
        baseSize={58}
        maxWidth={width - 220}
      />
      <SleeveFooter
        logo={logo}
        caption={`${props.track.artist} — ${props.music.bpm.toFixed(0)} bpm`}
        bottom={props.captions.safeBottom - 150}
      />

      <Grain frame={frame} opacity={0.07} />
      <Vignette strength={0.26} color="#4a4336" />
      <AbsoluteFill style={{ backgroundColor: BRAND.paper, opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
