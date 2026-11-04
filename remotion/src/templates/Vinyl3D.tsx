/**
 * Real 3D scene (@remotion/three): the cover as a spinning record under moving light.
 * Rotation speed is locked to the track's BPM, the light pulses on the kick.
 */
import React from "react";
import { AbsoluteFill, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { ThreeCanvas } from "@remotion/three";
import type { ClipProps } from "../schema";
import { Captions, TrackTag } from "../lib/Captions";
import { Grain, Vignette } from "../lib/Layers";
import { edgeFade, hexToRgb, musicState, rgba } from "../lib/music";
import { useImageTexture } from "../lib/useImageTexture";

const toColor = (hex: string): [number, number, number] => {
  const [r, g, b] = hexToRgb(hex);
  return [r / 255, g / 255, b / 255];
};

const Record: React.FC<{ props: ClipProps; m: ReturnType<typeof musicState> }> = ({
  props,
  m,
}) => {
  const cover = props.cover.file ? staticFile(props.cover.file) : null;
  const texture = useImageTexture(cover);
  const p = props.palette;

  // one full turn per 8 beats -> visually locked to the tempo
  const spin = (m.t * props.music.bpm) / 60 / 8 * Math.PI * 2;
  const tilt = 0.52 + 0.07 * Math.sin(m.t * 0.4) + 0.05 * m.kick;
  const lift = 0.1 * m.kick;

  const [ar, ag, ab] = toColor(p.accent);
  const [br, bg, bb] = toColor(p.accent2);

  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 6, 4]} intensity={1.1} />
      <pointLight
        position={[Math.sin(m.t * 0.8) * 3, 2.2, Math.cos(m.t * 0.8) * 3]}
        intensity={6 + 16 * m.kick}
        color={[ar, ag, ab]}
        distance={14}
      />
      <pointLight
        position={[-Math.sin(m.t * 0.6) * 3.4, -1.4, Math.cos(m.t * 0.6) * 2.4]}
        intensity={4 + 8 * m.rms}
        color={[br, bg, bb]}
        distance={12}
      />

      <group rotation={[tilt, 0, 0]} position={[0, lift, 0]}>
        {/* the disc */}
        <mesh rotation={[0, spin, 0]} castShadow>
          <cylinderGeometry args={[2.1, 2.1, 0.06, 96]} />
          <meshStandardMaterial color="#0b0b0f" roughness={0.42} metalness={0.5} />
        </mesh>
        {/* cover art printed on the top face */}
        <mesh rotation={[-Math.PI / 2, 0, spin]} position={[0, 0.035, 0]}>
          <circleGeometry args={[2.08, 96]} />
          {texture ? (
            <meshStandardMaterial map={texture} roughness={0.35} metalness={0.25} />
          ) : (
            <meshStandardMaterial color={p.accent} roughness={0.4} metalness={0.3} />
          )}
        </mesh>
        {/* centre hole */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]}>
          <circleGeometry args={[0.06, 24]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        {/* glow ring that breathes with the bass */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
          <ringGeometry args={[2.12, 2.3 + 0.25 * m.low, 96]} />
          <meshBasicMaterial color={[ar, ag, ab]} transparent opacity={0.35 + 0.45 * m.kick} />
        </mesh>
      </group>

      {/* floating particles on the beat grid */}
      {Array.from({ length: 14 }).map((_, i) => {
        const a = (i / 14) * Math.PI * 2 + m.t * 0.25;
        const r = 3.1 + 0.5 * Math.sin(m.t * 0.7 + i);
        const y = Math.sin(m.t * 0.9 + i * 1.3) * 1.5;
        const s = 0.04 + 0.05 * m.kick;
        return (
          <mesh key={i} position={[Math.cos(a) * r, y, Math.sin(a) * r]}>
            <sphereGeometry args={[s, 10, 10]} />
            <meshBasicMaterial color={i % 2 ? [ar, ag, ab] : [br, bg, bb]} transparent opacity={0.75} />
          </mesh>
        );
      })}
    </>
  );
};

export const Vinyl3D: React.FC<ClipProps> = (props) => {
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const m = musicState(props, frame, fps);
  const p = props.palette;
  const fade = edgeFade(frame, durationInFrames, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: p.bg }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 80% 55% at 50% 38%, ${rgba(p.bg2, 0.95)} 0%, ${p.bg} 70%)`,
        }}
      />
      <ThreeCanvas
        width={width}
        height={Math.round(height * 0.62)}
        style={{ position: "absolute", top: Math.round(height * 0.1), left: 0 }}
        camera={{ fov: 42, position: [0, 0.6, 7.4] }}
        gl={{ antialias: true }}
      >
        <Record props={props} m={m} />
      </ThreeCanvas>

      <Vignette strength={0.58} />
      <Grain frame={frame} opacity={0.11 * props.style.intensity} />
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
