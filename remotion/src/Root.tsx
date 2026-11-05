import React from "react";
import "./lib/fonts";
import { Composition } from "remotion";
import { demoProps, type ClipProps } from "./schema";
import { CoverPulse } from "./templates/CoverPulse";
import { LyricFocus } from "./templates/LyricFocus";
import { Spectrum } from "./templates/Spectrum";
import { GlitchCut } from "./templates/GlitchCut";
import { Vinyl3D } from "./templates/Vinyl3D";
import { Sheet } from "./templates/Sheet";
import { Marker } from "./templates/Marker";
import { ZineCut } from "./templates/ZineCut";
import { Stairwell3D } from "./templates/Stairwell3D";
import { InkPulse } from "./templates/InkPulse";
import { InkScene } from "./templates/InkScene";
import { NightYard } from "./templates/NightYard";
import { StreetWalk } from "./templates/StreetWalk";

/** Duration, size and fps all come from clip.json (rules.md §7.1). */
const metadata = ({ props }: { props: ClipProps }) => ({
  durationInFrames: Math.max(1, props.clip?.frames ?? demoProps.clip.frames),
  fps: props.clip?.fps ?? 30,
  width: props.clip?.width ?? 1080,
  height: props.clip?.height ?? 1920,
});

const common = {
  defaultProps: demoProps,
  calculateMetadata: metadata,
  width: 1080,
  height: 1920,
  fps: 30,
  durationInFrames: demoProps.clip.frames,
};

export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="cover-pulse" component={CoverPulse} {...common} />
    <Composition id="lyric-focus" component={LyricFocus} {...common} />
    <Composition id="spectrum" component={Spectrum} {...common} />
    <Composition id="glitch-cut" component={GlitchCut} {...common} />
    <Composition id="vinyl-3d" component={Vinyl3D} {...common} />

    {/* th3rd. — scrapbook language taken from the album artwork */}
    <Composition id="th3rd-sheet" component={Sheet} {...common} />
    <Composition id="th3rd-marker" component={Marker} {...common} />
    <Composition id="th3rd-zine" component={ZineCut} {...common} />
    <Composition id="th3rd-stairwell" component={Stairwell3D} {...common} />

    {/* generated visuals — no artwork needed */}
    <Composition id="ink-pulse" component={InkPulse} {...common} />
    <Composition id="ink-scene" component={InkScene} {...common} />

    {/* dark cartoons with animated characters */}
    <Composition id="night-yard" component={NightYard} {...common} />
    <Composition id="street-walk" component={StreetWalk} {...common} />
  </>
);
