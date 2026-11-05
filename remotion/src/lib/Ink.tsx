/**
 * Abstract ink elements that react to the music: a hand-drawn waveform, rings
 * that expand on every beat, blots on the kick, and a column of strokes driven
 * by the spectrum. Nothing here needs artwork — the picture is generated.
 */
import React from "react";
import { BRAND, wobble } from "./brand";

/** A line across the frame whose shape follows an array of values. */
export const InkWave: React.FC<{
  values: number[];
  width: number;
  height: number;
  y: number;
  amplitude?: number;
  color?: string;
  strokeWidth?: number;
  seed?: number;
  opacity?: number;
}> = ({
  values, width, height, y, amplitude = 180,
  color = BRAND.ink, strokeWidth = 4, seed = 0, opacity = 1,
}) => {
  const n = Math.max(values.length, 2);
  const step = width / (n - 1);
  let d = "";
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const v = values[i] ?? 0;
    const yy = y - (v - 0.5) * amplitude + wobble(seed * 31 + i, 3);
    if (i === 0) d += `M ${x.toFixed(1)} ${yy.toFixed(1)}`;
    else {
      const px = (i - 1) * step;
      const mx = (px + x) / 2;
      d += ` Q ${px.toFixed(1)} ${(y - ((values[i - 1] ?? 0) - 0.5) * amplitude).toFixed(1)} ${mx.toFixed(1)} ${((yy + (y - ((values[i - 1] ?? 0) - 0.5) * amplitude)) / 2).toFixed(1)}`;
    }
  }
  return (
    <svg
      width={width}
      height={height}
      style={{ position: "absolute", left: 0, top: 0, overflow: "visible", opacity }}
    >
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
};

/** Rings that leave the centre on every beat and fade as they grow. */
export const BeatRings: React.FC<{
  beats: number[];
  t: number;
  cx: number;
  cy: number;
  maxRadius?: number;
  life?: number;
  color?: string;
  strokeWidth?: number;
}> = ({ beats, t, cx, cy, maxRadius = 700, life = 1.6, color = BRAND.marker, strokeWidth = 3 }) => {
  const live = beats.filter((b) => b <= t && t - b < life);
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      {live.map((b, i) => {
        const age = (t - b) / life;
        const r = 40 + age * maxRadius;
        return (
          <ellipse
            key={`${b}-${i}`}
            cx={cx + wobble(i * 13, 6)}
            cy={cy + wobble(i * 17, 6)}
            rx={r}
            ry={r * (0.94 + 0.06 * Math.sin(i))}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth * (1 - age * 0.6)}
            opacity={Math.max(0, 0.5 * (1 - age))}
          />
        );
      })}
    </svg>
  );
};

/** An irregular ink blot — a splash of colour on a hit. */
export const Blot: React.FC<{
  x: number; y: number; r: number; seed?: number; color?: string; opacity?: number;
}> = ({ x, y, r, seed = 1, color = BRAND.red, opacity = 1 }) => {
  const pts = 13;
  let d = "";
  for (let i = 0; i <= pts; i++) {
    const a = (i / pts) * Math.PI * 2;
    const rr = r * (1 + wobble(seed * 7 + i, 0.22));
    const px = x + Math.cos(a) * rr;
    const py = y + Math.sin(a) * rr * 0.92;
    d += i === 0 ? `M ${px.toFixed(1)} ${py.toFixed(1)}` : ` L ${px.toFixed(1)} ${py.toFixed(1)}`;
  }
  d += " Z";
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible", opacity }}>
      <path d={d} fill={color} />
    </svg>
  );
};

/** A row of short strokes whose length follows the spectrum. */
export const InkBars: React.FC<{
  values: number[];
  x: number;
  y: number;
  width: number;
  maxHeight?: number;
  color?: string;
  strokeWidth?: number;
  seed?: number;
}> = ({ values, x, y, width, maxHeight = 240, color = BRAND.ink, strokeWidth = 7, seed = 2 }) => {
  const n = Math.max(values.length, 1);
  const step = width / n;
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      {values.map((v, i) => {
        const h = 14 + Math.pow(Math.max(0, Math.min(1, v)), 0.8) * maxHeight;
        const px = x + i * step + step / 2 + wobble(seed * 5 + i, 2);
        return (
          <line
            key={i}
            x1={px}
            y1={y}
            x2={px + wobble(seed * 11 + i, 3)}
            y2={y - h}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            opacity={0.35 + 0.55 * v}
          />
        );
      })}
    </svg>
  );
};

/** A horizon the drawings can stand on. */
export const GroundLine: React.FC<{
  y: number; width: number; color?: string; strokeWidth?: number; seed?: number;
}> = ({ y, width, color = BRAND.ink, strokeWidth = 4, seed = 9 }) => {
  let d = `M 0 ${y}`;
  const steps = 12;
  for (let i = 1; i <= steps; i++) {
    const x = (width / steps) * i;
    d += ` L ${x.toFixed(1)} ${(y + wobble(seed * 3 + i, 4)).toFixed(1)}`;
  }
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" opacity={0.75} />
    </svg>
  );
};

/** A distant row of blocks along the horizon — depth without detail. */
export const Skyline: React.FC<{
  y: number;
  width: number;
  progress?: number;
  color?: string;
  opacity?: number;
  seed?: number;
}> = ({ y, width, progress = 1, color = BRAND.ink, opacity = 0.22, seed = 4 }) => {
  const blocks = React.useMemo(() => {
    const out: { x: number; w: number; h: number; win: number }[] = [];
    let x = -40;
    let i = 0;
    while (x < width + 40) {
      const w = 90 + ((i * 37) % 70);
      const h = 120 + ((i * 53) % 190);
      out.push({ x, w, h, win: i % 3 });
      x += w + 8;
      i++;
    }
    return out;
  }, [width]);

  return (
    <svg
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: opacity * progress }}
    >
      {blocks.map((b, i) => (
        <g key={i}>
          <path
            d={`M ${b.x} ${y} L ${b.x} ${y - b.h} L ${b.x + b.w} ${y - b.h + wobble(seed + i, 5)} L ${b.x + b.w} ${y}`}
            fill="none"
            stroke={color}
            strokeWidth={2.6}
            strokeLinejoin="round"
          />
          {Array.from({ length: 3 }).map((_, k) => {
            const wy = y - b.h + 34 + k * 44;
            if (wy > y - 18) return null;
            return (
              <rect
                key={k}
                x={b.x + 18 + (b.win % 2) * 10}
                y={wy}
                width={18}
                height={22}
                fill="none"
                stroke={color}
                strokeWidth={1.8}
              />
            );
          })}
        </g>
      ))}
    </svg>
  );
};
