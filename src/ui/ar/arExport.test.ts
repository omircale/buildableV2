import { describe, expect, it } from 'vitest';
import { DEFAULT_FLOOR_BED, DEFAULT_OPEN_SHELF, runDesign } from '../../engine';
import { FURNITURE_TYPES, presetFor } from '../furnitureCatalog';
import { buildExportScene, exportColor } from './exportScene';
import { exportArFile, exportGlb, exportUsdz, preferredFormat } from './arExport';

const bed = runDesign(DEFAULT_FLOOR_BED);

describe('the scene that gets exported to AR', () => {
  it('is built at real scale in metres, centred, with its base on the ground', () => {
    const scene = buildExportScene(bed, { projectName: 'Bed' });
    const box = scene.children.map((m) => m.position.toArray());
    const { x: W, y: H, z: D } = bed.model.overall;
    // Base on the ground, nothing below it, and the whole piece inside its real height.
    const lowest = Math.min(...scene.children.map((m, i) => m.position.y - (bed.model.components[i].size.y / 2) * 0.001));
    expect(lowest).toBeCloseTo(0, 3);
    expect(Math.max(...scene.children.map((m) => m.position.y))).toBeLessThanOrEqual(H * 0.001);
    // Centred on the footprint: the mean of the extremes is the origin.
    const xs = box.map((p) => p[0]);
    const zs = box.map((p) => p[2]);
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(0, 1);
    expect((Math.min(...zs) + Math.max(...zs)) / 2).toBeCloseTo(0, 1);
    expect(W * 0.001).toBeLessThan(1.5); // a 70 cm mattress bed really is under 1.5 m wide
    expect(D * 0.001).toBeGreaterThan(1.5);
  });

  it('carries part names and cut sizes into the file, and leaves the editor’s helpers out', () => {
    const scene = buildExportScene(bed, { projectName: 'Bed' });
    expect(scene.children).toHaveLength(bed.model.components.length);
    const slat = scene.children.find((m) => m.name.startsWith('slat_1'))!;
    expect(slat.userData.partId).toMatch(/^P\d+$/);
    expect(slat.userData.cutMm).toHaveLength(3);
    expect(scene.userData.massKg).toBe(bed.bom.totalMassKg);
    // No grid, floor, dimension labels or highlights: only the boards and the reference items.
    expect(scene.children.every((c) => (c as { isMesh?: boolean }).isMesh)).toBe(true);
  });

  it('can leave reference items (mattress) out', () => {
    const withRef = buildExportScene(bed);
    const withoutRef = buildExportScene(bed, { includeReference: false });
    expect(withRef.children.length - withoutRef.children.length).toBe(bed.model.components.filter((c) => c.reference).length);
  });

  it('uses the decor colour each part is shown in', () => {
    const r = runDesign({ ...DEFAULT_OPEN_SHELF, materialId: 'hayozrim:shelf-sandwich-17mm', thicknessMm: 17, finishId: 'שחור מט', roleFinishes: { side: 'לבן מט' } });
    const side = r.model.components.find((c) => c.id === 'side_l')!;
    const shelf = r.model.components.find((c) => c.id === 'shelf_1')!;
    expect(exportColor(side, r)).not.toBe(exportColor(shelf, r));
  });
});

describe('AR files', () => {
  it('picks USDZ on iPhone and glTF elsewhere', () => {
    expect(preferredFormat('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe('usdz');
    expect(preferredFormat('Mozilla/5.0 (Linux; Android 14; Pixel 8)')).toBe('glb');
    expect(preferredFormat('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe('glb');
  });

  it('writes a real glTF binary file', async () => {
    const buffer = await exportGlb(buildExportScene(bed, { projectName: 'Bed' }));
    const header = new Uint8Array(buffer.slice(0, 4));
    expect(String.fromCharCode(...header)).toBe('glTF'); // glTF binary magic
    expect(new DataView(buffer).getUint32(4, true)).toBe(2); // version 2
    expect(buffer.byteLength).toBeGreaterThan(1000);
  });

  it('writes a real USDZ archive, anchored to the floor for Quick Look', async () => {
    const bytes = await exportUsdz(buildExportScene(bed, { projectName: 'Bed' }));
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe('PK'); // zip archive
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('model.usda');
    expect(text).toContain('preliminary:anchoring:type = "plane"');
    expect(text).toContain('preliminary:planeAnchoring:alignment = "horizontal"');
  });

  it('exports every catalog item in both formats without error', async () => {
    for (const type of FURNITURE_TYPES.filter((f) => f.available)) {
      const r = runDesign(presetFor(type, { w: null, h: null, d: null })!);
      for (const format of ['glb', 'usdz'] as const) {
        const file = await exportArFile(r, format, { projectName: type.kind });
        expect(file.filename, type.kind).toBe(`${type.kind}.${format}`);
        expect(file.bytes, `${type.kind} ${format}`).toBeGreaterThan(500);
      }
    }
  }, 30000);
});
