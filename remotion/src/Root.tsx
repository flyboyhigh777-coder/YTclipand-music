import React from "react";
import { Composition } from "remotion";
import { demoProps, type ClipProps } from "./schema";
import { CoverPulse } from "./templates/CoverPulse";
import { LyricFocus } from "./templates/LyricFocus";
import { Spectrum } from "./templates/Spectrum";
import { GlitchCut } from "./templates/GlitchCut";
import { Vinyl3D } from "./templates/Vinyl3D";

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
  </>
);
