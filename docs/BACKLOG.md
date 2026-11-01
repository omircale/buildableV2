# Buildable — Backlog

Status legend: ✅ done · 🔄 in progress · ⏳ next · 🅱️ phase B (later)

## Stage 1 — Interface rebuild (desktop-first) ✅ 2026-09-15
- ✅ Combined home: furniture gallery + "how much space" filter + continue card
- ✅ Four-step flow (space & use → structure → look → summary & price), non-linear stepper
- ✅ Editor: 3D in the center, context panel per selected part, advanced "engineering & manufacturing" panel (E) with checks, order, cut list, sheets, quantities, assembly, change impact
- ✅ Plain-language summary with inline fixes, price card, CSV/PDF with the reason when blocked
- ✅ Day / night / system theme, WCAG 2.2 AA contrast in both
- ✅ Hebrew + English with RTL/LTR switch
- ✅ Global search (⌘K / Ctrl K): furniture, steps, actions, parts in the project, boards and decors
- Open: engine-generated texts (check titles, explanations, material names) are still Hebrew-only → i18n of engine messages

## Stage 1.5 — UI fixes from the 2026-09-16 QA pass ⏳
- ✅ Real PDF download (html2canvas-pro + jsPDF, no print dialog) — `src/ui/pdfExport.ts`
- ✅ Realistic view rendering bug fixed (was blank — an external HDRI Environment component hung the canvas); local 3-light rig instead, no CDN dependency
- ✅ 2026-09-17 "My projects" page (#/projects), local-first autosave, open/rename/duplicate/delete. Was: a dedicated page (not just the ProjectsDialog modal) listing several in-progress designs, each resumable — **decision: sequential** (one active design at a time, switch and resume from a list), not simultaneous multi-tab editing. Local-first (works before login), synced to Supabase per-project once auth is live.
- ✅ 2026-09-17 Per-part decor, both tiers: decor per part type (Look → "Decor by part type") and per single part (click a part → "Decor for this part"); same board product, so structure is unchanged; priced per decor. Different *board thickness* per part is still open. Was: Per-part material/color — **decision: two-tier.**
  - Tier 1 (default): choose material/color per **part role** (sides, shelves, dividers, back, top/bottom, plinth) — each role its own material, still one choice per role.
  - Tier 2 (advanced, opt-in): full per-instance freedom — literally any single shelf/divider can differ from its siblings.
  - Engine impact: `OpenShelfParams` needs a materials map (by role, then optionally by component id) instead of one `materialId`; BOM/nesting/quote must group by (material, thickness) as they already do per-group, just with more groups; cut list already carries `materialId` per part so should mostly just work once the model assigns it correctly.
- ✅ 2026-09-17 Fixed vs adjustable shelves asked with the shelf count; adjustable = 32 mm system (source: Hettich System 32 via Wikipedia), drilling notes per side/divider (dividers offset by 16 mm between faces), 4 supports per shelf, clearance note. Was: Factory drilling/routing notes in the order summary — **decision: ask the user at the point they choose shelf count** (in the space & use step) whether shelves should be fixed (screwed, cheaper/simpler) or adjustable (on 5mm shelf-pins, repositionable) — this is a real construction-method choice, not just documentation. Adjustable shelves unlock: pin-hole drilling notes (32mm line spacing, per docs/data/hardware-library.json shelf-pin entry), and removes the "fixed shelf" assembly step in favor of "drop shelf onto pins."
- ✅ 2026-09-17 Light assembly booklet PDF (cover with finished piece, parts, hardware; one isometric drawing per step highlighting the parts added) + drawings in the Assembly tab. 3D animation still open. Was: IKEA-style assembly booklet + animation — **decision: lightweight version first.** v1 = auto-generated parts+hardware inventory page (screws at 1:1 scale) and wordless step diagrams reusing the existing `assemblySequence()` step list with exploded-view snapshots; full step-by-step 3D animation comes after, once stage-2 hardware data (docs/data/hardware-library.json, in progress) is merged.
- ⏳ Realistic 3D view — currently local lighting only (see fix above); genuine photorealism needs real material photos, which is exactly what the Bluran catalog research (docs/data/bluran-catalog.json, 236 items with image URLs, done) is for — wire actual decor swatch images as texture maps in stage 3 rather than faking it with a synthetic procedural texture now.

## Stage 1.6 — 2026-09-16 (second pass): notes vs. problems, dimensions, Gemini review ✅
- ✅ Notes-only sections (no RED) now collapse by default and show one calm, neutral summary line instead of a wall of colored alert cards; expanding shows the same cards muted to a neutral panel style. Full alert styling is reserved for an actual build-blocking RED.
- ✅ Renamed "בעיות/Issues" → "הערות/Notes" throughout (viewport mode, panel titles) — a YELLOW caveat isn't a "problem".
- ✅ Adding a divider now shows a labeled span line **per bay** in the dimensions view (was: only the first bay), staggered so labels don't overlap with several dividers.
- ✅ Local JSON backup: "הורדת קובץ פרויקט" / "טעינת קובץ פרויקט" in the Projects dialog — a stopgap for multi-project work until the dedicated "My projects" page exists.
- ✅ Heuristic audit of the structure editor against NN/g, Material Design 3 and Apple HIG — see `docs/UX_AUDIT_STRUCTURE_EDITOR.md`. Verdict: most of the editor already follows these guidelines; the concrete gaps found (notes flooding, missing divider gaps, "problems" wording) are the three items above. Touch-target sizing was measured (38–40px) and deliberately left alone — this is a desktop-first, mouse-driven product, and inflating to mobile's 44/48px minimum would waste space for no real benefit here.
- ✅ Full review of the user's separate Gemini architecture conversation — see `docs/GEMINI_ARCHITECTURE_REVIEW.md`. Bottom line: most of what Gemini proposed is already built in Buildable (often on better-sourced data). Its EN 14749 load-value claim ("1.5×10⁻³ kg/mm²") could not be verified by our own research agent that read the actual standard summaries — treat it as unconfirmed, matching this project's very first caught case of a fabricated EN 14749 number.
- ⏳ Spotted once, not reproduced: a console error ("`<rect>` attribute width: A negative value is not valid, -30") appeared during testing but the DOM had no negative-size rects when checked immediately after. Likely a one-frame render race during a rapid parameter change (e.g., mid-recompute after adding a divider). Not currently reproducible — keep an eye out if a sheet/nesting diagram ever visibly glitches.

## Stage 1.7 — Multi-furniture framework ✅ 2026-09-17
- ✅ Template registry (`src/engine/templates/registry.ts`): each furniture type = params + builder + limits + own checks + fix candidates + assembly steps. Validation, structure analysis, quote, 3D and UI are now generic.
- ✅ Schema-driven settings panel (`src/ui/TemplateFields.tsx`) — new furniture needs a field list, not bespoke UI.
- ✅ 16 catalog items: bookcase, shoe cabinet (doors), open shoe rack, TV unit, cube organizer, cabinet with doors, Montessori floor bed, single bed, double bed, desk, bench, coffee table, nightstand, chair, child's chair, pull-up station.
- ✅ Hinged doors on the carcass family: full-overlay leaves, hinge count by door height (rule of thumb, flagged to confirm with the hinge maker), Ø35 hinge-cup drilling notes on the part.
- ✅ Beds: rails on the floor, slats rest on floor-standing support boards (no screws in shear), optional centre support; slats checked as beams with a stated load model (110 kg per EN 1725 over 600 mm of bed). Child rules from docs/data/floor-bed-rules.json: entrapment opening 89–230 mm → RED/blocked (CPSC heuristic + Zipadee recall), mattress gap, high-bed threshold 600 mm, edges, coatings/formaldehyde.
- ✅ Chair: seat bending computed; joints, stability → GREY with EN 12520 / EN 1022 named. Table/bench/desk: top bending, back rail racking, middle panel option.
- ✅ Pull-up station: always RED (structure.life_safety) — ordering blocked until a structural engineer signs off. RED safety now blocks export too.
- ⏳ Only birch 18 mm has strength data — other boards show GREY for beds/tables/chairs. More board datasheets = more furniture can reach GREEN/YELLOW.
- ✅ 2026-09-20 Security: admin bootstrap now requires a confirmed e-mail and is single-use (migrations 0003, 0004, applied and verified on the live project).
- ⏳ Phase B: "approved by an engineer" override (admin) to unblock a specific pull-up design.
- ⏳ Wall shelf and shelf-for-existing-cabinet still "soon" (need wall-anchor data from the hardware library).

## Stage 1.8 — Full audit ✅ 2026-09-17
- ✅ See `docs/AUDIT_2026-09-17.md` (14 findings fixed; automated invariant audit over ~330 designs; exact part dimensions when isolated; machining notes to the factory).

## Stage 1.9 — Fix anywhere ✅ 2026-09-17
- ✅ "N problems to fix" button in the bottom bar of every step opens a side sheet with every problem and all its re-checked fixes (apply in one click, Undo reverts). Review screen shows all fixes, not only the first.

## Stage 1.10 — AR, step 1 ✅ 2026-09-20
- ✅ 3D file export at true 1:1 scale from the review screen: USDZ (iPhone → AR Quick Look, floor anchoring, Quick Look compatible) and GLB (Android viewers, 3D software). Built from the model, not the canvas; part ids, names, cut sizes, weight embedded; exporters load on demand (10 KB + 9 KB).
- ⏳ Step 2 (needs deployment): host the file, in-room button with bundled model-viewer, QR from desktop to phone, vertical anchoring for wall-mounted pieces. See docs/AR_MODULE.md.

## Stage 2 — Montessori floor bed + hardware ⏳
- Template framework (schema-driven parameters) so new furniture does not need bespoke UI
- Montessori floor bed: user picks mattress width × length × thickness freely (presets for common sizes); frame, slats/base, rails and house frame derived from it; house frame / rails / base type as options
- Child-safety checks from the relevant standards with sources (entrapment gaps, edges, finishes), never from memory
- Hardware library with manufacturer data (screws, dowels, cam locks, bed bolts, wall anchors): specs, loads, sources, per-step placement
- Hardware ordered together with boards: one order, one price

## Stage 3 — Materials, finishes and realism 🔄
- ✅ 2026-09-20 Distributor finishes catalog with their photographs (permission granted): 190 decors at `#/decors`, search + filters, preview on the model at real tile scale with grain direction, attribution and a documented removal path. Preview never changes design, price, order, PDF or AR export. See docs/DECOR_CATALOG.md.
- ⏳ Prices/sheet sizes for those finishes → real ordering; photographs of the boards actually sold today.

## Stage 3 — remaining ⏳
- Catalog layer for decors/materials from multiple suppliers (supplier hidden from end users): HPL/Formica, polymer (RENOLIT-foiled MDF), acrylic, veneer, solid wood, core boards — starting from Bluran's published catalogs, with attribution
- Filters: material type, color family, pattern (wood/stone/solid), finish (matte/gloss/texture), search by name or code
- Knowledge card per material and finish: properties, what it suits (e.g. CNC grooves and patterns → MDF or solid wood), pros and cons — researched with sources, questions to the owner when unsure. No "not recommended" labels; neutral comparison.
- Baked paint (צבע בתנור) as a finish option, color fans (Nirlat / Tambour) with easy navigation: family → shade → similar shades; shown on compatible materials
- Different material/color per part (and "apply to all similar")
- View switch like map/satellite: photo-real (PBR textures, lighting, shadows, sheen) vs. illustration (flat colors, outlines); layers toggle (dimensions, hardware, labels, issues)
- Legal: attribution does not by itself grant rights to images; keep every image swappable/removable from admin and confirm permission before public launch

## Stage 4 — Assembly guide ⏳
- IKEA-style PDF: parts and hardware inventory (screws at 1:1), tools, warnings, wordless step illustrations generated from the model
- Per-step 3D animation in the browser (parts moving into place), play/pause per step; export later

## Stage 5 — CNC features gallery ⏳
- Cutouts, finger pulls, rounded corners, patterns; admin uploads DXF/SVG examples

## Phase B 🅱️
- Request a professional installer, priced separately from materials
- Multi-item projects and quantities for business clients (hotels, food chains, architects), shared nesting across items
- Online ordering and payment; supplier routing
- Cloudflare deploy, GitHub repo and issue tracking, auth rollout
- Beyond wood: stainless steel, LED lighting, special design products
