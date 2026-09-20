# Finishes catalog (distributor images)

Added 2026-09-20, after the owner obtained the distributor's permission to use their published images.

## What it is

190 finishes the distributor publishes — HPL laminate, PL polymer, acrylic, veneer, aluminium, PET, glass — each with its own photograph. Browse at `#/decors` with search and filters (family: wood / solid / stone / metal / concrete / fabric; material type), and click one to see it on the piece you designed.

## The honest boundary

These are **that distributor's products**. They are *not* the decors of the boards the current price is calculated from (a different supplier, whose decors have plain names like "matte white" and no published photographs). Two decors with different names are different products, so the catalog never pretends one is the other:

- Choosing a finish sets a **preview**: the model shows it, with a badge naming it and a one-click way back.
- The design, the cut list, the price and the order are **unchanged** by a preview.
- The order package PDF temporarily drops the preview before capturing the 3D snapshot, so the document always shows what is actually ordered.
- The AR export uses the ordered decor colours, not the preview.

Connecting these finishes to real ordering needs their prices and sheet sizes, which the distributor has not published — an open question for the owner.

## Images

- Stored in `public/decors/` (served from our own site — the security headers block hot-linking anyway), downscaled to 512 px, ~5 MB for 190 files, loaded lazily.
- `src/data/decorCatalog.json` records for every image: code, name, material type, family, finish, collection, the product page URL and the original image URL, plus the permission note and the import date.
- **Removing an image** is deliberate and easy: delete the file and its manifest entry. A test fails if a manifest entry points at a missing file, so the two cannot drift apart.
- Attribution appears on the catalog page and next to the catalog link in the editor.

## How it looks on the model

The swatch is mapped at a real-world tile size (~40 cm), per part, and the grain stands up on upright parts (sides, posts) the way a board would be cut. Tested in `src/ui/decors/catalog.test.ts`.

## Open

- Prices and sheet sizes for these finishes → ordering.
- Photographs of the **boards we do sell** (the timber supplier publishes none) — needed before "realistic" is fully honest for the ordered product.
