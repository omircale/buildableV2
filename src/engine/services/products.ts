import type { Source } from '../types';
import { blankSpec, fact, unknown, type ProductSpec } from './spec';

/**
 * Models read from their makers' data sheets. A model here is an example of what the data looks like
 * and how the engine uses it, not a choice: which models the project buys is the operator's and the
 * supplier's to say.
 */

const UGOLINI_NG: Source = {
  title: 'Ugolini — NG slush machine spec sheet (Caratteristiche tecniche / Technical characteristics)',
  reference: 'technical table: power W, gas, bowls, capacity, width, depth, height, weight; available voltages',
  url: 'https://cdn.shopify.com/s/files/1/1753/9017/files/NG-Slush-Machine-Spec-Sheet.pdf',
};

const NG_NOT_STATED = {
  water: { he: 'בדף הנתונים אין חיבור מים. "לא כתוב" אינו "אין" — לאשר מול הספק.', en: 'The sheet lists no water connection. Not stated is not "none": confirm with the supplier.' },
  drain: { he: 'בדף הנתונים אין חיבור ניקוז. "לא כתוב" אינו "אין" — לאשר מול הספק.', en: 'The sheet lists no drain connection. Not stated is not "none": confirm with the supplier.' },
  current: { he: 'בדף מופיע הספק ולא זרם. הזרם כתוב על תווית הנתונים של המכונה.', en: 'The sheet gives power, not current. Current is on the unit’s data plate.' },
  phases: { he: 'בדף כתוב 230V 50Hz בלי מספר הפאזות. לאשר מול תווית הנתונים.', en: 'The sheet gives 230 V 50 Hz without the number of phases. Confirm on the data plate.' },
  heat: {
    he: 'בדף מוזכר פאנל נשלף לניקוי המעבה, כלומר יש מעבה — אבל לא כתוב אם הוא מקורר אוויר וכמה חום הוא פולט.',
    en: 'The sheet mentions a removable panel for cleaning the condenser, so it has one, but not whether it is air cooled or how much heat it gives off.',
  },
  circuit: { he: 'בדף לא כתוב אם צריך מעגל ייעודי; החשמלאי מחליט.', en: 'The sheet does not say whether it needs a dedicated circuit; the electrician decides.' },
};

function ng(model: string, row: { powerW: number; widthCm: number; depthCm: number; heightCm: number; netKg: number | null }): ProductSpec {
  const s = blankSpec(`ugolini_${model.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`, 'slush_machine', 'Ugolini', model, UGOLINI_NG);
  return {
    ...s,
    size: { widthMm: fact(row.widthCm * 10, UGOLINI_NG), depthMm: fact(row.depthCm * 10, UGOLINI_NG), heightMm: fact(row.heightCm * 10, UGOLINI_NG) },
    massKg:
      row.netKg === null
        ? unknown({ he: 'את המשקל נטו של הדגם הזה לא ניתן היה לקרוא מהדף.', en: 'The net weight of this model could not be read from the sheet.' })
        : fact(row.netKg, UGOLINI_NG, { he: 'משקל נטו', en: 'net weight' }),
    water: { ...s.water, required: unknown(NG_NOT_STATED.water) },
    drain: { ...s.drain, required: unknown(NG_NOT_STATED.drain) },
    electrical: {
      voltageV: fact(230, UGOLINI_NG, { he: 'הגרסה ל-230V 50Hz; בדף מופיעים גם מתחים אחרים', en: 'the 230 V 50 Hz version; the sheet lists other voltages too' }),
      frequencyHz: fact(50, UGOLINI_NG),
      phases: unknown(NG_NOT_STATED.phases),
      powerW: fact(row.powerW, UGOLINI_NG, { he: 'כפי שמופיע עבור 240V 50Hz ו-230V 50Hz', en: 'stated for 240 V 50 Hz and 230 V 50 Hz' }),
      currentA: unknown(NG_NOT_STATED.current),
      dedicatedCircuit: unknown(NG_NOT_STATED.circuit),
    },
    heat: { condenser: unknown(NG_NOT_STATED.heat), toRoomW: unknown(NG_NOT_STATED.heat) },
  };
}

export const PRODUCTS: ProductSpec[] = [
  ng('NG 6-1', { powerW: 420, widthCm: 20, depthCm: 48, heightCm: 62, netKg: null }),
  ng('NG 6-2', { powerW: 700, widthCm: 40, depthCm: 48, heightCm: 62, netKg: 44 }),
  ng('NG 6-3', { powerW: 896, widthCm: 60, depthCm: 48, heightCm: 62, netKg: 56 }),
  ng('NG 10-1', { powerW: 510, widthCm: 20, depthCm: 50, heightCm: 70, netKg: 28 }),
  ng('NG 10-2', { powerW: 740, widthCm: 40, depthCm: 50, heightCm: 70, netKg: 45 }),
];

export const productById = (id: string) => PRODUCTS.find((p) => p.id === id);
