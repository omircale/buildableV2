import type { Layer } from '../../engine/studio/model';

/** One colour per system. Colour only tells the systems apart; state is shown by the line itself. */
export const LAYER_COLOR: Record<Layer, string> = { drainage: '#b06a2c', water: '#3b82c4' };
