import { create } from 'zustand';
import type { Sector } from '../engine';
import { onOwnerChange, ownedKey } from './owner';

/**
 * A branch template: what a standard branch of the chain holds.
 *
 * A chain opens the same branch again and again. The template is that branch written down once — its
 * kind of place and its equipment — so a new property starts from it instead of from an empty room.
 * Kept per account, in this browser.
 */
export interface BranchTemplate {
  id: string;
  name: string;
  sector: Sector | 'all';
  /** An id appears once per unit, as in a room. */
  equipmentIds: string[];
  /** True for the ones the app ships with. They are examples to replace, not the chain's real list. */
  example?: boolean;
  /** What the room the template fills is called. */
  roomName?: string;
}

/**
 * An example of a restaurant branch kitchen, so the screen is not empty before a chain has saved its
 * own. The composition is invented for the example and says so; it is not a standard of any kind.
 */
export const EXAMPLE_TEMPLATE: BranchTemplate = {
  id: 'example_restaurant',
  name: 'דוגמה: מטבח סניף מסעדה',
  sector: 'restaurant',
  example: true,
  equipmentIds: [
    'range_gas',
    'oven_combi_electric',
    'fryer_gas',
    'griddle_gas',
    'extraction_hood',
    'dishwasher_commercial',
    'prep_sink_double',
    'hand_wash_basin',
    'hand_wash_basin',
    'upright_fridge',
    'upright_freezer',
    'prep_counter_refrigerated',
    'espresso_machine',
    'pos_terminal',
    'pos_terminal',
  ],
};

const BASE = 'buildable.templates.v1';

function load(): BranchTemplate[] {
  try {
    const raw = localStorage.getItem(ownedKey(BASE));
    const list = raw ? (JSON.parse(raw) as Partial<BranchTemplate>[]) : [];
    return list.filter((t): t is BranchTemplate => typeof t.id === 'string' && typeof t.name === 'string' && Array.isArray(t.equipmentIds));
  } catch {
    return [];
  }
}

interface TemplateState {
  /** The account's own templates. The example is not stored; it is added by `allTemplates`. */
  templates: BranchTemplate[];
  saveTemplate: (t: Omit<BranchTemplate, 'id' | 'example'>) => string;
  removeTemplate: (id: string) => void;
}

export const useTemplates = create<TemplateState>((set, get) => {
  const persist = (templates: BranchTemplate[]) => {
    set({ templates });
    try {
      localStorage.setItem(ownedKey(BASE), JSON.stringify(templates));
    } catch {
      // Storage blocked: the template lasts for this session.
    }
  };
  return {
    templates: load(),
    saveTemplate: (t) => {
      const id = `tpl_${Date.now().toString(36)}`;
      // Saving a template under a name that exists replaces it: a chain updates its standard, it does not keep two.
      persist([{ ...t, id }, ...get().templates.filter((x) => x.name.trim() !== t.name.trim())]);
      return id;
    },
    removeTemplate: (id) => persist(get().templates.filter((t) => t.id !== id)),
  };
});

/**
 * An example of a typical hotel guest room and its bathroom. Set it once, then say how many identical
 * rooms there are. The composition is invented for the example; a hotel's own standard replaces it.
 */
export const HOTEL_ROOM_TEMPLATE: BranchTemplate = {
  id: 'example_hotel_room',
  name: 'דוגמה: חדר אירוח טיפוסי',
  sector: 'hotel',
  example: true,
  roomName: 'חדר אירוח',
  equipmentIds: [
    'wc',
    'vanity_basin',
    'shower',
    'bathroom_exhaust_fan',
    'mirror_light',
    'hair_dryer',
    'fan_coil',
    'bedside_station',
    'guest_desk',
    'guest_tv',
    'minibar',
    'room_safe',
    'key_card_switch',
    'room_board',
    'guest_coffee',
  ],
};

/** The account's templates, then the examples. */
export function allTemplates(own: BranchTemplate[]): BranchTemplate[] {
  return [...own, EXAMPLE_TEMPLATE, HOTEL_ROOM_TEMPLATE];
}

onOwnerChange(() => useTemplates.setState({ templates: load() }));
