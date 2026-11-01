# Audit 3 of 5 — UX and the user journey

Date: 2026-09-18. Method: two personas, real tasks with a defined end, walked in the running product while recording what every screen says, how many actions a task takes, where a user is left without an answer, and what has no path at all.

- **Persona A — the owner (you):** a Montessori floor bed for a 70×160 mattress, through to ordering.
- **Persona B — a professional:** ten identical units for a hotel; needs to send a cut list to a carpenter.

## Journey A — floor bed, home screen → ordering

| Step | What the user sees | Verdict |
|---|---|---|
| Home | Gallery with recent projects, status and price on each card | Works. The "how much space" filter is about outer size, which is the wrong question for a bed (you pick a mattress). |
| Space & use | **Asked "Where will the furniture stand?"** then mattress presets | **Wrong question — fixed.** Now "Which mattress goes in?" |
| Structure | Sections: size, use and loads, construction, children/openings, board | Works. Five notes collapsed into one calm line. |
| Look | Board decor, edges, decor per part type, after-delivery finish | Works. Edge banding is correctly greyed out for a board that has none. |
| Summary | Ready to order, size, price, safety notes, exports | Works. The safety notes each linked to "How did we calculate this?" even where there is no calculation — **fixed** to "Why is this here?" |
| Ordering | "Online ordering opens soon" | Honest, but it is the main call to action and it doesn't complete the job. Now it at least opens the order list, and the list can be **sent to a carpenter** (below). |

**Task cost:** a usable floor bed from a cold start is about 6 interactions (card → mattress preset → continue → continue → continue), which is good.

## Journey B — professional, "send the cut list to a carpenter"

Before this audit the only options were: download a CSV, download a PDF, or copy text to the clipboard. There was **no way to send anything to anyone.** Added: **Send on WhatsApp** and **Send by e-mail** in the order tab, pre-filled with the full order text (parts, sizes, quantities, price, machining notes). The user picks the recipient and presses send themselves; nothing leaves the app on its own. Very long lists fall back to copying, with that stated.

Still missing for this persona (deliberately deferred, needs decisions):
- Several units in one project, and quantities per unit (phase B).
- A link a client or carpenter can open, instead of a file (needs hosting — audit 2 / AR module).

## Fixed in this audit

| # | Finding | Severity | Fix |
|---|---|---|---|
| 1 | First question was "Where will it stand?" for every furniture type, including beds and chairs | High | A question per type: mattress for a bed, top size for a table, who it's for on a chair |
| 2 | Applying a fix changed the design **with no confirmation of what changed** | High | A confirmation appears: which fix was applied, the price before → after, and one-click undo |
| 3 | "How did we calculate this?" appeared under notes that have no calculation (edges, coatings, house frame) | Medium | Those now say "Why is this here?" |
| 4 | Editor screens had **no page heading**; the first heading in the document was the hidden print package, which is what a screen reader announced | Medium (a11y) | Each editor screen has a proper heading ("Montessori floor bed — Structure"); the hidden print and booklet documents are hidden from assistive technology |
| 5 | No way to send the order to a carpenter or supplier | High for professionals | WhatsApp / e-mail share of the order text |
| 6 | Two projects of the same type were both called e.g. "Bookcase" | Low | Repeats are numbered |

Checked and already fine: every control has an accessible name, no image lacks alt text, a keyboard focus ring is defined globally, sections remember their state, undo/redo works from the keyboard, and the notes never flood the screen.

## Open recommendations (not done — they need your decision)

| Priority | Recommendation | Why |
|---|---|---|
| High | **Decide what "order" means in v1**: a request sent to you, a WhatsApp order to the supplier, or online payment. Today the main button explains it isn't open yet. | It's the end of every journey |
| High | **First-run guidance** (a short explanation of the four steps and of green/yellow/red/grey). Nothing explains what "not checked" means for a non-engineer. | First impression |
| Medium | **Plain-language glossary** for engineering terms in the advanced panel (span, deflection, utilisation) | The panel is for professionals, but a curious owner opens it too |
| Medium | **Keep focus inside dialogs** (fix drawer, search, backup dialog) and return it to the opening button on close | Keyboard and screen reader users |
| Medium | **Mobile layout.** The product is desktop-first by decision, but a client will open a shared link on a phone — and AR is mobile-only. | Needed before sharing links or AR |
| Low | Filter the home gallery by what a bed actually needs (mattress size), not outer size | The filter is misleading for beds |
| Low | Show what changed structurally after a fix (which parts moved), not only the price | Deeper feedback |
