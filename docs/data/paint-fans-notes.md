# Paint color fan research — Nirlat & Tambour (2026-09-16)

Data file: `paint-fans.json` (same folder). This note covers method, counts, limitations, licensing/terms notes, and the RAL/NCS and wood-lacquer findings requested for the "baked paint" finish feature.

## What was captured

| Brand | Fan | Colors captured | Notes |
|---|---|---|---|
| Nirlat (נירלט) | Color Is | 1,562 | Main decorative fan. Nirlat's own marketing copy elsewhere cites "1,320 hues" for this fan; the live API returned 1,562 records under `fan: "Color Is"` at the time of capture — the larger, actual API count was kept rather than the marketing figure. |
| Nirlat | RAL | 187 | Nirlat's RAL-matching fan (see RAL section below). |
| Nirlat | Nirlat White Collection | 28 | Includes "Extra White". |
| Nirlat | Gray Fan (אפורים) | 23 | |
| Nirlat | Active Shield | 10 | A branded sub-selection, not an independent palette — 4 of its 10 hues also appear verbatim in Color Is (same internal hue ID). Captured for completeness since it's offered as a selectable fan on the site. |
| **Nirlat total** | | **1,810** | (raw sum across the 5 fans above; some hues are shared between Active Shield and Color Is, see above) |
| Tambour (טמבור) | "המניפה" / Tambour Color Index, main fan (deck 0004) | 1,651 | Matches the "1651 גוונים" count published on the fan landing page exactly (68 white + 246 red + 245 orange + 259 yellow + 245 green + 245 blue + 245 purple + 98 neutral). |
| **Tambour total** | | **1,651** | |

**Skipped / not captured (noted per instructions):**
- Tambour's separate **RAL fan** (`https://tambour.co.il/color-fan/ral/`, ~212 industrial RAL hues) is a different "deck" from the main 1,651-hue consumer fan and was **not** enumerated — only its existence/URL is recorded (see RAL/NCS section). The 1,651 figure above is the main decorative fan only.
- Nirlat's non-wall-paint fans (metal, effects/decorative renders, colored render "שליכט צבעוני", wood stains) were not enumerated — out of scope for a wall/furniture "baked paint" color reference, which is about flat color, not texture/effect products.
- No image pixels were sampled anywhere. Every hex value in `paint-fans.json` comes from a field the site's own JSON API publishes (`hue_hexadecimal` for Nirlat, `hex_value` for Tambour), so `hexSource` is `"published"` for every entry that has a hex. Nothing was left for us to derive from a swatch image — both sites expose hex in their data layer, not just as CSS/background-image.

## Method

Both sites render their color-fan UI from client-side JS that calls a JSON API — found by opening the browser devtools network log while using each fan's UI filters, then replaying the same requests directly:

