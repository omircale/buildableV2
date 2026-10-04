import type { Bom } from '../manufacturing/bom';
import { getMaterial } from '../materials';
import type { FurnitureModel, Material, ValidationReport } from '../types';
import type { BoqLine, LineLocation, Trade } from './line';

/**
 * The joinery and worktop chapters, from a design the engine already validated.
 *
 * This is the one part of a hotel bill this engine can quantify *and* stand behind, because it is the
 * part it designs: the boards come from a real cutting list, the edge banding from the parts' own edge
 * flags, the ironmongery from the rules that placed it. Every figure here already carries a basis.
 *
 * Two things it is careful about. A design with a blocking failure still produces lines, but the caller
 * is handed the failures and cannot print the bill without having seen them — quantities for a carcass
 * that sags are worse than no quantities. And a sheet count worked out from a sheet size nobody
 * confirmed is reported as a real number resting on a stated assumption, not as a fact.
 *
 * What is missing is the grouping convention of a real Israeli joinery bill — whether a bar is one
 * `קומפ'` line with the boards behind it, or a line per material. Both are produced below and the
 * choice waits on an actual document.
 */

/** The part of a `DesignResult` a bill is built from. Taken structurally to keep the barrel acyclic. */
export interface DesignForBill {
  model: FurnitureModel;
  bom: Bom;
  report: ValidationReport;
}

export interface DesignLinesInput {
  design: DesignForBill;
  location: LineLocation;
  /** Names the piece in the bill — "יחידת בר אחורית". Falls back to the template's own name. */
  titleHe?: string;
  titleEn?: string;
  /** What the room is called by the people who use it. Falls back to the space id, which is internal. */
  placeHe?: string;
  placeEn?: string;
}

export interface DesignLinesResult {
  lines: BoqLine[];
  /**
   * Blocking validation failures on the design these lines were taken from. Non-empty means the bill
   * describes something that does not stand up, and nothing downstream should print it as if it does.
   */
  blockedBy: { id: string; title: string; explanation: string }[];
}

/** Boards belong to the joinery chapter; stone, steel and solid surface are a different trade. */
function tradeFor(material: Material | undefined): Trade {
  if (!material) return 'joinery';
  return material.category === 'stone' || material.category === 'stainless_steel' || material.category === 'solid_surface' ? 'worktops' : 'joinery';
}

