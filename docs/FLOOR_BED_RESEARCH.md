# Montessori floor bed — sourced engineering/safety research

Compiled 2026-09-16 for engineering-validation purposes only (not a certification claim). Structured data
mirrors this document at `docs/data/floor-bed-rules.json`.

**Key finding up front: there is no single standard written for a "Montessori floor bed."** It is a hybrid
of a cot (EN 716-1), a bunk/high bed rail system (EN 747-1), a toddler bed (US ASTM F1821 / 16 CFR 1217),
and a generic domestic bed (EN 1725, which explicitly excludes bunk/high beds). Manufacturers pick and choose
which of these they claim to follow. Several primary standard texts are paywalled (EN 716-1, EN 747-1/2,
EN 1725, ASTM F1821); values from them below come from secondary summaries unless marked **primary**, and
should be re-verified against a purchased copy before being used as a pass/fail gate.

Value-kind legend: **primary** = read from the actual regulation/standard text (US CFR text, or a public-domain
mirror of the EN text). **secondary** = manufacturer/test-lab/blog summary of a paywalled standard. Confidence:
**high** (regulation text read directly, or a figure corroborated by multiple independent secondary sources),
**medium** (single secondary source or partial confirmation), **low** (single weak source, or conflicting claims).

---

## 1. Entrapment / gap limits

