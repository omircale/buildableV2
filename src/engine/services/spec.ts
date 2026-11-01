import type { Source } from '../types';

/**
 * What a specific model needs from the building, as its maker publishes it.
 *
 * The catalog (equipment/catalog.ts) knows that a slush machine needs a power point. Only the model
 * knows how much power, at what voltage, and how much heat it puts into the room. This is that second
 * layer: one record per make and model, read from the maker's data sheet.
 *
 * Every figure is a Fact: a value with the place it was read from, or null when the sheet does not
 * say. Null is not zero and not "none" — a sheet that does not mention a drain has not said there is
 * no drain. The engine counts what is known and reports every null it needed.
 */

export interface Fact<T> {
  value: T | null;
  /** Where the value was read. Null only together with a null value. */
  source: Source | null;
  /** Anything a reader must know to use the value: what it is not, or how it was read. */
  note?: string;
}

export const unknown = <T>(note?: string): Fact<T> => ({ value: null, source: null, note });
export const fact = <T>(value: T, source: Source, note?: string): Fact<T> => ({ value, source, note });

export type DrainKind = 'direct' | 'indirect' | 'floor_gully';
export type CondenserKind = 'air' | 'water' | 'remote';

export interface ProductSpec {
  id: string;
  /** The catalog item this model is a choice for. */
  equipmentId: string;
  maker: string;
  model: string;
  /** The data sheet everything below was read from, unless a fact names another source. */
  sheet: Source;
  size: { widthMm: Fact<number>; depthMm: Fact<number>; heightMm: Fact<number> };
  massKg: Fact<number>;
  water: {
    required: Fact<boolean>;
    /** As the sheet writes it, e.g. 3/4" BSP. */
    connection: Fact<string>;
    minPressureBar: Fact<number>;
    maxPressureBar: Fact<number>;
    scaleFilter: Fact<boolean>;
  };
  drain: {
    required: Fact<boolean>;
    kind: Fact<DrainKind>;
    connectionMm: Fact<number>;
    greaseSeparator: Fact<boolean>;
  };
  electrical: {
    voltageV: Fact<number>;
    frequencyHz: Fact<number>;
    phases: Fact<1 | 3>;
    /** Rated input. */
    powerW: Fact<number>;
    /** Rated current from the plate or the sheet — never derived from power, which would ignore power factor. */
    currentA: Fact<number>;
    dedicatedCircuit: Fact<boolean>;
  };
  heat: {
    condenser: Fact<CondenserKind>;
    /** Heat given off into the room, in watts. */
    toRoomW: Fact<number>;
  };
}

/** A blank record for a model: everything unknown until the sheet is read. */
export function blankSpec(id: string, equipmentId: string, maker: string, model: string, sheet: Source): ProductSpec {
  return {
    id,
    equipmentId,
    maker,
    model,
    sheet,
    size: { widthMm: unknown(), depthMm: unknown(), heightMm: unknown() },
    massKg: unknown(),
    water: { required: unknown(), connection: unknown(), minPressureBar: unknown(), maxPressureBar: unknown(), scaleFilter: unknown() },
    drain: { required: unknown(), kind: unknown(), connectionMm: unknown(), greaseSeparator: unknown() },
    electrical: { voltageV: unknown(), frequencyHz: unknown(), phases: unknown(), powerW: unknown(), currentA: unknown(), dedicatedCircuit: unknown() },
    heat: { condenser: unknown(), toRoomW: unknown() },
  };
}

/**
 * What is wrong with a record, if anything: a value without a source, a negative size, a phase count
 * that is not 1 or 3. A record that fails is not used — it is a typing mistake, not a fact.
 */
export function specProblems(spec: ProductSpec): string[] {
  const problems: string[] = [];
  const walk = (path: string, v: unknown) => {
    if (v && typeof v === 'object' && 'value' in v && 'source' in v) {
      const f = v as Fact<unknown>;
      if (f.value !== null && !f.source) problems.push(`${path}: a value without a source`);
      if (f.value === null && f.source) problems.push(`${path}: a source without a value`);
      if (typeof f.value === 'number' && !(Number.isFinite(f.value) && f.value >= 0)) problems.push(`${path}: not a non-negative number`);
      return;
    }
    if (v && typeof v === 'object') for (const [k, child] of Object.entries(v)) walk(path ? `${path}.${k}` : k, child);
  };
  walk('', { size: spec.size, massKg: spec.massKg, water: spec.water, drain: spec.drain, electrical: spec.electrical, heat: spec.heat });
  const phases = spec.electrical.phases.value;
  if (phases !== null && phases !== 1 && phases !== 3) problems.push('electrical.phases: must be 1 or 3');
  const [lo, hi] = [spec.water.minPressureBar.value, spec.water.maxPressureBar.value];
  if (lo !== null && hi !== null && lo > hi) problems.push('water: minimum pressure above maximum');
  if (spec.water.required.value === false && spec.water.connection.value) problems.push('water: a connection on a model that needs none');
  if (spec.drain.required.value === false && spec.drain.kind.value) problems.push('drain: a drain kind on a model that needs none');
  return problems;
}