export function linesFromDesign({ design, location, titleHe, titleEn, placeHe, placeEn }: DesignLinesInput): DesignLinesResult {
  const { model, bom, report } = design;
  const lines: BoqLine[] = [];
  const nameHe = titleHe ?? model.params.template;
  const nameEn = titleEn ?? model.params.template;

  // The piece itself, as a bill names it. The boards below are what a contractor prices it from.
  lines.push({
    id: 'joinery_unit',
    trade: 'joinery',
    section: 'units',
    descriptionHe: `${nameHe} — יחידה מושלמת לפי פרט, כולל הרכבה במקום.`,
    descriptionEn: `${nameEn} — complete unit to detail, including fitting on site.`,
    unit: 'lump',
    quantity: 1,
    location,
    origin: { kind: 'part', ref: 'model' },
    unitPriceIls: null,
    sources: [],
  });

  for (const sheet of bom.sheets) {
    const material = getMaterial(sheet.materialId);
    lines.push({
      id: `board_${sheet.materialId}_${sheet.thicknessMm}_${sheet.sheetSize}`,
      trade: tradeFor(material),
      section: 'boards',
      descriptionHe: `${sheet.materialName}, עובי ${sheet.thicknessMm} מ"מ, גיליון ${sheet.sheetSize} מ"מ. פחת ${sheet.wastePercent}% לפי סידור החיתוך.`,
      descriptionEn: `${sheet.materialName}, ${sheet.thicknessMm} mm, ${sheet.sheetSize} mm sheet. ${sheet.wastePercent}% waste from the nesting.`,
      unit: 'unit',
      quantity: sheet.sheets,
      // A sheet count is only as good as the sheet size it was nested on.
      assumptionHe: sheet.sizeIsAssumption ? 'מספר הגיליונות חושב על מידת גיליון שלא אושרה על ידי הספק — ייתכן הפרש של גיליון.' : undefined,
      assumptionEn: sheet.sizeIsAssumption ? 'The sheet count was worked out on a sheet size the supplier has not confirmed — it may be out by one sheet.' : undefined,
      location,
      origin: { kind: 'part', ref: sheet.materialId },
      unitPriceIls: null,
      sources: material?.densityKgM3.sources ?? [],
    });

    if (material?.requiresSubstrate) {
      // A stainless worktop is a skin on a carrier board. One line would understate weight and cost by
      // roughly the ratio of the two thicknesses.
      lines.push({
        id: `substrate_${sheet.materialId}`,
        trade: 'worktops',
        section: 'substrates',
        descriptionHe: `לוח נשיאה תחת ${sheet.materialName}. ${material.requiresSubstrate.reasonHe}`,
        descriptionEn: `Carrier board under ${sheet.materialName}. ${material.requiresSubstrate.reasonEn}`,
        unit: 'm2',
        quantity: null,
        unknownReasonHe: 'עובי וסוג לוח הנשיאה לא נמסרו במקור שנבדק, ולכן לא ניתן לכמת אותו כאן.',
        unknownReasonEn: 'The carrier board’s thickness and type were not stated in the source that was checked, so it cannot be quantified here.',
        location,
        origin: { kind: 'part', ref: sheet.materialId },
        unitPriceIls: null,
        sources: material.requiresSubstrate.sources,
      });
    }
  }

  for (const band of bom.edgeBanding) {
    lines.push({
      id: 'edge_banding',
      trade: 'joinery',
      section: 'edge_banding',
      descriptionHe: 'הדבקת קנט.',
      descriptionEn: 'Edge banding.',
      unit: 'm',
      quantity: band.lengthM,
      assumptionHe: band.basis,
      assumptionEn: band.basis,
      location,
      origin: { kind: 'part', ref: 'edges' },
      unitPriceIls: null,
      sources: [],
    });
  }

  for (const hw of bom.hardware) {
    lines.push({
      id: `hardware_${hw.id}`,
      trade: 'joinery',
      section: 'ironmongery',
      descriptionHe: `${hw.name} — ${hw.spec}.`,
      descriptionEn: `${hw.name} — ${hw.spec}.`,
      unit: 'unit',
      quantity: hw.quantity,
      assumptionHe: hw.basis,
      assumptionEn: hw.basis,
      location,
      origin: { kind: 'part', ref: hw.id },
      unitPriceIls: null,
      sources: [],
    });
  }

  // Weight decides whether a unit goes up in the service lift or up a stair, which is a real cost.
  lines.push({
    id: 'haulage_mass',
    trade: 'logistics',
    section: 'haulage',
    descriptionHe: `הובלה והעלאה של ${nameHe} אל ${placeHe || location.spaceId}, קומה ${location.levelId}.`,
    descriptionEn: `Haulage and lifting of ${nameEn} to ${placeEn || location.spaceId}, level ${location.levelId}.`,
    unit: 'kg',
    quantity: bom.totalMassKg,
    unknownReasonHe: bom.totalMassKg == null ? 'לא לכל החומרים ביחידה יש צפיפות מהימנה, ולכן המשקל אינו מחושב.' : undefined,
    unknownReasonEn: bom.totalMassKg == null ? 'Not every material in this unit has a reliable density, so the weight is not computed.' : undefined,
    assumptionHe: bom.totalMassKg != null ? 'משקל החומר בלבד — אינו כולל אריזה, מסגרות או ציוד הרמה.' : undefined,
    assumptionEn: bom.totalMassKg != null ? 'Material weight only — excludes packaging, frames and lifting equipment.' : undefined,
    location,
    origin: { kind: 'part', ref: 'mass' },
    unitPriceIls: null,
    sources: [],
  });

  // A Check's title and explanation are already in the locale the design was run in.
  const blockedBy = report.checks.filter((c) => c.status === 'RED').map((c) => ({ id: c.id, title: c.title, explanation: c.explanation }));

  return { lines, blockedBy };
}
