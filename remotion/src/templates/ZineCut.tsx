/**
 * th3rd-zine — the photograph full-bleed, re-framed on every bar: wide, then the
 * doorway, the lamp, the two on the bench. Paper strips carry the words; the
 * doodle sits on its own scrap so nothing is ever drawn onto the artwork.
 */
import React from "react";
import {
  AbsoluteFill, interpolate, staticFile, useCurrentFrame, useVideoConfig,
} from "remotion";
import type { ClipProps } from "../schema";
import { BRAND, FONT_MONO, handheld, wobble } from "../lib/brand";
import { Paper, PhotoFill, SleeveFooter, Tape, TornStrip, subBox } from "../lib/Paper";
import { PaperCaptions } from "../lib/PaperCaptions";
import { Doodle, DOODLES } from "../lib/Doodles";
import { Grain, Vignette } from "../lib/Layers";
import { edgeFade, musicState } from "../lib/music";
import { photoSource, safeZoom } from "../lib/photo";

/**
 * Bar-by-bar framing. `kind: "sleeve"` shows the whole artwork, which on a
 * 1080-wide frame is close to its native resolution and therefore crisp;
 * `kind: "photo"` fills the frame with the photograph. Zoom is deliberately
 * near 1: the embedded sleeve is small, and magnifying it only makes mush.
 */
const SHOTS: {
  kind: "photo" | "sleeve";
  z: number; fx: number; fy: number; label: string; rot: number;
}[] = [
  { kind: "photo",  z: 1.0, fx: 0.50, fy: 0.50, label: "третий подъезд", rot: 0 },
  { kind: "sleeve", z: 1.0, fx: 0.50, fy: 0.50, label: "если хочешь серьёзно", rot: -1.6 },
  { kind: "photo",  z: 1.0, fx: 0.62, fy: 0.55, label: "двое", rot: 0.8 },
  { kind: "sleeve", z: 1.0, fx: 0.50, fy: 0.50, label: "01.", rot: 2.2 },
  { kind: "photo",  z: 1.0, fx: 0.38, fy: 0.46, label: "подъезд 3", rot: -0.7 },
  { kind: "sleeve", z: 1.0, fx: 0.50, fy: 0.50, label: "2026", rot: -2.6 },
];

export const ZineCut: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const k = props.style.intensity;
  const cover = props.cover.file ? staticFile(props.cover.file) : null;
  const logo = props.logo?.file ? staticFile(props.logo.file) : null;
  const fade = edgeFade(frame, durationInFrames, fps);
  const hh = handheld(m.t, 1.5);

  const shot = SHOTS[m.bar % SHOTS.length];
  const photo = photoSource(props);
  // never ask for more magnification than the source pixels can carry
  const z = safeZoom(shot.z, photo.sourceWidth, width);
  const box = subBox(photo.box ?? { x: 0, y: 0, w: 1, h: 1 }, z, shot.fx, shot.fy);
  const showSleeve = shot.kind === "sleeve" && cover !== null;

  // a slow drift inside each shot, so a held bar still breathes
  const drift = interpolate(m.barT, [0, 2.6], [0, 26], { extrapolateRight: "clamp" });
  const punch = 1 + 0.02 * m.kick * k;

  const doodle = DOODLES[(m.bar * 2 + 1) % DOODLES.length];
  const drawP = interpolate(m.barT, [0.1, 1.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.paper }}>
      <Paper />
      <AbsoluteFill
        style={{
          transform: `translate(${hh.x}px, ${hh.y}px) rotate(${hh.r * 0.3}deg) scale(${punch})`,
        }}
      >
        {showSleeve ? (
          // the artwork whole, laid on the page at close to native resolution
          <div
            style={{
              position: "absolute",
              left: (width - width * 0.9) / 2,
              top: height * 0.19,
              width: width * 0.9,
              transform: `rotate(${shot.rot}deg)`,
              boxShadow: "0 30px 70px rgba(60,52,38,.32)",
            }}
          >
            <img src={cover!} style={{ width: "100%", display: "block" }} />
            <Tape x={width * 0.9 * 0.2} y={-6} w={170} h={50} rotate={-9} opacity={0.75} />
          </div>
        ) : (
          <PhotoFill
            src={photo.src}
            box={box}
            width={width}
            height={height}
            panX={drift * Math.sign(Math.sin(m.bar + 1))}
            panY={-drift * 0.3}
          />
        )}
      </AbsoluteFill>

      {/* paper edges top and bottom, so the frame still reads as a page */}
      <div
        style={{
          position: "absolute", left: 0, right: 0, top: 0, height: 96,
          background: `linear-gradient(180deg, ${BRAND.paper} 40%, rgba(226,222,213,0) 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0,
          height: props.captions.safeBottom + 120,
          background: `linear-gradient(0deg, ${BRAND.paper} 55%, rgba(226,222,213,0) 100%)`,
        }}
      />

      <div
        style={{
          position: "absolute",
          left: 0, right: 0, top: props.captions.safeTop - 96,
          textAlign: "center",
          fontFamily: FONT_MONO, fontSize: 25, letterSpacing: "0.26em",
          textTransform: "uppercase", color: BRAND.ink,
          opacity: interpolate(m.barT, [0, 0.2], [0, 0.66], {
            extrapolateLeft: "clamp", extrapolateRight: "clamp",
          }),
        }}
      >
        {shot.label}
      </div>

      {/* the doodle lives on its own scrap of paper */}
      <div
        style={{
          position: "absolute",
          left: 62,
          bottom: props.captions.safeBottom + 190,
          transform: `rotate(${wobble(m.bar, 4)}deg)`,
        }}
      >
        <TornStrip padding="14px" rotate={0} style={{ width: 200, height: 200 }}>
          <div style={{ position: "relative", width: "100%", height: "100%" }}>
            <Doodle
              def={doodle}
              progress={drawP}
              size={170}
              x={86}
              y={86}
              boilFrame={frame}
              strokeWidth={3.2}
            />
          </div>
        </TornStrip>
        <Tape x={100} y={-6} w={120} h={40} rotate={-10} opacity={0.8} />
      </div>

      <PaperCaptions
        lines={props.lyrics.lines}
        style={props.captions.style}
        frame={frame}
        fps={fps}
        width={width}
        bottom={props.captions.safeBottom + 10}
        baseSize={58}
        maxWidth={width - 160}
      />
      <SleeveFooter
        logo={logo}
        caption={`${props.track.artist} — ${props.music.bpm.toFixed(0)} bpm`}
        bottom={props.captions.safeBottom - 150}
      />
      <Grain frame={frame} opacity={0.1} />
      <Vignette strength={0.38} color="#4a4336" />
      <AbsoluteFill style={{ backgroundColor: BRAND.paper, opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
