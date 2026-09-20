import * as THREE from 'three';
import { getMaterial, supplierProductFor, type Component, type DesignResult } from '../../engine';
import { finishFor } from '../../engine';

const MM = 0.001;

export interface ExportSceneOptions {
  /** Include items that are shown for context but never built (mattress, steel bar). */
  includeReference?: boolean;
  projectName?: string;
}

/** Colour a component is shown in, resolved the same way as the 3D view (part override → part type → body decor). */
export function exportColor(c: Component, result: DesignResult): string {
  if (c.reference) return c.role === 'mattress' ? '#ece7de' : '#9aa1a6';
  const p = result.model.params;
  if (p.finish.type === 'painted' || p.finish.type === 'stained') return p.finish.color;
  const material = getMaterial(c.materialId);
  const decor = supplierProductFor(material)?.product.finishes.find((f) => f.id === finishFor(c, p));
  return decor?.color ?? material?.defaultColor ?? '#cccccc';
}

const ROUGHNESS = { gloss: 0.15, satin: 0.45, matte: 0.85 } as const;

/**
 * Builds the scene that gets exported to AR formats, from the model alone — not from the live canvas.
 * That keeps it deterministic and testable, and leaves out everything that belongs to the editor
 * (grid, floor, dimension labels, highlights).
 *
 * Real-world scale: millimetres become metres, so the piece appears at 1:1 in AR. The model is centred on
 * its footprint with its base at y = 0, which is where AR apps place it on the floor.
 */
export function buildExportScene(result: DesignResult, options: ExportSceneOptions = {}): THREE.Group {
  const { includeReference = true } = options;
  const { model } = result;
  const { x: W, z: D } = model.overall;
  const group = new THREE.Group();
  group.name = (options.projectName || 'Buildable').replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'Buildable';

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const sheen = model.params.finish.sheen;

  for (const c of model.components) {
    if (c.reference && !includeReference) continue;
    const color = exportColor(c, result);
    const key = `${color}|${c.reference ? 'ref' : sheen}`;
    let material = materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: new THREE.Color(color),
        roughness: c.reference ? 0.9 : ROUGHNESS[sheen],
        metalness: 0,
      });
      material.name = c.reference ? `reference-${c.role}` : `${finishFor(c, model.params)}`;
      materials.set(key, material);
    }
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(c.size.x * MM, c.size.y * MM, c.size.z * MM), material);
    // Centred on the footprint, base on the ground: how AR viewers expect a model to arrive.
    mesh.position.set((c.origin.x + c.size.x / 2 - W / 2) * MM, (c.origin.y + c.size.y / 2) * MM, (c.origin.z + c.size.z / 2 - D / 2) * MM);
    if (c.rotationZDeg) mesh.rotation.z = (c.rotationZDeg * Math.PI) / 180;
    const part = model.parts.find((p) => p.componentIds.includes(c.id));
    mesh.name = [c.id, part?.id].filter(Boolean).join('-');
    mesh.userData = { name: c.name, ...(part ? { partId: part.id, cutMm: [part.lengthMm, part.widthMm, part.thicknessMm] } : { reference: true }) };
    group.add(mesh);
  }

  group.userData = {
    project: options.projectName ?? '',
    template: model.params.template,
    overallMm: [model.overall.x, model.overall.y, model.overall.z],
    parts: model.parts.reduce((a, p) => a + p.quantity, 0),
    massKg: result.bom.totalMassKg,
  };
  return group;
}

/** Frees the geometries and materials of a scene built for export. */
export function disposeExportScene(group: THREE.Group) {
  group.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) m.dispose();
  });
}
