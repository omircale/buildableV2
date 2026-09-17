# Bluran catalog extraction – notes

Retrieved 2026-09-15 from https://www.bluran.co.il/ (13 collection pages, their `?tab=technical` tabs, 2 sample item pages, privacy page, robots.txt). Output: `bluran-catalog.json`. 236 items total.

## Counts per collection

| slug | items | tagged NEW | notes |
|---|---|---|---|
| קולקציית-hpl-פורמייקה | 62 | 35 | subgroups: SUPERMATT 15, TAP 5, טקסטורות 10, סטון 14, עצים מבית KAINDL 18; 6 marked "עד גמר המלאי"; 23 PL items list a matching HPL code |
| קולקציית-פורמייקה-hpl-ננו | 16 | 0 | |
| קולקציית-hpl-פורמייקה-italy | 31 | 24 | 9 series (Tweed, Metropolitan, Mineral, Marrakesh, Dune, Amber, Club, Spicy, Rainforest); 21 PL items list a matching HPL code |
| קולקציית-אקריל-pure | 28 | 5 | matt 21 / gloss 7; 3 marked "החל מחודש ינואר" |
| קולקציית-אקריל-glass-effect | 6 | 0 | |
| קולקציית-pet (FANTASY) | 16 | 16 | 5 PET + 11 acrylic |
| קולקציית-פורניר | 7 | 0 | טבעי 4 / פראי 3 |
| לוחות-עץ | 3 | 0 | Vario, Lami, Butcher Block (board types, not decors) |
| קולקציית-פולימר | 20 | 4 | |
| קולקציית-למיטקס-pp | 17 | 5 | |
| גווני-אלומיניום | 11 | 2 | page states a fan of 11 colours, matches |
| קולקציית-זכוכית | 15 | 0 | clear/antisun 10, opaque/mirror 5 |
| חומרי-ליבה | 4 | 0 | particle board, plywood, MDF, CDF (board types) |

## How the data was read
- Every listing page is server-rendered: all items are in the HTML, and the subgroup buttons just filter on the client. No pagination or "load more" was found.
- Item pages (`?subCollectionId=…&subSubCollectionId=…`) only repeat the name and list sibling items. They have no specs, so they were not crawled one by one.
- `imageUrl` is the full-size swatch (`data-src`) and `thumbUrl` is the lazy-load placeholder, both as published. For wood boards and core boards, `imageUrl`/`galleryImageUrls` are the photos that follow each section heading in page order. That link is inferred from position on the page.

## Gaps / what could not be extracted
- **Thickness and sheet sizes**: almost never published per item. Exceptions: glass names include "4 מ״מ", and one acrylic item (ZA03SM) has a note with 2,800x1,300 mm and 0.5 mm. Collection-level figures went into `properties` or `thicknessRangeMm`: Glass Effect 2 mm coating, core-board ranges. All other thickness/size fields are null.
- **Finish**: taken from words in the name (עור, פנינה, משי, מבריק, מט, מוברש, מגורען, מטאלי…) or from the subgroup label (SUPERMATT, TAP, מט/מבריק). For Nano it comes from the collection text ("אולטרה-מט"). The source is stated in `finishSource`. Code suffixes (DT, NT, KB, HR, UM, DG, DM) are not explained on the site, so they were not decoded.
- **Manufacturer per item**: only set when the page ties it clearly: KAINDL wood subgroup, SM'art Italy, SENOSAN acrylics, KAINDL veneer, RENOLIT polymer, LAMITEX, Portaline glass. The other HPL/PL and Nano items and the PET items are null, because the page names several makers without saying which item is whose.
- **nameEn**: no English names are published for decors. Only board types have one (VARIO, LAMI, Butcher Block, PARTICLE BOARD, "PLAYWOOD" as spelled on the page, MDF/CDF expansions).
- **family**: inferred from obvious name words or subgroup labels. Left null for 31 items: stucco, "חולות מדבר", "קליפת ביצה", "אורבן גריי", Italy "טיטניום", all glass, core boards.
- **Polymer**: the page says the full fan deck has about 40 door models, but only 20 decors are listed online. The rest are probably only in the PDF catalog (`קטלוג פולימר ac178.pdf`, linked from the catalog index), which was not parsed.
- **HPL**: the brief expected 80+ decors, but the page lists 62. The Italy page (31) is a separate collection. Neither Nano nor Italy repeats the HPL items.
- **Technical tabs**: these only hold links to PDF info sheets, order forms and videos, not inline specs. The PDFs were not parsed. Properties come from the general-tab text, paraphrased.
- Veneer page mentions TABU veneers, solid oak/walnut boards and solid-wood doors, but none of these are listed as items.
- Some PL swatch images use the matching HPL file name (e.g. KL18DT uses `_KH18DT_1.png`). URLs were kept as published.

## Terms of use / image rights
- No terms-of-use or copyright page was found in the site links. The only legal page linked is the privacy policy, https://www.bluran.co.il/מדיניות-פרטיות. It refers to separate terms: "מהווה חלק בלתי נפרד מתנאי השימוש", but no terms page is linked.
- Each collection page offers a public Google Drive folder for material images and SketchUp files ("להורדת תמונות חומרים וקבצי SketchUp"): https://drive.google.com/drive/folders/1nleAydSkaMl7NzBX7zxcRZbzCWJ7V9iz. No usage licence is stated there. Ask Bluran for permission before hot-linking or re-hosting the swatches.
- robots.txt disallows `/catalog/`, `/mirus/flipbook/` and `*.php`. The collection pages and `/media/catalog/category/…` image paths are not disallowed.
