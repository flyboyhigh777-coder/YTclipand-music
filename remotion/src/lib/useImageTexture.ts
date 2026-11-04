/**
 * Load an image into a three.js texture without racing the renderer.
 * Remotion only captures a frame once every delayRender() has been released.
 */
import { useEffect, useMemo, useState } from "react";
import { cancelRender, continueRender, delayRender } from "remotion";
import { SRGBColorSpace, Texture } from "three";

export const useImageTexture = (src: string | null): Texture | null => {
  const [texture, setTexture] = useState<Texture | null>(null);
  const handle = useMemo(() => (src ? delayRender(`texture ${src}`) : null), [src]);

  useEffect(() => {
    if (!src || handle === null) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const tex = new Texture(img);
      tex.colorSpace = SRGBColorSpace;
      tex.needsUpdate = true;
      setTexture(tex);
      continueRender(handle);
    };
    img.onerror = () => cancelRender(new Error(`Failed to load texture: ${src}`));
    img.src = src;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [src, handle]);

  return texture;
};