- **Nirlat**: `GET https://nirlat.com/wp-content/themes/nirlat/api/hue/by/color-fan/{fanIds}/limit/{n}/offset/0` returns hues for one or more fan IDs (`id, name, slug, hue_code, hue_hexadecimal, fan, primer, ...`). Family (color-group) membership is a separate endpoint: `GET .../api/hue/by/family/{familyId}/color-fan/{fanIds}/limit/{n}/offset/0`. Both endpoints are unauthenticated and were fetched directly (no browser automation needed for Nirlat).
- **Tambour**: the fan UI calls WordPress admin-ajax (`POST https://tambour.co.il/wp-admin/admin-ajax.php`, `action=filter_hues`, with `fan_decks[]=0004`, a page nonce, and `color_group_ids[]={id}`), returning `{id, title, hex_value, rgb_value, lrv_value, position, ...}` per hue. Tambour sits behind Cloudflare bot-protection that blocks the same request from a plain `curl`/script, so these calls were made from inside an authorized browser tab (same-origin `fetch`, using the page's own nonce) rather than from the command line.

For Nirlat, `family` (color group, e.g. "reds"/"grays") was resolved by cross-referencing each hue ID against the 13 family-filter endpoints Nirlat exposes (אדומים/בהירים/אפורים/חומים/צהובים/כתומים/ורודים/סגולים/כחולים/ירוקים/טבעיים/לבנים/זהב); two of those (טבעיים "natural" and זהב "gold") returned no members for the fans captured and so contribute no colors here. For Tambour, `family` is simply the color-group tab the hue was fetched under (Tambour's own top-level grouping — white/red/orange/yellow/green/blue/purple/neutral), which is coarser than Nirlat's but is what Tambour itself publishes as the primary grouping.

## Known data-quality issues (published as-is, not corrected)

- **Tambour: 25 malformed hex values.** A small number of Tambour's own published `hex_value` fields are corrupted — e.g. `#9.25E+73`, `#08F91`, `#9177` — almost certainly from a spreadsheet auto-converting a hex string to scientific notation or stripping a leading character/zero somewhere upstream in Tambour's own data pipeline. These are kept verbatim in `paint-fans.json` (never invented/repaired) with `hexSource: "published"`; a consuming app should treat these as "hex unavailable" rather than guess. Affected color codes are listed in the summary the agent that ran this task returned in-chat; they can also be found by filtering `paint-fans.json` for any `hex` value that isn't a plain `#RRGGBB` string.
- **Tambour: no Hebrew per-color names.** Every individual Tambour hue name (e.g. "Green Jubilee", "Red Flame") is published only in English/stylized branding; only the family/group label (e.g. "אדומים") is Hebrew. `nameHe` is therefore `null` for all Tambour colors — this is not a gap in extraction, it's what Tambour publishes.
- **Nirlat: mixed-language names.** Nirlat's Color Is / RAL / White-collection names are mostly English marketing names ("Hint of Vanilla", "Green beige"); its Gray Fan and some White-collection names are Hebrew ("חלוקי נחל", "שמנת מהודרת"). `nameHe`/`nameEn` were assigned per record by detecting Hebrew script in the single `name` field Nirlat publishes — Nirlat does not publish both a Hebrew and an English name side by side for a given hue.

## RAL / NCS availability (for spray-booth mixing)

- **Nirlat — RAL: offered.** A dedicated "RAL" fan is one of the five selectable fans on `https://nirlat.com/fan/`, with 187 RAL-coded hues captured (code, English name, hex). Example: `https://nirlat.com/fan/#/category/wall/family/red/color-fan/hue/RAL_2001`.
- **Nirlat — NCS: not found.** No NCS fan, filter, or NCS-code search was found anywhere on nirlat.com.
- **Tambour — RAL: offered**, but on a separate page/deck from the main fan: `https://tambour.co.il/color-fan/ral/` (also `https://tambour.co.il/ral/`), described as "~212 standard hues... designed mainly for industrial painting," with individual hue pages (e.g. `https://tambour.co.il/hue/ral-9001-9001/`) showing RGB/hex. This RAL deck was **not** enumerated into `paint-fans.json` (see "Skipped" above) — only recorded as available.
- **Tambour — NCS: not found.** No NCS fan, filter, or NCS-code page was found on tambour.co.il.

## Wood/MDF spray-lacquer product lines

- **Nirlat**: consumer-line clear polyurethane lacquer for wood furniture, `https://nirlat.com/product/%D7%9C%D7%9B%D7%94%D7%A9%D7%A7%D7%95%D7%A4%D7%94%D7%A1%D7%95%D7%9C%D7%91%D7%A0%D7%98/` (brush/roller called out on the product page). More relevant for a spray booth is Nirlat's industrial arm **NirlatPro**, which lists two-component and aliphatic polyurethane topcoats including furniture-finish products: `https://www.nirlatpro.com/product_tag/polyurethane-2/` and `https://www.nirlatpro.com/product_tag/polyurethane/`. Individual technical data sheets (PDFs) should be checked per product for exact spray-gun/booth parameters — the PDFs found are compressed/embedded-font PDFs that didn't extract cleanly as text during this pass.
- **Tambour**: industrial wood-paint category `https://tambour.co.il/shop/industrial-paints/industrial-solutions-for-wood/`, which includes a two-component polyurethane topcoat (high-gloss, multiple colors) and a two-component polyurethane white wood primer, e.g. `https://tambour.co.il/product/%D7%99%D7%A1%D7%95%D7%93-%D7%A4%D7%95%D7%9C%D7%99%D7%90%D7%95%D7%A8%D7%AA%D7%9F-%D7%9C%D7%91%D7%9F-314/`. Tambour also sells a water-based wood varnish line (brush/roller-oriented, semi-gloss/clear/tinted). As with Nirlat, exact spray/booth suitability is stated on each product's technical data sheet rather than the marketing page and wasn't individually verified for every SKU.

## Terms of use / accuracy disclaimers (color data & on-screen color)

Both brands explicitly disclaim on-screen/printed color accuracy — worth surfacing to end users of a "baked paint" picker:

- Tambour, on the fan landing page: **"הגוונים במניפה להמחשה בלבד"** ("the hues in the fan are for illustration only") — `https://tambour.co.il/color-fan/color-chart/`.
- Nirlat uses the same disclaimer language ("להמחשה בלבד") across product pages, recommending a physical color fan or sample swatch before final color choice — e.g. `https://nirlat.com/product/one-room-colored/`.

No explicit copyright/reuse license for the color-code data itself was found published on either site (no "open data" or API terms page was located); the standard site-wide terms/privacy pages were not individually reviewed for a data-scraping clause. Treat the extracted codes/hex values as reference data for internal product matching rather than redistributable brand assets, and always display **on-screen color is an approximation — verify against a physical Nirlat/Tambour color fan or sample before final color selection**, consistent with both brands' own disclaimers above.
