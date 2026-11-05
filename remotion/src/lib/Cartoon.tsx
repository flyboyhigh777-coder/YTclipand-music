/**
 * Cartoon characters with real animation: a walk cycle, a cat that pads across,
 * smoke that rises, windows that wake up. Drawn in line, so they belong to the
 * same hand as the rest of the project.
 *
 * Everything is parameterised by a phase, so motion can be locked to the beat.
 */
import React from "react";
import { wobble } from "./brand";

/** Night palette — the dark style the clips use. */
export const NIGHT = {
  sky: "#12131A",
  skyLow: "#1C1E2A",
  ink: "#E9E3D4",      // warm cream line
  dim: "#6E6B78",
} as const;

export const NIGHT_INK = "#E9E3D4";
export const NIGHT_DIM = "#6E6B78";
export const LAMP = "#F0A94C";
export const WINDOW_LIGHT = "#E8B35A";

type Pt = [number, number];

const line = (pts: Pt[]): string =>
  pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");

const polar = (from: Pt, angle: number, len: number): Pt => [
  from[0] + Math.sin(angle) * len,
  from[1] + Math.cos(angle) * len,
];

export type Pose = "walk" | "stand" | "smoke" | "sit";

/**
 * A person, drawn in a 100x100 box with the feet at y≈96.
 *
 * `phase` advances the walk cycle (one full stride per unit). `facing` is 1 for
 * right, -1 for left.
 */
