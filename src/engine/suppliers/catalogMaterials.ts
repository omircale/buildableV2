import type { Material, ThicknessProperties } from '../types';
import type { Supplier, SupplierProduct } from './types';

export const supplierMaterialId = (supplierId: string, handle: string) => `${supplierId}:${handle}`;

/**
 * Turns orderable supplier products into engine materials.
 * Mechanical properties are borrowed only from a reference material that has published values for the
 * product's exact thickness; density comes from the supplier's weight per m².
 */
export function buildSupplierMaterials(supplier: Supplier, reference: (id: string) => Material | undefined): Material[] {
  return supplier.products.map((p) => toMaterial(supplier, p, reference));
}

function toMaterial(supplier: Supplier, p: SupplierProduct, reference: (id: string) => Material | undefined): Material {
  const ref = p.engineering ? reference(p.engineering.referenceMaterialId) : undefined;
  const refProps = ref?.properties.find((x) => p.thicknessMm > x.minMm && p.thicknessMm <= x.maxMm);
  const properties: ThicknessProperties[] = refProps ? [{ ...refProps, minMm: p.thicknessMm - 0.01, maxMm: p.thicknessMm }] : [];
  // End users never see supplier identity; admin traces the value through the supplier catalog.
  const source = {
    title: `קטלוג החומרים — ${p.titleHe}`,
    reference: `משקל ${p.weightKgPerSqm} ק"ג/מ"ר לפי נתוני היצרן`,
    titleEn: `Materials catalogue — ${p.titleEn ?? p.handle}`,
    referenceEn: `Weight ${p.weightKgPerSqm} kg/m² per manufacturer data`,
  };
  return {
    id: supplierMaterialId(supplier.id, p.handle),
    nameHe: p.titleHe,
    nameEn: p.titleEn ?? p.handle,
    descriptionHe: p.descriptionHe,
    descriptionEn: p.descriptionEn,
    category: ref?.category ?? 'custom',
    ec5Class: ref?.ec5Class ?? 'not_covered',
    ec5AnalogyClass: ref?.ec5AnalogyClass,
    thicknessesMm: [p.thicknessMm],
    densityKgM3: { value: Math.round((p.weightKgPerSqm / (p.thicknessMm / 1000)) * 10) / 10, kind: 'supplier', sources: [source] },
    properties,
    structuralUse: p.role === 'board',
    hasGrain: p.hasGrain,
    stock: [{ lengthMm: 2440, widthMm: 1220, kind: 'assumption', note: 'נחתך לפי מידה (עד 240×120 ס"מ); מידת לוח מקור משוערת', noteEn: 'Cut to size (up to 240×120 cm); source sheet size is estimated' }],
    defaultColor: p.finishes[0]?.color ?? '#cccccc',
    verified: properties.length > 0,
    supplier: { supplierId: supplier.id, handle: p.handle, role: p.role },
    equivalence: p.engineering && refProps ? { referenceMaterialId: p.engineering.referenceMaterialId, confirmed: p.engineering.confirmed, noteHe: p.engineering.noteHe, noteEn: p.engineering.noteEn } : undefined,
  };
}
