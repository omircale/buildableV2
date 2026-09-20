import type * as THREE from 'three';
import type { DesignResult } from '../../engine';
import { buildExportScene, disposeExportScene, type ExportSceneOptions } from './exportScene';

export type ArFormat = 'glb' | 'usdz';

/** Which file the current device can open in AR: iPhone/iPad use USDZ (Quick Look), everything else glTF. */
export function preferredFormat(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent): ArFormat {
  const ios = /iPad|iPhone|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && typeof document !== 'undefined' && 'ontouchend' in document);
  return ios ? 'usdz' : 'glb';
}

export const AR_MIME: Record<ArFormat, string> = { glb: 'model/gltf-binary', usdz: 'model/vnd.usdz+zip' };

/** glTF binary — Android Scene Viewer, model-viewer, Blender, and most 3D tools. */
export async function exportGlb(scene: THREE.Object3D): Promise<ArrayBuffer> {
  const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
  const result = await new GLTFExporter().parseAsync(scene, { binary: true, onlyVisible: true, includeCustomExtensions: false });
  return result as ArrayBuffer;
}

/**
 * USDZ — Apple AR Quick Look: the zipped USDZ archive bytes. Anchored to a horizontal plane (furniture stands
 * on the floor) and written in the Quick Look compatible flavour, which is stricter than plain USD.
 */
export async function exportUsdz(scene: THREE.Object3D): Promise<Uint8Array> {
  const { USDZExporter } = await import('three/examples/jsm/exporters/USDZExporter.js');
  return new USDZExporter().parseAsync(scene, {
    ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } },
    includeAnchoringProperties: true,
    quickLookCompatible: true,
  });
}

export interface ArFile {
  format: ArFormat;
  filename: string;
  blob: Blob;
  bytes: number;
}

/** Builds the export scene, writes one AR file from it and releases the scene. */
export async function exportArFile(result: DesignResult, format: ArFormat, options: ExportSceneOptions = {}): Promise<ArFile> {
  const scene = buildExportScene(result, options);
  try {
    const data: BlobPart = format === 'usdz' ? new Uint8Array(await exportUsdz(scene)) : await exportGlb(scene);
    const blob = new Blob([data], { type: AR_MIME[format] });
    const base = (options.projectName || 'buildable').replace(/[\\/:*?"<>|]/g, '-').trim() || 'buildable';
    return { format, filename: `${base}.${format}`, blob, bytes: blob.size };
  } finally {
    disposeExportScene(scene);
  }
}
