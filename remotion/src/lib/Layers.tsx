/** Shared visual layers: film grain, vignette, light sweep, safe-zone guides. */
import React from "react";
import { AbsoluteFill } from "remotion";
import { rgba } from "./music";

export const Vignette: React.FC<{ strength?: number; color?: string }> = ({
  strength = 0.55,
  color = "#000000",
}) => (
  <AbsoluteFill
    style={{
      background: `radial-gradient(ellipse 72% 62% at 50% 45%, transparent 38%, ${rgba(
        color,
        strength
      )} 100%)`,
      pointerEvents: "none",
    }}
  />
);

/**
 * Animated film grain.
 *
 * The tiles are built once at module load, not inside the component: rebuilding
 * a 900-element SVG string and re-parsing it as a data URI on every frame was
 * the single most expensive thing in the render.
 */
const GRAIN_TILES: string[] = (() => {
  const size = 160;
  const cell = 3;
  const tiles: string[] = [];
  for (let seed = 0; seed < 8; seed++) {
    const parts: string[] = [];
    for (let i = 0; i < 900; i++) {
      const x = Math.floor((Math.abs(Math.sin((seed * 977 + i) * 12.9898)) % 1) * size);
      const y = Math.floor((Math.abs(Math.sin((seed * 311 + i) * 78.233)) % 1) * size);
      const v = Math.floor(120 + (Math.abs(Math.sin((seed * 7 + i) * 43.123)) % 1) * 135);
      parts.push(
        `<rect x="${x}" y="${y}" width="${cell}" height="${cell}" fill="rgb(${v},${v},${v})"/>`
      );
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">${parts.join(
      ""
    )}</svg>`;
    tiles.push(`url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`);
  }
  return tiles;
})();

export const Grain: React.FC<{ frame: number; opacity?: number; cell?: number }> = ({
  frame,
  opacity = 0.14,
}) => (
  <AbsoluteFill
    style={{
      backgroundImage: GRAIN_TILES[frame % GRAIN_TILES.length],
      backgroundRepeat: "repeat",
      mixBlendMode: "overlay",
      opacity,
      pointerEvents: "none",
    }}
  />
);

/** Diagonal light streak that slides across on a musical cycle. */
export const LightSweep: React.FC<{
  progress: number;
  color: string;
  width?: number;
  opacity?: number;
}> = ({ progress, color, width = 420, opacity = 0.28 }) => (
  <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
    <div
      style={{
        position: "absolute",
        top: "-30%",
        left: `${-40 + progress * 160}%`,
        width,
        height: "160%",
        transform: "rotate(18deg)",
        background: `linear-gradient(90deg, transparent, ${rgba(color, opacity)}, transparent)`,
        filter: "blur(28px)",
      }}
    />
  </AbsoluteFill>
);

/** Soft colour bloom that breathes with the bass. */
export const Bloom: React.FC<{
  color: string;
  amount: number;
  x?: string;
  y?: string;
  size?: number;
}> = ({ color, amount, x = "50%", y = "40%", size = 1200 }) => (
  <AbsoluteFill style={{ pointerEvents: "none" }}>
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: size,
        height: size,
        transform: "translate(-50%, -50%)",
        background: `radial-gradient(circle, ${rgba(color, 0.55 * amount)} 0%, transparent 65%)`,
        filter: "blur(40px)",
      }}
    />
  </AbsoluteFill>
);

/** Thin scanlines — used by the glitch template. */
export const Scanlines: React.FC<{ opacity?: number; gap?: number }> = ({
  opacity = 0.1,
  gap = 4,
}) => (
  <AbsoluteFill
    style={{
      backgroundImage: `repeating-linear-gradient(0deg, rgba(0,0,0,${opacity}) 0px, rgba(0,0,0,${opacity}) 1px, transparent 1px, transparent ${gap}px)`,
      pointerEvents: "none",
    }}
  />
);

/** Dev-only overlay showing the TikTok/Reels safe zones (rules.md §3.3). */
export const SafeZones: React.FC<{
  top: number;
  bottom: number;
  right: number;
  show?: boolean;
}> = ({ top, bottom, right, show = false }) =>
  show ? (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: 0, border: "2px dashed rgba(255,0,80,.5)" }} />
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: top, background: "rgba(255,0,80,.12)" }} />
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: bottom, background: "rgba(255,0,80,.12)" }} />
      <div style={{ position: "absolute", top: 0, bottom: 0, right: 0, width: right, background: "rgba(255,0,80,.12)" }} />
    </AbsoluteFill>
  ) : null;
