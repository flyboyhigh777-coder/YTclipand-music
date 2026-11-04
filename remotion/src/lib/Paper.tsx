/** Scrapbook pieces: paper stock, tape, polaroid frame, torn strips, marker strokes. */
import React from "react";
import { AbsoluteFill, interpolate } from "remotion";
import {
  BRAND, FONT_HAND, FONT_MONO, arrowHead, handArrowPath, handEllipsePath, wobble,
} from "./brand";

/** Warm paper stock with fibre speckle. Static on purpose — paper does not crawl. */
export const Paper: React.FC<{ tint?: string }> = ({ tint = BRAND.paper }) => {
  const speckle = React.useMemo(() => {
    const parts: string[] = [];
    for (let i = 0; i < 1400; i++) {
      const x = (Math.sin(i * 7.17) * 0.5 + 0.5) * 300;
      const y = (Math.cos(i * 3.71) * 0.5 + 0.5) * 300;
      const o = 0.03 + ((i * 13) % 7) / 90;
      const s = ((i * 5) % 3) * 0.6 + 0.6;
      parts.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${s.toFixed(1)}" fill="#6b6457" opacity="${o.toFixed(3)}"/>`);
    }
    return parts.join("");
  }, []);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300">${speckle}</svg>`;
  return (
    <AbsoluteFill style={{ backgroundColor: tint }}>
      <AbsoluteFill
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`,
          backgroundRepeat: "repeat",
          opacity: 0.55,
        }}
      />
      {/* uneven lighting across the sheet */}
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(ellipse 78% 58% at 42% 34%, rgba(255,255,255,.5) 0%, rgba(0,0,0,0) 60%), radial-gradient(ellipse 90% 70% at 60% 100%, rgba(90,80,60,.16) 0%, rgba(0,0,0,0) 65%)",
        }}
      />
    </AbsoluteFill>
  );
};

export const Tape: React.FC<{
  x: number; y: number; w?: number; h?: number; rotate?: number; opacity?: number;
}> = ({ x, y, w = 260, h = 78, rotate = -4, opacity = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x, top: y, width: w, height: h,
      transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
      background: `linear-gradient(180deg, ${BRAND.tapeEdge} 0%, ${BRAND.tape} 22%, ${BRAND.tape} 78%, ${BRAND.tapeEdge} 100%)`,
      boxShadow: "0 2px 10px rgba(90,80,60,.22)",
      opacity: 0.92 * opacity,
      mixBlendMode: "multiply",
    }}
  />
);

/** Polaroid frame. The image inside is never altered — only framed. */
export const Polaroid: React.FC<{
  src: string | null;
  width: number;
  rotate?: number;
  children?: React.ReactNode;
  style?: React.CSSProperties;
  pad?: number;
}> = ({ src, width, rotate = 0, children, style, pad }) => {
  const p = pad ?? Math.round(width * 0.045);
  return (
    <div
      style={{
        width,
        padding: `${p}px ${p}px ${Math.round(p * 3.1)}px`,
        backgroundColor: BRAND.photoFrame,
        boxShadow: "0 24px 60px rgba(60,52,38,.34), 0 3px 10px rgba(60,52,38,.22)",
        transform: `rotate(${rotate}deg)`,
        ...style,
      }}
    >
      <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", overflow: "hidden", backgroundColor: "#cfcabb" }}>
        {src ? (
          <img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
        ) : null}
        {children}
      </div>
    </div>
  );
};

/** A strip of paper torn off at both ends, with typewriter text on it. */
export const TornStrip: React.FC<{
  children: React.ReactNode;
  rotate?: number;
  padding?: string;
  style?: React.CSSProperties;
}> = ({ children, rotate = -0.8, padding = "18px 34px", style }) => (
  <div
    style={{
      display: "inline-block",
      position: "relative",
      padding,
      backgroundColor: "#FCFBF7",
      color: BRAND.ink,
      fontFamily: FONT_MONO,
      boxShadow: "0 10px 26px rgba(60,52,38,.26)",
      transform: `rotate(${rotate}deg)`,
      // torn edges, left and right
      clipPath:
        "polygon(1.5% 0%, 98% 2%, 99.4% 22%, 98.2% 52%, 99.6% 78%, 97.4% 100%, 2.4% 98%, 0.6% 74%, 1.8% 46%, 0.4% 20%)",
      ...style,
    }}
  >
    {children}
  </div>
);

/** Blue marker handwriting that draws itself left to right. */
export const HandNote: React.FC<{
  text: string;
  progress: number;          // 0..1, how much is written
  size?: number;
  color?: string;
  rotate?: number;
  style?: React.CSSProperties;
}> = ({ text, progress, size = 62, color = BRAND.marker, rotate = -3, style }) => (
  <div
    style={{
      fontFamily: FONT_HAND,
      fontWeight: 600,
      fontSize: size,
      lineHeight: 1.08,
      color,
      whiteSpace: "pre",
      transform: `rotate(${rotate}deg)`,
      clipPath: `inset(-20% ${(1 - Math.max(0, Math.min(1, progress))) * 100}% -20% -6%)`,
      ...style,
    }}
  >
    {text}
  </div>
);

/** The red circle from the sleeve, drawn on by hand. */
export const MarkerCircle: React.FC<{
  cx: number; cy: number; rx: number; ry: number;
  progress: number; seed?: number; color?: string; width?: number;
}> = ({ cx, cy, rx, ry, progress, seed = 1, color = BRAND.red, width = 7 }) => {
  const d = React.useMemo(() => handEllipsePath(cx, cy, rx, ry, seed), [cx, cy, rx, ry, seed]);
  const len = 2 * Math.PI * Math.sqrt((rx * rx + ry * ry) / 2) * 1.25;
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={len}
        strokeDashoffset={len * (1 - Math.max(0, Math.min(1, progress)))}
        opacity={0.92}
      />
    </svg>
  );
};

export const MarkerArrow: React.FC<{
  x1: number; y1: number; x2: number; y2: number;
  progress: number; color?: string; width?: number; bend?: number; seed?: number;
}> = ({ x1, y1, x2, y2, progress, color = BRAND.marker, width = 6, bend = 0.28, seed = 3 }) => {
  const d = handArrowPath(x1, y1, x2, y2, bend, seed);
  const len = Math.hypot(x2 - x1, y2 - y1) * 1.5;
  const angle = Math.atan2(y2 - y1, x2 - x1) + Math.PI;
  const head = arrowHead(x2, y2, angle, 30);
  const p = Math.max(0, Math.min(1, progress));
  return (
    <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
      <path
        d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
        strokeDasharray={len} strokeDashoffset={len * (1 - p)}
      />
      <path
        d={head} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round"
        opacity={interpolate(p, [0.82, 1], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
    </svg>
  );
};

/** Bottom credit bar: the supplied logo on the left, mono caption on the right. */
export const SleeveFooter: React.FC<{
  logo: string | null;
  caption: string;
  bottom: number;
  logoHeight?: number;
  color?: string;
}> = ({ logo, caption, bottom, logoHeight = 54, color = BRAND.ink }) => (
  <div
    style={{
      position: "absolute",
      left: 72, right: 72, bottom,
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
    }}
  >
    {logo ? (
      // the supplied logo file, placed as-is (rules.md §4.0)
      <img src={logo} style={{ height: logoHeight, objectFit: "contain", mixBlendMode: "multiply" }} />
    ) : (
      // no logo file supplied: show a plain credit rather than imitate the mark
      <span
        style={{
          fontFamily: FONT_MONO, fontWeight: 500, fontSize: 24,
          letterSpacing: "0.16em", textTransform: "uppercase", color, opacity: 0.7,
        }}
      >
        the third stairwell
      </span>
    )}
    <span style={{ fontFamily: FONT_MONO, fontSize: 24, letterSpacing: "0.08em", color, opacity: 0.75 }}>
      {caption}
    </span>
  </div>
);

export const paperShake = (t: number, kick: number) => ({
  transform: `translate(${wobble(Math.floor(t * 4), 2) + kick * 2}px, ${wobble(Math.floor(t * 4) + 99, 2)}px)`,
});

/**
 * Fill a rectangle with the photograph that lives inside the sleeve.
 *
 * A square sleeve letterboxed into 9:16 wastes a third of the screen. Pointing
 * the camera at the photo instead fills the frame. The artwork is not altered —
 * only framed (rules.md §4.0).
 */
export const PhotoFill: React.FC<{
  src: string | null;
  box: { x: number; y: number; w: number; h: number } | null | undefined;
  width: number;
  height: number;
  zoom?: number;
  panX?: number;
  panY?: number;
  style?: React.CSSProperties;
}> = ({ src, box, width, height, zoom = 1, panX = 0, panY = 0, style }) => {
  const b = box ?? { x: 0, y: 0, w: 1, h: 1 };
  // displayed size of the whole (square) sleeve so that the box covers w x h
  const d = Math.max(width / b.w, height / b.h) * zoom;
  const left = -(b.x * d) - (b.w * d - width) / 2 + panX;
  const top = -(b.y * d) - (b.h * d - height) / 2 + panY;
  return (
    <div style={{ position: "relative", width, height, overflow: "hidden", backgroundColor: "#c9c4b6", ...style }}>
      {src && (
        <img
          src={src}
          style={{
            position: "absolute",
            width: d,
            height: d,
            left,
            top,
            maxWidth: "none",
            display: "block",
          }}
        />
      )}
    </div>
  );
};

/**
 * A sub-rectangle of the photo box: zoom `z` around the point (fx, fy), where
 * (0,0) is the photo's top-left and (1,1) its bottom-right. Used to cut between
 * details — the doorway, the lamp, the two on the bench — without ever touching
 * the artwork file.
 */
export const subBox = (
  box: { x: number; y: number; w: number; h: number } | null | undefined,
  z: number,
  fx: number,
  fy: number
) => {
  const b = box ?? { x: 0, y: 0, w: 1, h: 1 };
  const zz = Math.max(1, z);
  const w = b.w / zz;
  const h = b.h / zz;
  const x = Math.min(Math.max(b.x + fx * b.w - w / 2, b.x), b.x + b.w - w);
  const y = Math.min(Math.max(b.y + fy * b.h - h / 2, b.y), b.y + b.h - h);
  return { x, y, w, h };
};