| Requirement | Value | Applies to | Source | Primary/Secondary | Confidence |
|---|---|---|---|---|---|
| Cot side slat spacing | 25–60 mm (one secondary source instead states 45–65 mm — **conflicting, not reconciled**) | EN 716-1 cots | [Picket&Rail summary of BS EN 716](https://picketandrail.com/blogs/baby-kids-blog/baby-cot-mattress-key-safety-requirements-and-requirements-of-bs-en-716) | secondary | low |
| Mattress-to-frame gap max | 30 mm | EN 716-1 cots | [Picket&Rail](https://picketandrail.com/blogs/baby-kids-blog/baby-cot-mattress-key-safety-standards-and-requirements-of-bs-en-716) | secondary | medium |
| Corner post / protrusion max | 8 mm above rail top | EN 716-1 cots | [Picket&Rail](https://picketandrail.com/blogs/baby-kids-blog/baby-cot-mattress-key-safety-standards-and-requirements-of-bs-en-716) | secondary | medium |
| Rigid completely-bound finger-hole opening forbidden range | 7–12 mm diameter/width (exempt if depth <10 mm or a defined probe passes) | EN 747-1:2024 bunk/high beds; tested per EN 747-2:2024 §5.2.2 probe / §6.3.1 | [EN 747-1:2024 preview / secondary synthesis](https://webstore.ansi.org/preview-pages/BSI/preview_30458262.pdf) | secondary | medium |
| Gap adjacent to inner surface of side/end rails | max 25 mm | EN 747-1:2024 | [GP Camping Guide fact-check](https://gp-camping-guide.com/bunk-bed-safety/) | secondary | medium |
| General slat/rail gap max | 75 mm ("no body part may pass through or get caught") | EN 747-1:2024 | [GP Camping Guide](https://gp-camping-guide.com/bunk-bed-safety/) | secondary | medium |
| Scope trigger | Rules apply only when upper mattress is ≥600 mm above floor | EN 747-1:2024 | [GP Camping Guide](https://gp-camping-guide.com/bunk-bed-safety/) | secondary | medium |
| Guardrail-to-end-structure gap max | **5.6 mm (0.22 in)** | US 16 CFR 1213.3(a)(2), bunk beds | [Cornell LII e-CFR text](https://www.law.cornell.edu/cfr/text/16/1213.3) | **primary** | high |
| Guardrail end-to-bed-end max gap | **380 mm (15 in)** | US 16 CFR 1213.3(a)(3), bunk beds | [Cornell LII](https://www.law.cornell.edu/cfr/text/16/1213.3) | **primary** | high |
| Openings between bunks: must block a wedge-block probe or allow a rigid sphere through | **230 mm (9 in) diameter sphere** | US 16 CFR 1213.3(b)(2)-(3), bunk beds | [Cornell LII](https://www.law.cornell.edu/cfr/text/16/1213.3) | **primary** | high |
| Crib slat/spindle/corner-post/rod spacing max | **60.3 mm (2 3/8 in)** at any point | US 16 CFR 1508, full-size cribs | [CPSC Investigation Guideline — Structural Entrapment, Appendix 35 (rev. Dec 2004)](https://www.reginfo.gov/public/do/DownloadDocument?objectID=68326001) | **primary** | high |
| General CPSC "head entrapment zone" doctrine | **89–230 mm (3.5–9 in)** — opening large enough for torso/body but not head is hazardous | Codified for playground equipment (ASTM F1487/F1148); cited by CPSC as the general structural-entrapment principle also underlying bunk-bed and toddler-bed rules | [CPSC Investigation Guideline, Appendix 35](https://www.reginfo.gov/public/do/DownloadDocument?objectID=68326001) | **primary** (for playground scope); analogy for beds | medium |
| US toddler bed scope definition | must fit a mattress ≥1310×690 mm; user 15 months+ and ≤22.7 kg (50 lb) | US 16 CFR 1217.2 / ASTM F1821 | [eCFR 1217.2 (Cornell/eCFR paraphrase)](https://www.ecfr.gov/current/title-16/chapter-II/subchapter-B/part-1217/section-1217.2) | **primary** | high |
| Guardrail height above sleep surface | 127 mm (5 in); based on a 6 in mattress assumption if manufacturer states no max thickness | US ASTM F1821 / 16 CFR 1217 (via 2011 Federal Register rulemaking, not independently confirmed against F1821 text itself) | [Federal Register 2011-9421 (search synthesis; direct fetch blocked)](https://www.federalregister.gov/documents/2011/04/20/2011-9421/safety-standard-for-toddler-beds) | secondary | medium |
| Lead limits (general CPSIA, applied to toddler beds) | 90 ppm surface coating / 100 ppm total accessible component | US 16 CFR 1217 (via general CPSIA limits) | [JJR Lab summary](https://www.jjrlab.com/news/how-to-get-a-16-cfr-part-1217-test-report.html) | secondary | medium |
| CPSC recall precedent | ~7,450 units of Montessori floor-bed/house-frame products recalled: spindle spacing let torso pass but not head | Floor-bed / house-frame category specifically | [CPSC Recall — Zipadee Kids](https://www.cpsc.gov/Recalls/2023/Zipadee-Kids-Recalls-Convertible-House-Bed-Frames-and-Montessori-Floor-Beds-Due-to-Entrapment-and-Strangulation-Hazards) | **primary** (recall notice) | high (as precedent; no mm value published) |
| Israeli bunk/high-bed guardrail height | ≥260 mm above bed base (mattress excluded) | Israeli standard TI 4007 Part 1 (mandatory), based on the EN 747 family | [SII bunk-bed guidance page (search synthesis; direct fetch failed)](https://www.sii.org.il/he/bunkbed/) | secondary | low |
| Israeli TI 4007 scope trigger | applies only when lower bed level is ≥800 mm above floor | Israeli TI 4007 Part 1 | [SII bunk-bed guidance page](https://www.sii.org.il/he/bunkbed/) | secondary | low |

**Reading across these:** the closest thing to a hard number for "safe vs. dangerous" gap sizes is the US
crib figure (60.3 mm max at any point) and the general CPSC 89–230 mm head-entrapment doctrine. EN-side
figures (25–65 mm ranges, 75 mm max, 7–12 mm finger-hole band) are directionally consistent with that doctrine
but were only available through secondary paraphrase — **flag for the product owner**: if this product will
claim EN 716/747 compliance, the actual standard texts must be purchased and read before hard-coding a pass/fail
gate.

## 2. Mattress fit

| Requirement | Value | Applies to | Source | Primary/Secondary | Confidence |
|---|---|---|---|---|---|
| Max mattress-to-frame gap | 30 mm | EN 716-1 cots | [Picket&Rail](https://picketandrail.com/blogs/baby-kids-blog/baby-cot-mattress-key-safety-standards-and-requirements-of-bs-en-716) | secondary | medium |
| "Two-finger rule" gap guidance | ~25 mm (not a codified clause) | US general crib-safety consumer guidance | [hiccapop](https://www.hiccapop.com/blogs/blog/baby-crib-mattress-safety) | secondary | low |
| Full-size crib mattress should fit with no gap; if a gap exists and there's no hardware failure, it should be measured | qualitative | US CPSC investigation practice | [CPSC Investigation Guideline, Appendix 35](https://www.reginfo.gov/public/do/DownloadDocument?objectID=68326001) | **primary** | medium (no number given) |
| Israeli mandatory mattress-thickness range for infant/toddler beds | 70–150 mm | Israeli standard TI 1548 (mandatory) | [SII infant-mattress page (search synthesis)](https://www.sii.org.il/he/babymattress) | secondary | medium |
| Mattress >100 mm thick requires bed sides ≥600 mm tall | 600 mm | Israeli TI 1548 | [SII infant-mattress page](https://www.sii.org.il/he/babymattress) | secondary | medium |
| Common Israeli/European cot mattress size | 60×120 cm | generic (not Israel-confirmed) | generic furniture-size guides | secondary | low |
| IKEA Israel junior mattress size (observed) | 70×160 cm | IKEA Israel catalog (UNDERLIG) | [IKEA IL children's mattresses](https://www.ikea.com/il/he/cat/childrens-mattresses-18724/) | secondary (retailer listing) | medium |
| IKEA Israel child mattress size (observed) | 80×200 cm | IKEA Israel catalog (PLUTTEN/VIMSIG/NATTSMYG/INNERLIG) | [IKEA IL children's mattresses](https://www.ikea.com/il/he/cat/childrens-mattresses-18724/) | secondary (retailer listing) | medium |
| Standard Israeli single/youth mattress size | 90×190 cm (80×190 also common; 90×200 exists but is non-standard) | Israeli mattress retail market | [mizran.co.il size guide](https://mizran.co.il/%D7%9E%D7%99%D7%93%D7%95%D7%AA-%D7%9E%D7%96%D7%A8%D7%A0%D7%99%D7%9D/) | secondary (retailer) | medium |

Note: I could not find an 80×160 cm or 70×140 cm size directly confirmed on an Israeli retailer's site in this
pass (only generic/European guides mention them); IKEA Israel's own listed sizes skew larger (70×160, 80×200).
**Not verified**: a clean "60×120 / 70×140 / 80×160 / 90×190" ladder specific to Israel — the 90×190 top end is
solid, the smaller rungs need a follow-up check against a baby-specific Israeli retailer (Etzmaleh, Baby-Star,
Shufersal) before being hard-coded as preset sizes.

## 3. Structural loads

| Requirement | Value | Applies to | Source | Primary/Secondary | Confidence |
|---|---|---|---|---|---|
| Assumed user mass for strength/durability force calculations | up to 110 kg | EN 1725:2023 domestic beds (adult beds; **excludes** bunk beds, high beds, medical beds, water/air beds) | [SATRA](https://www.satra.com/spotlight/article.php?id=566) | secondary | medium |
| Electrically-operated bed durability | 100 kg test dummy, 5,000 cycles | EN 1725:2023, adjustable/electric beds only | [Catas FAQ](https://catas.com/en/news/en-17252023-safety-strength-and-durability-requirements-for-beds-some-faqs/) | secondary | medium |
| Actual static/impact load values in Newtons for frame, base, edge | **not verified** | EN 1725 / EN 747 / ASTM F1821 | — standard text paywalled, no accessible secondary source gave N values | — | — |
| Design child mass by age (WHO Child Growth Standards, ~50th percentile) | ≈1y 9.6–10.2 kg, 2y 12.2–12.5 kg, 3y 14.3 kg, 4y 16.3 kg, 5y 18.3–18.5 kg (boys slightly above girls) | general design input, not a furniture standard | [WHO weight-for-age percentile tables](https://cdn.who.int/media/docs/default-source/child-growth/child-growth-standards/indicators/weight-for-age/wfa-boys-0-5-percentiles.pdf) | **primary** source, but figures paraphrased from a search summary, not re-read cell-by-cell | medium |

**Not verified / explicitly flagged:** no accessible source gives the actual Newton-based static load or
durability-cycle values from EN 1725, EN 747, or ASTM F1821. Do not invent a number here — if the engine needs
a load value for the floor bed base/slats, the product owner must either (a) purchase and read one of these
standards, or (b) make an explicit assumption (e.g., derive from WHO median mass × a safety factor, as is
already done conceptually for shelves in `ENGINEERING_DATA.md`) and label it clearly as an **assumption**, not
a standard value.

## 4. Edges and corners

| Requirement | Value | Applies to | Source | Primary/Secondary | Confidence |
|---|---|---|---|---|---|
| Edges/protrusions must be rounded or chamfered, free of burrs and sharp edges (no radius number given) | qualitative only | EN 716-1 cots | [Furnitest EN 716-1 summary](https://furnitest.com/testing/furniture-testing/standards/en-716-1-2017-en-716-2017/) | secondary | low |
| Corner post/protrusion height max | 8 mm | EN 716-1 cots | [Picket&Rail](https://picketandrail.com/blogs/baby-kids-blog/baby-cot-mattress-key-safety-standards-and-requirements-of-bs-en-716) | secondary | medium |
| Sharp-edge test method: mandrel radius; fail if adhesive tape cut ≥13 mm in one 360° pass | mandrel radius 2 mm | **Toy** standard (EN 71-1 / ISO 8124-1), not a furniture standard | [TestingLab EN 71-1 sharp edge summary](https://www.testinglab.com/en-71-1-sharp-edges-and-sharp-points-test) | secondary | medium |

**Not verified:** no EN 716/747 furniture-specific numeric edge radius was found anywhere accessible — those
standards apparently rely on the qualitative "rounded/chamfered, no burrs" language plus the toy-standard sharp
edge test only when a furniture standard explicitly cross-references it. If the product needs a numeric edge
radius target, using the toy standard's 2 mm mandrel test as a design proxy is a reasonable **product decision**,
not something to present as a verified furniture-standard requirement.

## 5. Coatings / finishes

| Requirement | Value | Applies to | Source | Primary/Secondary | Confidence |
|---|---|---|---|---|---|
| Category III (scraped-off coating) migration limits | Pb 160 mg/kg, Cd 17 mg/kg, Cr(III) 460 mg/kg, Cr(VI) 0.2 mg/kg, Sb 560 mg/kg | EN 71-3:2013+A1 Table 2, coatings/paints on children's products | [Public-domain mirror of EN 71-3:2013+A1](https://law.resource.org/pub/eu/toys/en.71.3.2015.html) | **primary** (for that edition) | medium — current edition is 2019+A2:2024, re-verify unchanged |
| Formaldehyde E1 class | ≤0.124 mg/m³ (~0.1 ppm) | EN 13986 panels (MDF/particleboard/plywood), tested per EN 717-1 | [Arcedior](https://arcedior.com/blog/e1-e0-formaldehyde-board-standards) | secondary | medium |
| Formaldehyde — US CARB Phase 2 / TSCA Title VI, hardwood plywood | ≤0.05 ppm | 40 CFR 770.10(b) | [Cornell LII 40 CFR 770.10](https://www.law.cornell.edu/cfr/text/40/770.10) | **primary** | high |
| Formaldehyde — particleboard | ≤0.09 ppm | 40 CFR 770.10(b) | [Cornell LII](https://www.law.cornell.edu/cfr/text/40/770.10) | **primary** | high |
| Formaldehyde — MDF | ≤0.11 ppm | 40 CFR 770.10(b) | [Cornell LII](https://www.law.cornell.edu/cfr/text/40/770.10) | **primary** | high |
| Formaldehyde — thin MDF (≤8 mm) | ≤0.13 ppm | 40 CFR 770.10(b) | [Cornell LII](https://www.law.cornell.edu/cfr/text/40/770.10) | **primary** | high |

Test method for the US figures is ASTM E1333-14 (large chamber) per the regulation text itself.

## 6. Floor-bed-specific guidance

- No EN or ASTM standard is written specifically for a Montessori-style floor bed. Manufacturers commonly
  claim alignment with EN 716 (cot-style entrapment logic), EN 747 (rail/gap logic), or ASTM F1821 (US toddler
  bed), but none of these standards' *scope* clauses actually cover a frame with the mattress essentially at
  floor level and no elevated sleeping surface — confirmed indirectly by EN 747-1's own 600 mm floor-height
  scope trigger and Israel's TI 4007's 800 mm scope trigger, both of which a floor bed falls under (secondary,
  medium confidence; see rows above).
- The one concrete floor-bed-specific data point found is a real CPSC recall: **Zipadee Kids** recalled ~7,450
  convertible house-bed-frame/Montessori-floor-bed units because spindle spacing let a child's torso pass
  through while trapping the head — a strangulation hazard. No standard was cited as violated in the recall
  notice itself. [CPSC Recall notice](https://www.cpsc.gov/Recalls/2023/Zipadee-Kids-Recalls-Convertible-House-Bed-Frames-and-Montessori-Floor-Beds-Due-to-Entrapment-and-Strangulation-Hazards) — **primary**, high confidence as precedent (no mm value given).
- General (non-standard) safety guidance repeated across parenting/retail blogs for floor beds and house
  frames: keep the bed away from window-blind cords, lamp cords, and baby-monitor cords (strangulation risk
  independent of the bed itself); anchor tall furniture to the wall separately, since a floor bed encourages
  climbing; if rails are used, verify spindle/slat spacing before purchase in light of the Zipadee recall.
  [Sleepy Monkey](https://sleepymonkey.com.au/safety-recommendations-for-using-a-montessori-floor-bed/), [Little Duck Bed](https://littleduckbed.com/blogs/news/montessori-floor-bed-rails-safety-guide) — secondary, low-to-medium confidence (general consumer advice, not standards).

## 7. Slat engineering

| Requirement | Value | Applies to | Source | Primary/Secondary | Confidence |
|---|---|---|---|---|---|
| Max slat spacing to avoid mattress sag (general guidance, not a standard) | 51–76 mm (2–3 in); foam/latex/hybrid mattresses recommended ≤70 mm; innerspring tolerates up to ~102 mm | generic mattress-industry guidance | [Puffy slat spacing guide](https://puffy.com/blogs/best-sleep/how-far-apart-should-bed-slats-be-the-spacing-guide) | secondary | low |
| Simply-supported-beam model is applicable to a bed slat | method note, not a numeric standard value | slat structural check | [calcresource beam formulas](https://calcresource.com/statics-simple-beam-deflections.html) (already cited in `docs/ENGINEERING_DATA.md`) | secondary (method, not a code value) | high (method validity) |

A bed slat spanning between two side rails, loaded by the mattress plus a tributary strip of body weight, can
be checked with the same simply-supported-beam deflection/bending approach already implemented in this
project's shelf engine (`src/engine/materials.ts`, per `ENGINEERING_DATA.md`). What's missing is a standard's
actual point/distributed load value in Newtons for a bed slat specifically (see §3) — none was found; the
engine would need an explicit, labeled assumption (e.g., WHO median child mass × a safety factor, or an
adult-comparable design mass to be conservative for multi-child/adult misuse) rather than a standard-derived
number.

---

## Summary for the product owner

**Verified (primary, high confidence) numbers usable today:**
- US 16 CFR 1213 bunk-bed entrapment gaps: 5.6 mm max guardrail-to-frame, 380 mm max unguarded span, 230 mm sphere test, 130 mm min guardrail/end-structure height above mattress.
- US 16 CFR 1508 crib component spacing: 60.3 mm max.
- US toddler bed (16 CFR 1217) scope: mattress ≥1310×690 mm, user 15 months+ to 22.7 kg.
- US CARB P2 / TSCA Title VI formaldehyde limits by panel type (0.05–0.13 ppm).
- EN 71-3:2013+A1 Category III coating migration limits (Pb 160, Cd 17, Cr(VI) 0.2, Sb 560 mg/kg) — re-verify against the current 2019+A2:2024 edition.
- CPSC Zipadee recall precedent confirming spindle/rail spacing as the named floor-bed hazard.

**Secondary, reasonably corroborated (medium confidence) — usable with a disclaimer:**
- EN 747-1:2024 gap figures (25 mm rail-zone, 75 mm general max, 7–12 mm finger-hole band, 160 mm mattress-below-rail).
- EN 716-1 30 mm mattress-gap and 8 mm corner-post figures.
- Israeli TI 1548 mattress thickness (70–150 mm) and TI 4007 rail height (260 mm) — Israel-specific and directly relevant to this product's market, but only found via search synthesis, not a direct standard read.
- E1 formaldehyde limit (0.124 mg/m³).

**Explicitly not verified — do not hard-code, ask the product owner to decide:**
1. EN 716-1's actual bar-spacing range (two conflicting secondary claims: 25–60 mm vs. 45–65 mm).
2. Any Newton-based static/impact load value from EN 1725, EN 747, or ASTM F1821 for frame/base/edge testing.
3. A furniture-specific (non-toy) numeric edge radius requirement.
4. Exact ASTM F1821 clause text for toddler-bed guardrail height, opening dimensions, and mattress-support spacing (US standard is paywalled; the 127 mm/5 in guardrail figure is repeated by many blogs but traces back to a Federal Register paraphrase, not a direct read of F1821 itself).
5. A clean Israel-specific mattress-size ladder below 90×190 cm (60×120/70×140/80×160 are plausible but only confirmed via generic/European sources, not an Israeli baby retailer).
6. Which standard(s), if any, this product should claim to follow, given that **no existing standard's scope actually covers a floor-level children's bed** — EN 747-1 and Israel's TI 4007 both explicitly trigger only at ≥600–800 mm bed height, and EN 1725 explicitly excludes bunk/high beds while saying nothing about floor beds either. This is a product-positioning decision, not a research gap that more searching will close.
