import type { SpaceProgram } from './demand';

/**
 * Example programs — what a space holds — for trying the engine on the first hotel space we plan:
 * a pool bar, and a slush station in a closed kiosk. The lists are a working example to put in front
 * of a bar operator, not a programme anyone signed: the operator and the F&B consultant decide it.
 */
export const POOL_BAR_EXAMPLE: SpaceProgram = {
  name: 'בר בריכה',
  enclosed: false,
  lines: [
    { equipmentId: 'bar_sink_single', count: 2 },
    { equipmentId: 'bar_tap', count: 2 },
    { equipmentId: 'hand_wash_basin', count: 1 },
    { equipmentId: 'undercounter_fridge', count: 2 },
    { equipmentId: 'ice_maker', count: 1 },
    { equipmentId: 'glasswasher', count: 1 },
    { equipmentId: 'slush_machine', count: 1, productId: 'ugolini_ng_10_2' },
    { equipmentId: 'waste_bin_unit', count: 1 },
  ],
};

export const SLUSH_KIOSK_EXAMPLE: SpaceProgram = {
  name: 'עמדת ברד בקיוסק',
  enclosed: true,
  lines: [
    { equipmentId: 'slush_machine', count: 2, productId: 'ugolini_ng_6_3' },
    { equipmentId: 'hand_wash_basin', count: 1 },
    { equipmentId: 'undercounter_fridge', count: 1 },
  ],
};
