/**
 * th3rd-stairwell — a 3D scene on the band's own motif: a flight of stairs, a
 * wall, light falling from a window, and the sleeve hanging in the air like a
 * photo taped to the landing. The artwork is mapped as-is onto the plane.
 */
import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import type { ClipProps } from "../schema";
import { BRAND, FONT_MONO, handheld } from "../lib/brand";
import { Paper, SleeveFooter } from "../lib/Paper";
import { PaperCaptions } from "../lib/PaperCaptions";
import { Grain, Vignette } from "../lib/Layers";
import { edgeFade, hexToRgb, musicState } from "../lib/music";
import { useImageTexture } from "../lib/useImageTexture";

const c3 = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
};

const Scene: React.FC<{ props: ClipProps; m: ReturnType<typeof musicState> }> = ({ props, m }) => {
  const cover = props.cover.file ? staticFile(props.cover.file) : null;
  const texture = useImageTexture(cover);
  const warm = c3("#E8A14B");
  const cool = c3(BRAND.marker);
  const wall = c3("#BDB6A6");
  const stone = c3("#A79F8E");

  const steps = 8;
  const rise = 0.30;
  const run = 0.46;
  const sway = Math.sin(m.t * 0.42) * 0.10;

  return (
    <>
      <ambientLight intensity={0.42} color={wall} />
      <directionalLight position={[-5, 6, 4]} intensity={0.55} color={cool} />
      {/* the lamp over the entrance, breathing with the kick */}
      <pointLight
        position={[2.0, 1.4, 2.6]}
        intensity={11 + 16 * m.kick}
        color={warm}
        distance={18}
        decay={1.6}
      />

      {/* back wall, so the stairs read as a stairwell and not as floating slabs */}
      <mesh position={[0, 0.6, -2.2]} receiveShadow>
        <planeGeometry args={[18, 12]} />
        <meshStandardMaterial color={wall} roughness={0.95} />
      </mesh>
      {/* side wall catching the warm light */}
      <mesh position={[-3.4, 0.6, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[9, 12]} />
        <meshStandardMaterial color={stone} roughness={0.95} />
      </mesh>

      {/* the flight itself: tread + riser, so it looks built */}
      <group position={[-2.1, -2.3, -0.6]} rotation={[0, 0.3 + sway * 0.25, 0]}>
        {Array.from({ length: steps }).map((_, i) => (
          <group key={i} position={[i * run, i * rise, 0]}>
            <mesh position={[0, 0, 0]}>
              <boxGeometry args={[run, 0.07, 2.6]} />
              <meshStandardMaterial color={stone} roughness={0.9} />
            </mesh>
            <mesh position={[-run / 2, -rise / 2, 0]}>
              <boxGeometry args={[0.07, rise, 2.6]} />
              <meshStandardMaterial color={wall} roughness={0.95} />
            </mesh>
          </group>
        ))}
      </group>

      {/* the sleeve, hanging and turning slowly */}
      <group
        position={[0.35, 0.95 + 0.06 * Math.sin(m.t * 0.8), 1.2]}
        rotation={[0.05 * Math.sin(m.t * 0.6), sway, 0.025 * Math.cos(m.t * 0.7)]}
      >
        <mesh position={[0, 0, -0.015]}>
          <planeGeometry args={[2.82, 2.82]} />
          <meshStandardMaterial color={"#FBFAF6"} roughness={0.92} />
        </mesh>
        <mesh>
          <planeGeometry args={[2.66, 2.66]} />
          {/* the key is the `key`: adding a map to an existing material does not
              recompile its shader, so the material is recreated when the texture
              arrives — otherwise the plane renders blank */}
          <meshStandardMaterial
            key={texture ? "with-map" : "no-map"}
            map={texture ?? undefined}
            color={texture ? "#ffffff" : BRAND.paperDeep}
            roughness={0.78}
            metalness={0}
          />
        </mesh>
      </group>

      {/* dust hanging in the lamp light */}
      {Array.from({ length: 26 }).map((_, i) => {
        const a = (i / 26) * Math.PI * 2 + m.t * 0.1;
        const r = 1.4 + 2.2 * ((i % 6) / 6);
        const y = -1.8 + ((i * 0.41 + m.t * 0.09) % 4.0);
        return (
          <mesh key={i} position={[Math.cos(a) * r + 0.6, y, Math.sin(a) * r * 0.4 + 1.6]}>
            <sphereGeometry args={[0.014 + 0.012 * m.kick, 6, 6]} />
            <meshBasicMaterial color={warm} transparent opacity={0.55} />
          </mesh>
        );
      })}
    </>
  );
};

export const Stairwell3D: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const fade = edgeFade(frame, durationInFrames, fps);
  const logo = props.logo?.file ? staticFile(props.logo.file) : null;
  const hh = handheld(m.t, 0.5);

  return (
    <AbsoluteFill style={{ backgroundColor: BRAND.paper }}>
      <Paper />
      <AbsoluteFill style={{ transform: `translate(${hh.x}px, ${hh.y}px)` }}>
        <ThreeCanvas
          width={width}
          height={Math.round(height * 0.70)}
          style={{ position: "absolute", top: Math.round(height * 0.07), left: 0 }}
          camera={{ fov: 42, position: [0.4, 0.7, 7.0] }}
          gl={{ antialias: true }}
        >
          <Scene props={props} m={m} />
        </ThreeCanvas>
      </AbsoluteFill>

      <PaperCaptions
        lines={props.lyrics.lines}
        style={props.captions.style}
        frame={frame}
        fps={fps}
        width={width}
        bottom={props.captions.safeBottom + 30}
        baseSize={56}
      />
      <div
        style={{
          position: "absolute",
          left: 72, right: 72,
          bottom: props.captions.safeBottom - 86,
          textAlign: "center",
          fontFamily: FONT_MONO, fontSize: 24, letterSpacing: "0.2em",
          textTransform: "uppercase", color: BRAND.ink, opacity: 0.5,
        }}
      >
        {props.track.title}
      </div>
      <SleeveFooter
        logo={logo}
        caption={props.track.artist}
        bottom={props.captions.safeBottom - 150}
      />
      <Grain frame={frame} opacity={0.08} />
      <Vignette strength={0.36} color="#4a4336" />
      <AbsoluteFill style={{ backgroundColor: BRAND.paper, opacity: 1 - fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
};