export const Person: React.FC<{
  x: number;
  y: number;              // ground line: the feet stand here
  height: number;         // drawn height in pixels
  phase?: number;
  pose?: Pose;
  facing?: 1 | -1;
  color?: string;
  strokeWidth?: number;
  opacity?: number;
  bob?: number;           // extra vertical bounce, e.g. from the kick
  seed?: number;
}> = ({
  x, y, height, phase = 0, pose = "walk", facing = 1,
  color = NIGHT_INK, strokeWidth = 3.4, opacity = 1, bob = 0, seed = 1,
}) => {
  const s = height / 100;
  const p = phase % 1;
  const swing = pose === "walk" ? Math.sin(p * Math.PI * 2) : 0;
  const swing2 = pose === "walk" ? Math.sin(p * Math.PI * 2 + Math.PI) : 0;
  const bounce = pose === "walk" ? Math.abs(Math.cos(p * Math.PI * 2)) * 2.2 : 0;

  const hip: Pt = [50, 58 - bounce];
  const neck: Pt = [50, 36 - bounce];
  const headC: Pt = [50, 27 - bounce];

  // legs: thigh then shin, with a knee that bends on the forward swing
  const legAngle = (sw: number) => 0.42 * sw;
  const kneeBend = (sw: number) => 0.55 * Math.max(0, -sw) + 0.12;

  const leg = (sw: number): Pt[] => {
    const a = legAngle(sw);
    const knee = polar(hip, Math.PI - a, 20);
    const foot = polar(knee, Math.PI - a + kneeBend(sw), 20);
    return [hip, knee, [foot[0], Math.min(foot[1], 96)]];
  };

  const arm = (sw: number): Pt[] => {
    const a = 0.5 * sw;
    const elbow = polar(neck, Math.PI - a, 13);
    const hand = polar(elbow, Math.PI - a - 0.35, 12);
    return [neck, elbow, hand];
  };

  const smokingArm: Pt[] = [neck, [58, 44 - bounce], [55, 33 - bounce]];
  const sitHip: Pt = [50, 66];

  const strokes: string[] = [];
  if (pose === "sit") {
    strokes.push(line([[50, 44], sitHip]));                       // torso
    strokes.push(line([sitHip, [66, 66], [66, 88]]));             // thigh + shin
    strokes.push(line([sitHip, [62, 68], [62, 88]]));
    strokes.push(line([[50, 50], [62, 60]]));                     // arm
  } else {
    strokes.push(line([neck, hip]));
    strokes.push(line(leg(swing)));
    strokes.push(line(leg(swing2)));
    strokes.push(line(arm(swing2)));
    strokes.push(line(pose === "smoke" ? smokingArm : arm(swing)));
  }

  return (
    <svg
      viewBox="0 0 100 100"
      width={height}
      height={height}
      style={{
        position: "absolute",
        left: x,
        top: y - height + bob,
        overflow: "visible",
        transform: `translate(-50%, 0) scale(${facing}, 1)`,
        transformOrigin: "50% 100%",
        opacity,
      }}
    >
      <circle
        cx={headC[0]}
        cy={headC[1]}
        r={8.5}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
      />
      {strokes.map((d, i) => (
        <path
          key={i}
          d={d}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
      {pose === "smoke" && (
        <circle cx={55 + wobble(seed, 0.4)} cy={32} r={1.8} fill={LAMP} />
      )}
    </svg>
  );
};

/** A cat padding across, legs alternating and the tail swaying. */
export const Cat: React.FC<{
  x: number; y: number; height: number; phase?: number;
  facing?: 1 | -1; color?: string; strokeWidth?: number; opacity?: number;
}> = ({ x, y, height, phase = 0, facing = 1, color = NIGHT_INK, strokeWidth = 3, opacity = 1 }) => {
  const p = phase % 1;
  const a = Math.sin(p * Math.PI * 2) * 5;
  const b = Math.sin(p * Math.PI * 2 + Math.PI) * 5;
  const tail = Math.sin(p * Math.PI * 2 * 0.5) * 10;
  return (
    <svg
      viewBox="0 0 100 100"
      width={height * 1.6}
      height={height}
      style={{
        position: "absolute", left: x, top: y - height, overflow: "visible",
        transform: `translate(-50%, 0) scale(${facing}, 1)`, transformOrigin: "50% 100%", opacity,
      }}
    >
      <path d="M 24 72 Q 26 52 44 52 Q 66 52 68 72" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <circle cx={74} cy={50} r={11} fill="none" stroke={color} strokeWidth={strokeWidth} />
      <path d="M 66 42 L 63 31 L 72 38 M 82 42 L 85 31 L 76 38" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d={`M 32 72 L ${32 + a} 90 M 44 72 L ${44 + b} 90 M 58 72 L ${58 + a} 90 M 66 72 L ${66 + b} 90`} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d={`M 24 70 Q ${10 + tail} ${62 + tail * 0.4} ${16 + tail} ${44 + tail * 0.3}`} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
};

/** Smoke rising from a point. */
export const Smoke: React.FC<{
  x: number; y: number; t: number; height?: number; color?: string; opacity?: number;
}> = ({ x, y, t, height = 260, color = NIGHT_INK, opacity = 0.4 }) => {
  const puffs = 5;
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      {Array.from({ length: puffs }).map((_, i) => {
        const age = ((t * 0.35 + i / puffs) % 1);
        const yy = y - age * height;
        const r = 6 + age * 26;
        return (
          <circle
            key={i}
            cx={x + Math.sin(age * 5 + i) * 18 * age}
            cy={yy}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={2}
            opacity={opacity * (1 - age)}
          />
        );
      })}
    </svg>
  );
};

/** A warm pool of light under a lamp. */
export const GlowPool: React.FC<{
  x: number; y: number; radius: number; strength?: number; color?: string;
}> = ({ x, y, radius, strength = 1, color = LAMP }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: radius * 2,
      height: radius * 1.1,
      transform: "translate(-50%, -50%)",
      background: `radial-gradient(ellipse at center, ${color}${Math.round(
        Math.min(0.55 * strength, 1) * 255
      )
        .toString(16)
        .padStart(2, "0")} 0%, transparent 70%)`,
      filter: "blur(18px)",
      pointerEvents: "none",
    }}
  />
);

/** A block of flats whose windows wake up with the music. */
export const WindowGrid: React.FC<{
  x: number; y: number; width: number; height: number;
  cols?: number; rows?: number; energy?: number; seed?: number;
  color?: string; lit?: string; strokeWidth?: number; opacity?: number;
}> = ({
  x, y, width, height, cols = 4, rows = 6, energy = 0, seed = 1,
  color = NIGHT_DIM, lit = WINDOW_LIGHT, strokeWidth = 2.4, opacity = 1,
}) => {
  const wW = width / (cols * 2 + 1);
  const wH = height / (rows * 2 + 1);
  return (
    <svg
      style={{ position: "absolute", left: x, top: y, overflow: "visible", opacity }}
      width={width}
      height={height}
    >
      <rect x={0} y={0} width={width} height={height} fill="none" stroke={color} strokeWidth={strokeWidth} />
      {Array.from({ length: rows }).map((_, r) =>
        Array.from({ length: cols }).map((__, c) => {
          const k = r * cols + c;
          const on = (Math.abs(Math.sin((seed * 31 + k) * 12.9898)) % 1) < 0.34 + energy * 0.3;
          return (
            <rect
              key={k}
              x={wW * (c * 2 + 1)}
              y={wH * (r * 2 + 1)}
              width={wW}
              height={wH}
              fill={on ? lit : "none"}
              opacity={on ? 0.75 : 1}
              stroke={color}
              strokeWidth={strokeWidth * 0.8}
            />
          );
        })
      )}
    </svg>
  );
};

/** A lamppost that actually casts light. */
export const Lamppost: React.FC<{
  x: number; y: number; height: number; color?: string; strokeWidth?: number; glow?: number;
}> = ({ x, y, height, color = NIGHT_INK, strokeWidth = 3.4, glow = 1 }) => (
  <>
    <GlowPool x={x + height * 0.1} y={y} radius={height * 0.42} strength={glow} />
    <svg
      viewBox="0 0 100 100"
      width={height * 0.6}
      height={height}
      style={{ position: "absolute", left: x, top: y - height, overflow: "visible", transform: "translate(-50%, 0)" }}
    >
      <path d="M 50 100 L 50 22 Q 50 10 66 10 L 78 10" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M 70 10 L 86 10 L 82 24 L 74 24 Z" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round" />
      <path d="M 42 100 L 58 100" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  </>
);
