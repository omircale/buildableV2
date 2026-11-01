# Engineering data and sources

Every value below is used by the engine (`src/engine/materials.ts`, `src/engine/config.ts`).
Value kinds: **mean**, **characteristic** (5th percentile), **standard minimum** (product-standard requirement, conservative),
**assumption** (product decision, not a physical claim).

Some standard texts were read from unofficial copies; spot-check against purchased editions before relying on them commercially.

## Materials

| Material | Thickness | E bending (MPa) | f_m (MPa) | Density (kg/m³) | Source |
|---|---|---|---|---|---|
| MDF general purpose, dry | >12–19 mm | 2,200 standard min | 20 standard min | 800 **assumption** | EN 622-5:2009 Table 3 |
| MDF general purpose, dry | >19–30 mm | 2,100 standard min | 18 standard min | 800 **assumption** | EN 622-5:2009 Table 3 |
| Particleboard P2 | >13–20 mm | 1,600 standard min | 11 standard min | 750 **assumption** | EN 312:2010 Table 3 |
| Birch plywood, 13-ply, parallel to face grain | 18 mm | 10,048 mean | 40.2 characteristic | 680 mean | Handbook of Finnish Plywood (Koskisen), Tables 3-1/3-2 |
| Softwood C24 | any | 11,000 mean | 24 characteristic | 420 mean | EN 338:2003 Table 1 (E, f_m match 2016) |
| Softwood C16 | any | 8,000 mean | 16 characteristic | 370 mean | EN 338:2003 Table 1 |
| Hardwood D30 | any | 10,000 mean | 30 characteristic | 640 mean | EN 338:2003 Table 1 (2016 edition may differ — unverified) |

Birch plywood thicknesses other than 18 mm have **no** strength data in the system and report GREY.
Stock sheet sizes are assumptions until confirmed with Israeli suppliers (PRD §34).

## Eurocode 5 factors (EN 1995-1-1:2004+A1:2008, service class 1)

| Class | k_def (Table 3.2) | k_mod long-term (Table 3.1) | γ_M (Table 2.3) |
|---|---|---|---|
| Solid timber | 0.60 | 0.70 | 1.3 |
| Plywood | 0.80 | 0.70 | 1.2 |
| OSB/3 | 1.50 | 0.50 | 1.2 |
| Particleboard P4/P5 | 2.25 | 0.45 | 1.3 |
| Particleboard P6/P7 | 1.50 | 0.50 | 1.3 |
| MDF.LA | 2.25 | 0.40 | 1.3 |

Plain MDF and particleboard P2 are **not covered** by EC5. The engine borrows MDF.LA / P4 factors *by analogy*
and caps their structural status at YELLOW.

## Checks

- Deflection: simply supported beam (conservative), UDL `5wL⁴/384EI` or central point load `PL³/48EI`, plus self-weight.
- Creep: `δ_fin = δ_inst · (1 + k_def)`, whole load treated as quasi-permanent (ψ₂ = 1, conservative).
- Limits (admin-configurable, product decision within EC5 Table 7.2 range L/150–L/300 for w_fin):
  GREEN ≤ L/300, YELLOW ≤ L/150, RED > L/150.
- Bending strength: `σ = γ·M/W ≤ k_mod·f_m,k/γ_M`, γ = 1.5 on all loads (EN 1990 γ_Q, applied conservatively to self-weight too).
- Not calculated (reported GREY): connection strength, tip-over stability.

## Shelf test standards (not implemented as pass criteria)

EN 16122 §6.1.4 shelf deflection test is reported by CATAS to use 1.0–1.5 kg/dm² with max deflection 0.5% of span;
the table extraction was ambiguous and the standard itself was not read. The system therefore never claims compliance
and always requires physical verification.

## Sources

- EN 622-5:2009 — https://www.choobeno.com/wp-content/uploads/2019/12/BSI-BS-EN-622-5.pdf
- EN 312:2010 preview — https://cdn.standards.iteh.ai/samples/32825/f503d7326937419baa76fe3ab40205d0/SIST-EN-312-2011.pdf
- Handbook of Finnish Plywood — https://koskisen.fi/wp-content/uploads/materials/HandBook-of-Koskisen-Plywood.pdf
- EN 338:2003 — http://higiene.unex.es/Bibliogr/ISO_BS_USDA/ISO_BS/BS%20EN/BS%20EN%2000338-2003.pdf
- EN 338:2016 excerpt — https://www.dataholz.eu/fileadmin/dataholz/media/baustoffe/Datenblaetter_en/vh_en_01.pdf
- EN 1995-1-1 — https://gaprojekt.com/wp-content/uploads/2021/11/Eurocode-5-Design-of-timber-structures.pdf
- CATAS furniture test comparison — https://catas.com/uploads/media/catas-tabellanormemobilieng.pdf
- Beam formulas — https://calcresource.com/statics-simple-beam-deflections.html

## Corrections to earlier AI-generated drafts

These values from the earlier Gemini conversation were **not** used:

- MDF E = 2,300–3,000 MPa → sourced minimum is 2,200 (≤19 mm).
- Particleboard E = 2,000 → P2 minimum is 1,600.
- Birch plywood E = 8,500 / 5,500 / oak plywood 3,200 → 10,048 mean for 18 mm.
- Fail threshold "L/175 or 5 mm" → no source; replaced by configurable L/150 within EC5 range.
- "EN 14749 load 1.5×10⁻³ kg/mm²", "anchoring above 1000 mm", "75 N" → not verified; not used.
- Aluminium edge "+15% stiffness" and rib "×1.85" factors → invented; not used.
- Deflection ignored creep entirely → MDF/particleboard long-term sag is 3.25× the instantaneous value.
