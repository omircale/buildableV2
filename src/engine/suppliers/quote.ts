import { addonName, productTitle, tr } from '../i18n';
import { getMaterial, supplierProductFor } from '../materials';
import { isOpenShelf, type FurnitureModel, type HardwareLine, type Part } from '../types';
import type { Supplier, SupplierEdgeOption, SupplierProduct } from './types';

export interface QuoteLine {
  partId: string;
  partName: string;
  productTitleHe: string;
  /** Product title in the engine locale of the run that produced the quote. */
  productTitle: string;
  productUrl: string;
  finishId: string;
  /** Supplier form fields, in centimetres. */
  widthCm: number; // long side
  depthCm: number; // short side
  edgeOption: SupplierEdgeOption | null;
  quantity: number;
  unitMaterialIls: number;
  unitEdgeIls: number;
  unitIls: number;
  lineIls: number;
  issues: string[];
  /** Locale-independent kind of each entry in `issues` (same order). */
  issueCodes: QuoteIssueCode[];
}

export type QuoteIssueCode = 'finish_missing' | 'too_large' | 'too_small' | 'not_whole_cm' | 'edge_unavailable';

export interface SupplierQuote {
  supplier: Supplier;
  lines: QuoteLine[];
  /** `name` / `productTitle` are in the engine locale of the run; the Hebrew fields are kept for compatibility. */
  addons: { nameHe: string; productTitleHe: string; name: string; productTitle: string; ils: number }[];
  materialsIls: number;
  edgesIls: number;
  addonsIls: number;
  shippingIls: number;
  totalIls: number;
  notAvailable: HardwareLine[];
  issues: string[];
  assumptions: string[];
}

const money = (v: number) => Math.round(v * 100) / 100;

/** Maps the banded edges of a part onto the supplier's fixed edge options (width = long side, depth = short side). */
export function matchEdgeOption(part: Part, product: SupplierProduct): { option: SupplierEdgeOption | null; issue?: string } {
  const long = Number(part.edges.long1) + Number(part.edges.long2);
  const short = Number(part.edges.short1) + Number(part.edges.short2);
  if (long === 0 && short === 0) return { option: product.edgeBanding?.options.find((o) => o.id === 'none') ?? null };
  if (!product.edgeBanding) return { option: null, issue: tr(`קנט אינו זמין ל${product.titleHe}`, `Edge banding is not available for ${productTitle(product, 'en')}`) };
  const option = product.edgeBanding.options.find((o) => o.edges.filter((e) => e === 'width').length === long && o.edges.filter((e) => e === 'depth').length === short);
  return option ? { option } : { option: null, issue: tr('שילוב הקנטים המבוקש אינו זמין — ניתן: ללא, צלע ארוכה אחת, או מסביב', 'The requested edge banding combination is not available — options: none, one long edge, or all round') };
}

/**
 * Pricing verified against the live configurator on 2026-09-15:
 *   material = max(minimum per piece, width_m × depth_m × price per m²)
 *   edges    = banded length in metres × price per metre
 * e.g. sandwich 17 mm, 80×30 cm, edges all round: 64.80 + 15.40 = ₪80.20.
 */
