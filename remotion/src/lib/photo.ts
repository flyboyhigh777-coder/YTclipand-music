/**
 * Which image to use for the photograph, and which crop box goes with it.
 *
 * When the pipeline has pre-cut and upscaled the photo (cover.photoFile), that
 * file *is* the photograph, so the box is the whole image. Otherwise we fall
 * back to the sleeve plus the detected box, trimming the lower part where the
 * sleeve's own caption strip overlaps the print.
 */
import { staticFile } from "remotion";
import type { ClipProps } from "../schema";

export type PhotoSource = {
  src: string | null;
  box: { x: number; y: number; w: number; h: number } | null;
  /** roughly how many source pixels are available across the frame */
  sourceWidth: number;
};

export const photoSource = (props: ClipProps): PhotoSource => {
  if (props.cover.photoFile) {
    return {
      src: staticFile(props.cover.photoFile),
      box: null,
      // the file was upscaled, but only this many real pixels exist in it
      sourceWidth: props.cover.photoSourcePx || 1500,
    };
  }
  const src = props.cover.file ? staticFile(props.cover.file) : null;
  const p = props.cover.photo;
  if (!p) return { src, box: null, sourceWidth: 1024 };
  return {
    src,
    box: { x: p.x, y: p.y, w: p.w, h: p.h * 0.82 },
    sourceWidth: Math.round(p.w * 1024),
  };
};

/**
 * Largest zoom that still looks acceptable: beyond roughly 2x upscaling the
 * picture turns to mush, so a template asks for a zoom and gets what the source
 * can actually carry.
 */
export const safeZoom = (want: number, sourceWidth: number, frameWidth: number): number => {
  const maxUpscale = 2.0;
  const limit = Math.max(1, (sourceWidth * maxUpscale) / frameWidth);
  return Math.max(1, Math.min(want, limit));
};
