import type { Check, DesignParams } from '../engine';
import { isOpenShelf } from '../engine';
import type { EditorTab } from '../state/uiStore';

/**
 * Where a finding is fixed.
 *
 * A finding that only names a problem leaves the person to hunt for the control that causes it. The
 * tools that handle this well close that gap: Onshape outlines the offending field, Shapr3D's repair
 * card highlights the geometry. This maps each check to the tab and section that governs it, so a
 * click on a finding lands on the control rather than near it.
 *
 * Section ids are the ones the control panels already register with `Section`.
 */
export interface CheckTarget {
  tab: EditorTab;
  /** The section to scroll to and ring, or null when the tab alone is the answer. */
  sectionId: string | null;
}

export function targetForCheck(check: Check, p: DesignParams): CheckTarget | null {
  const [category, rule] = check.id.split('.');

  // A check that names an added component belongs to the component library, not to the carcass.
  if (check.id.startsWith('connections.drawer_runner')) return { tab: 'addons', sectionId: null };

  const shelf = isOpenShelf(p);
  const size = shelf ? 'size' : `${p.template}-size`;
  const build = shelf ? 'division' : `${p.template}-build`;

  switch (category) {
    case 'materials':
      return { tab: rule === 'back' || rule === 'back_finish' ? 'look' : 'structure', sectionId: rule.startsWith('back') ? 'back' : 'board' };
    case 'geometry':
      // Too many shelves, too little room, a gap that traps: all of them are the division of the piece.
      return { tab: 'structure', sectionId: rule === 'order_step' || rule === 'oversize' ? size : build };
    case 'structure':
    case 'stability':
      return { tab: 'structure', sectionId: rule === 'no_load' || rule === 'skipped' ? 'load' : size };
    case 'manufacturing':
      return { tab: 'structure', sectionId: rule === 'supplier' || rule === 'nesting' ? 'board' : size };
    case 'safety':
      return { tab: 'structure', sectionId: shelf ? build : `${p.template}-safety` };
    case 'connections':
      return { tab: 'structure', sectionId: build };
    default:
      return null;
  }
}

/**
 * Where the control for a parameter lives.
 *
 * Undo has to show its own result: Apple's rule is that if what changed is out of sight, bring it
 * into sight, or the person believes nothing happened and undoes again. In a parametric editor the
 * thing that changed is a field, and the field may be on another tab entirely.
 */
export function targetForParam(key: string, p: DesignParams): CheckTarget {
  const shelf = isOpenShelf(p);
  if (key === 'addons') return { tab: 'addons', sectionId: null };
  if (key.startsWith('finish') || key === 'edgeOption' || key.startsWith('role') || key.startsWith('part') || key.startsWith('back')) {
    return { tab: 'look', sectionId: null };
  }
  if (key === 'materialId' || key === 'thicknessMm') return { tab: 'structure', sectionId: 'board' };
  if (key.startsWith('load') || key === 'loadPerShelf') return { tab: 'structure', sectionId: 'load' };
  if (/^(width|height|depth)Mm$/.test(key) || key.startsWith('mattress')) {
    return { tab: 'structure', sectionId: shelf ? 'size' : `${p.template}-size` };
  }
  return { tab: 'structure', sectionId: shelf ? 'division' : `${p.template}-build` };
}

/** The first parameter that differs between two versions of a design. */
export function firstChangedKey(before: DesignParams, after: DesignParams): string | null {
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  for (const k of keys) {
    const a = (before as unknown as Record<string, unknown>)[k];
    const b = (after as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(a) !== JSON.stringify(b)) return k;
  }
  return null;
}
