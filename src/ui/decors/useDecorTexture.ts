import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { useUi } from '../../state/uiStore';

/**
 * A per-part copy of the finish texture: the tile keeps a real-world size on each board, and the pattern runs
 * along the part instead of looking identical everywhere. Clones share the decoded image, so this is cheap.
 */
export function decorTiling(sizeMm: { x: number; y: number; z: number }, grainAxis?: 'x' | 'y' | 'z'): { repeat: [number, number]; rotation: number } {
  const faces = [sizeMm.x, sizeMm.y, sizeMm.z].map((mm) => mm / 1000).sort((a, b) => b - a);
  return {
    // The two largest extents are the visible face; a tile never gets smaller than a third of the swatch,
    // so small parts keep a readable pattern instead of a single stretched pixel.
    repeat: [Math.max(0.35, faces[0] / TILE_M), Math.max(0.35, faces[1] / TILE_M)],
    // Upright parts (sides, posts) carry the grain vertically, as a real board would be cut.
    rotation: grainAxis === 'y' ? Math.PI / 2 : 0,
  };
}

export function usePartDecorTexture(base: THREE.Texture | null, sizeMm: { x: number; y: number; z: number }, grainAxis?: 'x' | 'y' | 'z'): THREE.Texture | null {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);
  const key = `${base?.uuid ?? ''}|${sizeMm.x}x${sizeMm.y}x${sizeMm.z}|${grainAxis ?? ''}`;
  useEffect(() => {
    if (!base) {
      setTexture(null);
      return;
    }
    const t = base.clone();
    t.needsUpdate = true;
    const { repeat, rotation } = decorTiling(sizeMm, grainAxis);
    t.repeat.set(repeat[0], repeat[1]);
    t.rotation = rotation;
    t.center.set(0.5, 0.5);
    setTexture(t);
    return () => t.dispose();
    // The key covers every input that changes the mapping.
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return texture;
}

/** Roughly how many metres of real surface one tile of the swatch photo covers. */
export const TILE_M = 0.4;

/**
 * Loads the previewed catalogue finish as a repeating texture. Returns null when nothing is previewed, so the
 * model falls back to its ordered decor colour. Textures are disposed when the preview changes.
 */
export function useDecorTexture(): THREE.Texture | null {
  const preview = useUi((s) => s.decorPreview);
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    if (!preview) {
      setTexture(null);
      return;
    }
    let cancelled = false;
    let loaded: THREE.Texture | null = null;
    new THREE.TextureLoader().load(
      preview.image,
      (t) => {
        if (cancelled) {
          t.dispose();
          return;
        }
        t.colorSpace = THREE.SRGBColorSpace;
        t.wrapS = THREE.RepeatWrapping;
        t.wrapT = THREE.RepeatWrapping;
        t.anisotropy = 8;
        loaded = t;
        setTexture(t);
      },
      undefined,
      () => !cancelled && setTexture(null),
    );
    return () => {
      cancelled = true;
      loaded?.dispose();
      setTexture(null);
    };
  }, [preview]);

  return texture;
}
