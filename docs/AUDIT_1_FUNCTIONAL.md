# Audit 1 of 5 — Functional: does everything work as shown?

Date: 2026-09-17. Method: every promise the product makes was turned into a check. Three layers:

1. **Hand-calculated reference values** — computed outside the engine (plain formulas, published inputs), then locked as tests in `src/audit/functional.test.tsx`.
2. **"One number everywhere"** — for all 16 catalog items, the cut list, order lines, CSV, copied order text, PDF package and assembly booklet are checked against each other (rendered, not assumed).
3. **Real clicking in the browser** — a scripted run of ~100 checks through home, all four steps, the fix drawer, part panel, layers, view modes, engineering panel tabs, exports, search, My projects, backup files, language and theme. The user's saved projects were backed up first and restored exactly afterwards.

Result: **2,720 automated tests pass**; the browser run ends with no console errors. 9 bugs found and fixed (below).

## 1. Hand-calculated values (all match the engine)

| What | By hand | Engine |
|---|---|---|
| Default bookcase price (2×180×29, 5×76×29 birch @ ₪285/m², back 180×79 @ ₪104/m², nails ₪7, delivery ₪50) | ₪816.48 | ₪816.48 |
| Bookcase shelf, L 760, b 290, 20 kg uniform | δ 0.9015 / 1.6228 mm, 8.67 % | same |
| Chair seat, L 450, b 460, 110 kg at mid-span | δ 0.9252 / 1.6653 mm, 31.6 % | same |
| Desk top, L 1182 (bearing centres), b 600, 30 kg uniform | δ 2.8022 / 5.0439 mm, 11.1 % | same |
| Floor-bed slats: count, gap, load per slat, deflection | 11 slats × 2, 43.67 mm, 26.7 kg, δ 0.2838 / 0.5108 mm | same |

Inputs: E = 10048 MPa, f_m,k = 40.2 MPa, ρ = 700 kg/m³ (supplier 12.6 kg/m² ÷ 18 mm), plywood SC1 k_def 0.8, k_mod 0.7, γ_M 1.2, γ 1.5.

## 2. Promises checked

| Area | Promise | Result |
|---|---|---|
| Home | "How much space" marks items that don't fit | ✅ |
| Home | Picking a card starts that furniture, sized to the space, as a new project (old kept) | ✅ |
| Home | Recent projects open from the home screen | ✅ |
| Setup | Fields update the design, price and "will be built at X cm" | ✅ |
| Setup | Fixed / adjustable shelves choice | ✅ |
| Setup (bed) | Mattress presets set both sizes; every field updates the design | ✅ |
| All steps | "N problems to fix" opens the drawer; a fix applies and unblocks; Undo brings it back; Escape closes | ✅ |
| Review | Blocked design shows every re-checked fix and disables exports; fixing there makes it ready | ✅ |
| Review | CSV, PDF package and assembly booklet are generated | ✅ (PDF 410 KB, booklet 504 KB) |
| Editor | Undo / redo buttons and Ctrl/⌘+Z, Ctrl+Shift+Z; E opens the engineering panel | ✅ after fix #1 |
| Editor | Sections collapse; layers hide part types; view modes; cameras; realistic/illustration | ✅ after fix #2 |
| Editor | Selecting a part opens its panel; isolate; back to whole unit | ✅ |
| Editor | Isolated part's drawn dimensions = cut list | ✅ unit tests on every part of every item; visually confirmed earlier. The 3D labels cannot be read while the browser pane is hidden (WebGL does not render). |
| Engineering panel | All 7 tabs open; "copy order" puts the order text on the clipboard | ✅ |
| Look | Decor chips, edge banding (changes price), decor per part type, decor per part, reset | ✅ |
| Look | Switching board keeps only decors the new board has | ✅ |
| Search ⌘K | Furniture starts it; parts select; board+decor applies; "My projects" navigates | ✅ |
| My projects | Duplicate, rename, delete (asks first), open (clears Undo) | ✅ after fix #6 |
| Backup file | Download contains format/name/params; import creates a new project; corrupt/unknown files rejected | ✅ after fixes #7–9 |
| Language / theme | English LTR with no Hebrew left; one-click theme | ✅ after fix #8 |
| Saved data | Garbage never becomes a design; old saved designs still open; NaN rejected | ✅ |

## 3. Bugs found and fixed

| # | Bug | Severity | Fix |
|---|---|---|---|
| 1 | Keyboard shortcut handler crashed when a key event came from the window/document (not an element) | Medium | Guard the target type |
| 2 | **Layers menu was invisible** — clipped by the toolbar's scroll container (a regression from the previous audit's overflow fix) | High | Toolbar wraps onto two rows instead of scrolling; verified the menu is visible and the page still doesn't scroll sideways |
| 3 | View-mode buttons were announced to screen readers as "Layers" | Low (a11y) | Own label "View mode" |
| 4 | PDF export waited for animation frames, so it stalled while the tab was in the background | Medium | Timer instead of animation frames; verified it completes in a background tab |
| 5 | A wide unit with a heavy load was only offered "make it 53 cm wide" — the fix search tried at most 2 extra dividers | Medium | Also searches the smallest divider count (up to 6) that passes; test added |
| 6 | Renaming a project saved only on losing focus | Low | Enter saves directly |
| 7 | Download links were released immediately — can cancel the download in some browsers | Medium | Released after 1 s |
| 8 | Backup/cloud dialog was Hebrew-only in English mode, and its hint was out of date ("until several projects can be managed") | Medium | Fully translated; hint now explains the real reason for backups; `role=dialog` and Escape added |
| 9 | Importing a corrupt file showed the raw parser error ("Unexpected token 'h'…") | Medium | Clear message in the current language |

## 4. Not verifiable in this environment

- 3D label rendering while the browser pane is hidden (covered by unit tests on the label texts).
- The actual file landing in the Downloads folder (the run intercepted the save on purpose, to avoid writing files to the user's computer; the PDF blobs were produced and sized).
- Cloud saving/versions: requires sign-in to the live Supabase project — belongs to Audit 5.
