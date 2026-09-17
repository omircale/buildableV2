# Supplier study: hayozrim.com (היוצרים בהתאמה אישית)

Captured 2026-09-15 from the `ProductConfigurator` data embedded in each product page, plus live checks of the calculator.
Engine snapshot: `src/engine/suppliers/hayozrim.ts`.

## How ordering works on the site

One product page per board type (material + thickness). Per line the customer sets:

| Field | Values |
|---|---|
| רוחב (width) | 10–240 cm, **whole cm only** (`step=1`) — the long side |
| עומק/אורך (depth/length) | 10–120 cm, whole cm — the short side |
| גוון (decor) | per product, e.g. 8 Formica decors for sandwich 17 mm |
| מיקום הקנטים (edge banding) | only on some products: none / all round / one width / one depth / width+depth / width+2×depth |
| תוספות | back panels: nails (50 = ₪7, 100 = ₪10); shelf products: hangers, metal brackets |
| כמות | quantity |

There is no grain-direction field, no drilling, no CNC, no file upload, no multi-part cart import.

## Pricing (verified against the live calculator)

- Material = max(₪50, width_m × depth_m × price per m²) — 80×30 cm sandwich: ₪64.80
- Edge banding = ₪7 per running metre of chosen edges — all round on 80×30: ₪15.40
- Shipping shown as ₪50; lead time 2–15 business days; pickup in Beit She'an; no returns after production; cancel within 30 minutes.

## Board catalog (price per m²)

| Product | Thickness | Decors / price | Edge | kg/m² |
|---|---|---|---|---|
| בירץ' 12 / 16 / 18 / 24 | 12/16/18/24 | ליבנה גלוי 165 / 325 / 285 / 650 | — | 8.4 / 10.9 / 12.6 / 16.8 |
| סנדוויץ' 17 | 17 | 8 Formica decors, 270 | ✓ | 9.5 |
| סיבית מלמין 17 | 17 | לבן מט 250 | ✓ | 11.5 |
| סיבית מלמין 28 | 28 | white/black/light grey 585 | ✓ | 19 |
| MDF חום / ירוק 17 | 17 | 208 | — | 12.2 / 13.1 |
| בירץ' פורמייקה 28 — טבעי | 28 | 5 plain 910, oak decors 1040 | ✓ | 20.8 |
| בירץ' פורמייקה 28 — גימור קנטים | 28 | 5 plain 936, oak decors 1066 | included | 20.8 |
| בוצ'ר אלון 26 | 26 | אלון גלוי 1521 | — | 18.7 |
| Backs: דיקט 5.5 פורמייקה / דיקט 4 / מזונית 3.5 | | 104 / 78 / 78 | — | 4.4 / 2.4 / 3.3 |

Excluded from the designer: OSB 10 mm (too thin for edge screws), birch 6 mm, pine slats (linear, pickup only), hidden `birch-16mm` (₪260, duplicate of ₪325 product).

## What changed in Buildable

1. **Supplier layer** (PRD §9, §36): catalog products become materials; density comes from the supplier's kg/m².
2. **Whole-centimetre geometry**: ordered parts are floored to 10 mm and the carcass is built around them
   (800 mm requested → 796 mm built). Validation shows actual vs requested and offers "lock actual dimensions".
   Dividers/plinth that cannot absorb the difference are reported with the exact gap.
3. **Order screen**: one row per supplier form line (product, decor, width cm, depth cm, edge option, qty, price), totals,
   items to buy elsewhere (screws, wall anchors), copy-to-clipboard text for manual entry.
4. **Supplier checks** (export-blocking): size limits, 10 cm minimum (e.g. an 8 cm plinth), whole cm, decor exists,
   edge banding offered for that product.
5. **Engineering honesty**: birch/MDF/melamine borrow reference data but are capped at YELLOW until the supplier confirms
   grade; sandwich 17, birch-Formica 28 and butcher oak have no data → GREY, with fixes to orderable products that pass.

## Open questions for the supplier

1. Board specs: birch plywood grade/ply count/standard; melamine board class (P2/P4); MDF standard; sandwich core. Datasheets would lift YELLOW/GREY.
2. Grain: along which dimension is the face grain cut? Can it be specified in order notes?
3. Edge banding: material (PVC/ABS/melamine) and thickness; is the part cut undersize to compensate?
4. Is the ₪50 minimum per piece or per line? Is ₪50 shipping flat per order, or by weight/size/region?
5. Are prices VAT-inclusive?
6. Cutting tolerance ("up to 1 mm") — plus or minus?
7. The 28 mm natural-finish product description says width 15–55 cm while the form allows 10–120 — which is right?
8. Two birch 16 mm products at ₪260 and ₪325 per m² — which is current?
9. Is there a bulk/B2B channel (CSV, API, email order) for multi-part orders, drilling (shelf pins, System 32) or CNC?
10. Largest source sheet size, and whether backs wider than 120 cm can be ordered in one piece.
