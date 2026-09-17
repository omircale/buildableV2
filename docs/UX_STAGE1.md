# Buildable — UX stage 1: journey, structure, audit

Status: draft for approval · 2026-09-15 · desktop-first (primary device), mobile later as read/track only.

## 1. Who we design for

| Segment | Goal | What they must never face |
|---|---|---|
| **Maker at home** (primary) | "I have a space and a need; get me something that fits, looks right, and I can order." | Engineering notation, supplier logistics, blank canvas with no starting point |
| **Professional** (carpenter, interior designer) | Fast parametric edit, cut list, CSV/PDF for the shop | Being forced through a wizard |
| **Operator** (you, admin) | Fulfil orders, manage catalog, suppliers, prices, confirmations | End-user noise |

Principle: one engine, three depths of the same design (progressive disclosure), not three products.

## 2. End-to-end journey (maker)

| # | Stage | User question | Screen | What the system does silently |
|---|---|---|---|---|
| 1 | Start | "What can I build here?" | **Home** — furniture gallery + continue last project | Loads templates, restores local draft |
| 2 | Fit | "Will it fit my space and use?" | **Setup** — available space + what it holds | Converts use → load presets, picks sensible defaults |
| 3 | Shape | "How is it divided?" | **Editor · Structure** | Snaps to orderable cm, validates live, keeps 3D = parts |
| 4 | Look | "How will it look?" | **Editor · Look** — board, decor, paint/Formica | Filters to finishes compatible with the board |
| 5 | Confirm | "Can I actually build this? What does it cost?" | **Review** — plain-language checklist + price | Runs every gate; converts engineering into 1-line outcomes |
| 6 | Order | "Get it to me." | **Order** — sign-in happens here, delivery, pay | Picks supplier(s), creates order package for operator |
| 7 | Build | "How do I put it together?" | **Build guide** — 3D step-by-step | Assembly sequence from the same model |
| 8 | Feedback | "It came out great / there was a problem" | **Feedback** | Feeds North Star metric |

Professional journey: Home → "Open editor" (skips 2) → Editor with *Pro* depth → Export CSV/PDF.
Operator journey: Admin → Orders → order detail (supplier lines, confirmations) → Catalog / Suppliers / Pricing.

Sign-in is deferred to stage 6 (value before commitment). Local autosave covers 1–5.

## 3. Information architecture

```
Home
├── New design
│   ├── Furniture type (gallery)          ← templates
│   └── Ready ideas (presets per type)
├── Continue: recent projects
└── Account (only when signed in): projects, orders

Design flow (one URL per project, stepper at top)
├── 1 Space & use
├── 2 Structure        (3D + contextual properties)
├── 3 Look             (3D + board / decor / finish)
├── 4 Review           (can I build + price)
└── 5 Order

Admin (separate app shell)
├── Orders
├── Catalog (materials, finishes, CNC patterns)
├── Suppliers & pricing (markup)
├── Engineering data & thresholds
└── Usage & costs
```

Navigation rules: a persistent **stepper** replaces the 11-control header; steps are free to revisit (non-linear), but Review is always one click away. Manufacturing tabs (cut list, sheets, BOM) move out of the maker's view into Review → "parts details" and the Pro depth.

## 4. Heuristic evaluation of the current build

Method: Nielsen's 10 usability heuristics, severity 0–4 (4 = catastrophe), plus WCAG 2.2 AA and platform guidance (Material 3, Apple HIG). Measured on the editor at 1440×900.

Measurements: 84 visible controls on one screen · 11 header controls · 26 controls under 32 px · 54 text nodes at 10–11 px, 130 at 12 px · warning badge contrast 3.86:1 (WCAG needs 4.5:1 for small text) · 2 side panels + 6 bottom tabs + 5 view modes + 4 camera presets visible together.

| # | Finding | Heuristic / guideline | Severity | Fix in redesign |
|---|---|---|---|---|
| 1 | No starting point: app opens straight into a pre-filled editor | H6 recognition over recall; H10 help | 4 | Home gallery + Setup step |
| 2 | Everything at once: parameters, 3D, checks, 6 manufacturing tabs | H8 minimalist design; progressive disclosure | 4 | Stepper; contextual panel; manufacturing moves to Review/Pro |
| 3 | Engineering notation (δ_fin, k_def, MPa, "borrowed data") in the maker's path | H2 match real world | 3 | Plain outcome ("holds 25 kg of books without visible sag") with "why" expandable; notation only in Pro |
| 4 | Status "unknown" for stability/connections shown permanently, reads as failure | H1 visibility of status; H2 | 3 | One overall state + "things to do before building" list (anchor to wall) |
| 5 | Header crowded (11 controls) with equal visual weight; primary action unclear | H8; Material: one primary action per view | 3 | Stepper + single primary CTA per step ("Continue", "Order") |
| 6 | Small targets: 26 controls < 32 px; 10–11 px text | Material 48 dp / HIG 44 pt targets; WCAG 2.5.8 (24 px min) | 3 | 40 px desktop controls, 14 px min body, 12 px min labels |
| 7 | Warning badge contrast 3.86:1 | WCAG 1.4.3 | 3 | Darker warning text token |
| 8 | "Beginner / Advanced" toggle: unclear consequence, hidden cost | H2, H6 | 2 | Replace with depth that follows the task (Setup vs Editor vs Pro link) |
| 9 | Duplicate inputs (slider + number) for every dimension | H8 | 2 | Number field with steppers; slider only where magnitude matters (load) |
| 10 | Fixes apply instantly with no preview of consequence (price, look) | H3 user control; H5 error prevention | 2 | Fix cards show before/after (status, price delta), undo toast |
| 11 | Dimension snapping (800 → 796) explained only inside a check card | H1, H5 | 2 | Inline hint next to the field: "796 built (orderable size)" |
| 12 | Order/print disabled with only a tooltip explaining why | H9 help users recover | 2 | Disabled CTA replaced by "2 things to fix" link that jumps to them |
| 13 | View modes / camera presets / part toggles float over the model, compete with content | HIG deference; H8 | 1 | Compact viewport toolbar; advanced view modes in Pro |
| 14 | No empty/loading/error states for cloud save | H1, H9 | 1 | Save status in stepper bar ("saved" / "offline, saved locally") |

## 5. Design principles for Buildable (derived)

1. **The furniture is the interface.** 3D takes the stage; controls are contextual to what is selected or to the current step (HIG deference, Material canonical "supporting pane" layout).
2. **One question per step, one primary action per screen.**
3. **Outcomes before numbers.** Engineering is always available, never in the way.
4. **Never a dead end.** Every problem ships with a fix that shows its consequence.
5. **Honest by default.** No "safe", no "certified" — but phrased for people, not engineers.
6. **Desktop-first density, touch-safe sizes.** 40 px controls, 14 px body, 8 px spacing grid, AA contrast.

## 6. Success metrics and test plan

- Task: "Design a bookcase for a 90 cm wide wall for books and get a price" — success rate ≥ 80 % unaided, time ≤ 4 min.
- First-click test on Home: ≥ 4/5 users choose a furniture type first.
- SUS ≥ 75 after the flow.
- Method: 5 participants per round (NN/g), remote moderated, think-aloud; repeat after each iteration.

## 7. Decisions pending

- Home direction: A (furniture gallery) / B (start from space) / C (inspiration-led) — mockups on the design canvas.
- Brand identity (name, logo, type, colour) — current mockups reuse today's app palette as a neutral base.
- Markup and customer-facing price.