export function quotePart(part: Part, product: SupplierProduct): Omit<QuoteLine, 'partName'> {
  const issues: string[] = [];
  const issueCodes: QuoteIssueCode[] = [];
  const add = (code: QuoteIssueCode, text: string) => {
    issueCodes.push(code);
    issues.push(text);
  };
  const finish = product.finishes.find((f) => f.id === part.finishId);
  if (!finish) add('finish_missing', tr(`הגוון "${part.finishId}" לא קיים במוצר זה`, `The finish "${part.finishId}" does not exist for this product`));
  const pricePerSqm = finish?.pricePerSqm ?? product.finishes[0]?.pricePerSqm ?? 0;

  const longMm = Math.max(part.lengthMm, part.widthMm);
  const shortMm = Math.min(part.lengthMm, part.widthMm);
  const { limits } = product;
  if (longMm > limits.maxLongMm || shortMm > limits.maxShortMm) add('too_large', tr(`גדול מהמקסימום לחיתוך (${limits.maxLongMm / 10}×${limits.maxShortMm / 10} ס"מ)`, `Larger than the maximum cut size (${limits.maxLongMm / 10}×${limits.maxShortMm / 10} cm)`));
  if (longMm < limits.minLongMm || shortMm < limits.minShortMm) add('too_small', tr(`קטן מהמינימום לחיתוך (${limits.minShortMm / 10} ס"מ)`, `Smaller than the minimum cut size (${limits.minShortMm / 10} cm)`));
  if (limits.stepMm && (longMm % limits.stepMm !== 0 || shortMm % limits.stepMm !== 0)) add('not_whole_cm', tr('המידה אינה בס"מ שלמים', 'The size is not in whole centimetres'));

  const { option, issue } = matchEdgeOption(part, product);
  if (issue) add('edge_unavailable', issue);

  const unitMaterialIls = money(Math.max(product.minPricePerPiece, (longMm / 1000) * (shortMm / 1000) * pricePerSqm));
  const edgeMm = (option?.edges ?? []).reduce((a, e) => a + (e === 'width' ? longMm : shortMm), 0);
  const unitEdgeIls = money((edgeMm / 1000) * (product.edgeBanding?.pricePerMeter ?? 0));
  const unitIls = money(unitMaterialIls + unitEdgeIls);
  return {
    partId: part.id,
    productTitleHe: product.titleHe,
    productTitle: productTitle(product),
    productUrl: product.url,
    finishId: part.finishId,
    widthCm: longMm / 10,
    depthCm: shortMm / 10,
    edgeOption: option,
    quantity: part.quantity,
    unitMaterialIls,
    unitEdgeIls,
    unitIls,
    lineIls: money(unitIls * part.quantity),
    issues,
    issueCodes,
  };
}

export function buildSupplierQuote(model: FurnitureModel): SupplierQuote | null {
  const body = supplierProductFor(getMaterial(model.params.materialId));
  if (!body) return null;
  const { supplier } = body;
  const lines: QuoteLine[] = [];
  const issues: string[] = [];
  for (const part of model.parts) {
    const sp = supplierProductFor(getMaterial(part.materialId));
    if (!sp || sp.supplier.id !== supplier.id) {
      issues.push(tr(`${part.id} (${part.name}): החומר אינו זמין להזמנה יחד עם שאר הלוחות`, `${part.id} (${part.name}): the material cannot be ordered together with the other boards`));
      continue;
    }
    lines.push({ ...quotePart(part, sp.product), partName: part.name });
  }

  const addons: SupplierQuote['addons'] = [];
  const p = model.params;
  if (isOpenShelf(p) && p.hasBack && p.backNails !== 'none') {
    const back = supplierProductFor(getMaterial(p.backMaterialId));
    const nails = back?.product.nails?.find((n) => n.id === p.backNails);
    if (back && nails) addons.push({ nameHe: nails.nameHe, productTitleHe: back.product.titleHe, name: addonName(nails), productTitle: productTitle(back.product), ils: nails.price });
  }

  const materialsIls = money(lines.reduce((a, l) => a + l.unitMaterialIls * l.quantity, 0));
  const edgesIls = money(lines.reduce((a, l) => a + l.unitEdgeIls * l.quantity, 0));
  const addonsIls = money(addons.reduce((a, x) => a + x.ils, 0));
  const shippingIls = supplier.shippingIls.amount;
  return {
    supplier,
    lines,
    addons,
    materialsIls,
    edgesIls,
    addonsIls,
    shippingIls,
    totalIls: money(materialsIls + edgesIls + addonsIls + shippingIls),
    notAvailable: model.hardware.filter((h) => h.id !== 'back_fixing' || !isOpenShelf(p) || p.backNails === 'none'),
    issues: [...issues, ...lines.flatMap((l) => l.issues.map((i) => `${l.partId}: ${i}`))],
    assumptions: [
      tr('מחיר מינימום לכל חתיכה (הנחה שמרנית)', 'Minimum price per piece (conservative assumption)'),
      tr('משלוח: סכום קבוע משוער', 'Shipping: estimated flat amount'),
      tr('המחיר משוער ועשוי להשתנות', 'The price is an estimate and may change'),
    ],
  };
}
