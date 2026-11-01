import { create } from 'zustand';
import { onOwnerChange, ownedKey } from './owner';

/**
 * Which saved project the open survey is, if any.
 *
 * The survey itself knows nothing about accounts. This is the thread between the two: the project in
 * the account that the rooms on screen were opened from or saved to, and the moment they last matched.
 */
export interface CurrentBill {
  id: string;
  name: string;
  placeId: string | null;
  /** The survey's own `updatedAt` at the moment it was last saved to, or opened from, the account. */
  savedAt: number;
}

const BASE = 'buildable.bill.current.v1';

function load(): CurrentBill | null {
  try {
    const raw = localStorage.getItem(ownedKey(BASE));
    const parsed = raw ? (JSON.parse(raw) as Partial<CurrentBill>) : null;
    return parsed && typeof parsed.id === 'string' && typeof parsed.name === 'string' ? { id: parsed.id, name: parsed.name, placeId: parsed.placeId ?? null, savedAt: Number(parsed.savedAt) || 0 } : null;
  } catch {
    return null;
  }
}

export const useAccount = create<{ current: CurrentBill | null; setCurrent: (current: CurrentBill | null) => void }>((set) => ({
  current: load(),
  setCurrent: (current) => {
    set({ current });
    try {
      if (current) localStorage.setItem(ownedKey(BASE), JSON.stringify(current));
      else localStorage.removeItem(ownedKey(BASE));
    } catch {
      // Storage blocked: the link lasts for this session only.
    }
  },
}));

onOwnerChange(() => useAccount.setState({ current: load() }));
