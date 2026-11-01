# Audit 5 of 5 — Additions and combinations: what the user will want that we haven't built

Date: 2026-09-18. This audit ends with product decisions rather than code, so it is written as options with a recommendation.

## The core limitation

Every furniture type today is a **fixed template with parameters**. A bookcase is shelves; a cabinet is shelves plus doors over the whole front. Your example — *doors on the bottom half, open shelves on top* — cannot be expressed at all. Neither can: drawers, a hanging rod, one deep bay next to shallow ones, or a cabinet split into columns of different widths.

This is the single biggest functional gap in the product. Everything else in this audit is smaller.

## Four ways to solve it

| Option | What it means | Strength | Weakness |
|---|---|---|---|
| **A. Zones** | The carcass is divided into columns, each column into rows; each cell holds one thing: open, shelves, doors, drawers, rod | Covers the great majority of real furniture; keeps whole-centimetre cutting and every structural check; the price and cut list follow automatically | Needs an engine change and a new editing interface |
| **B. Free part palette** (drag parts in) | The user drops parts anywhere | Maximum freedom | Breaks whole-centimetre ordering and the checks; lets people build things that cannot be cut or that fail. We rejected free dragging once already for this reason |
| **C. Describe it in words** | "A cabinet 2 m wide, doors at the bottom, open shelves above" → a design | Feels effortless for a beginner | Only works *on top of* a model that can express the result — i.e. it needs A first. Costs money per use |
| **D. From a photo or sketch** | Upload a picture, get a design | Great for inspiration | Least reliable; hardest to verify |

**Market evidence:** [Tylko](https://tylko.com/en-ot/faq/articles/customisation/what-is-the-configurator) — the closest product to ours — is made to measure to the centimetre with doors, drawers and backs chosen per part of the unit, and it is [explicitly not modular after assembly](https://tylko.com/en-ot/faq/articles/about-us/is-tylko-a-modular-system), exactly like our whole-centimetre cut parts. Their configurator is effectively option A.

## Recommendation: build A, then C on top of it

**Engine shape** (a natural extension of what exists):
- A carcass has **columns** (each with its own width) and each column has **rows** (each with its own height).
- Each cell has a content type: `open` / `shelves(n)` / `doors(1–2)` / `drawers(n)` / `rod`.
- Today's bookcase becomes the special case: one column, one row, shelves. Saved projects keep working through the same defaults mechanism that already handles new fields.
- Structural checks don't change: each shelf in each cell is still a beam with a span and a load. Doors, drawer fronts and backs are parts like any other.
- **Drawers need data we don't have**: runner load ratings and mounting clearances. Until a manufacturer datasheet is in the library, a drawer would be grey (unverified) — the same rule as everywhere else.

**Interface:** click a cell in the 3D view and choose what goes in it (a small menu of the five content types), plus "split this column" / "split this row". That is one interaction model, it works on desktop, and it matches how people describe furniture out loud.

**Rough effort:** engine and cut list ~2–3 days, editing interface ~2–3 days, tests and audit ~1 day. Drawers add more, and are blocked on hardware data.

## Everything else users will want, ranked

| Value | Effort | Item | Note |
|---|---|---|---|
| High | Medium | **Zones (above)** | Unlocks most real furniture |
| High | Medium | **Ordering that completes** (a request to you, or an order to the supplier) | Today every journey ends at "opens soon" |
| High | Small | **Estimated weight** | **Done in this audit** — now on the summary and the booklet cover (45.9 kg for the floor bed) |
| High | Small | **"Will it get into the room?"** — compare the assembled size against a door/corridor the user enters | Cheap, prevents a real disaster. Needs the user's door size (no standard assumed) |
| High | Medium | **A link to share with a client or carpenter** | Needs hosting; comes with deployment and AR |
| Medium | Small | **Tools needed** and a rough build time in the booklet | Both are assumptions unless measured — must be labelled as such |
| Medium | Medium | **Drawers**, **hanging rod**, **wall-mounted units** | Rod is easy; drawers need hardware data |
| Medium | Medium | **Several units in one project** (a wall of cabinets, a hotel order) | Phase B, business customers |
| Medium | Large | **AR in the room** | Agreed: after the audits |
| Medium | Medium | **Corner units, angled cuts** | Our parts are rectangles today |
| Low | Medium | CNC cutouts, finger pulls, rounded corners | Stage 5 in the backlog |
| Low | Medium | Cable holes, levelling feet, LED channels | Small accessories |
| Low | Large | Convertible furniture (a bed that grows with the child) | Attractive for the Montessori segment, but a big engine feature |

## Questions users ask that the product still cannot answer

1. **"Will it fit through my door?"** — recommended above.
2. **"How long will assembly take, and can I do it alone?"** — weight is now shown; time is not.
3. **"What will it look like in my room?"** — AR, next.
4. **"Can I get it in the exact colour of my wall?"** — baked paint with the Nirlat/Tambour fans (data already researched, not wired in).
5. **"Who builds it if I don't want to?"** — the installer request, phase B.
6. **"Is it safe for my child?"** — answered for the floor bed; not for shelves or cabinets (anti-tip is a note, not a calculation).
