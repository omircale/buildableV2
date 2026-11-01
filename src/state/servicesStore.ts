import { create } from 'zustand';
import type { SpaceProgram } from '../engine/services/demand';
import { POOL_BAR_EXAMPLE } from '../engine/services/programs';
import { onOwnerChange, ownedKey } from './owner';

/**
 * The space on the equipment screen: its name, whether it is closed, and what it holds. Kept on this
 * device under whoever is signed in. Only the program is kept; everything shown is worked out from it.
 */

const STORAGE_BASE = 'buildable.services.v1';

const copy = (p: SpaceProgram): SpaceProgram => ({ ...p, lines: p.lines.map((l) => ({ ...l })) });

function load(): SpaceProgram {
  try {
    const raw = localStorage.getItem(ownedKey(STORAGE_BASE));
    if (!raw) return copy(POOL_BAR_EXAMPLE);
    const p = JSON.parse(raw) as Partial<SpaceProgram>;
    return {
      name: typeof p.name === 'string' ? p.name : '',
      enclosed: p.enclosed === true || p.enclosed === false ? p.enclosed : null,
      lines: Array.isArray(p.lines) ? p.lines.filter((l) => l && typeof l.equipmentId === 'string' && Number.isInteger(l.count)) : [],
    };
  } catch {
    return copy(POOL_BAR_EXAMPLE);
  }
}

interface ServicesState extends SpaceProgram {
  setName: (name: string) => void;
  setEnclosed: (enclosed: boolean | null) => void;
  addLine: (equipmentId: string) => void;
  setCount: (index: number, count: number) => void;
  setProduct: (index: number, productId: string | null) => void;
  removeLine: (index: number) => void;
  replace: (program: SpaceProgram) => void;
}

export const useServices = create<ServicesState>((set, get) => {
  const keep = (patch: Partial<SpaceProgram>) => {
    set(patch);
    const { name, enclosed, lines } = get();
    try {
      localStorage.setItem(ownedKey(STORAGE_BASE), JSON.stringify({ name, enclosed, lines }));
    } catch {
      // Storage refused: the screen still works; it is just not kept.
    }
  };
  const lines = () => get().lines;
  return {
    ...load(),
    setName: (name) => keep({ name }),
    setEnclosed: (enclosed) => keep({ enclosed }),
    // The same item again is one more of it, not a second line.
    addLine: (equipmentId) => {
      const i = lines().findIndex((l) => l.equipmentId === equipmentId && !l.productId);
      keep({ lines: i >= 0 ? lines().map((l, j) => (j === i ? { ...l, count: Math.min(999, l.count + 1) } : l)) : [...lines(), { equipmentId, count: 1 }] });
    },
    setCount: (index, count) => keep({ lines: lines().map((l, j) => (j === index ? { ...l, count: Math.max(1, Math.min(999, Math.round(count))) } : l)) }),
    setProduct: (index, productId) => keep({ lines: lines().map((l, j) => (j === index ? { ...l, productId } : l)) }),
    removeLine: (index) => keep({ lines: lines().filter((_, j) => j !== index) }),
    replace: (program) => keep(copy(program)),
  };
});

onOwnerChange(() => useServices.setState(load()));
