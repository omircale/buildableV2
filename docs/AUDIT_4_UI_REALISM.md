# Audit 4 of 5 — UI and realism

Date: 2026-09-18. Method: screenshots of the same design in every combination (realistic / illustration × light / dark × several camera angles), compared against what the toggle promises; render cost measured directly from the renderer.

## The honest starting point

"Realistic" was not realistic. It differed from "illustration" only by flat shading: the same flat colour, no reflections, no shadow on the floor, nothing telling the eye the piece stands on a surface. Two modes that look alike make the toggle pointless.

## What changed

| Change | Why it matters |
|---|---|
| **Environment lighting** generated locally by three.js (a virtual room), no external file and no CDN | This is what makes a surface read as a material instead of a flat fill. It respects the rule that nothing loads from outside. |
| **Filmic tone mapping** in realistic mode only | Highlights stop clipping to white; the diagram look stays exact |
| **A floor that receives shadows**, plus a tuned contact shadow | The piece now stands on something. The cast shadow is clearly visible from the front view |
| **Outlines separated per mode** | Illustration: crisp dark outlines (a technical drawing). Realistic: faint outlines, and none at all on reference items (mattress, steel bar), which should not look like cut boards |
| Grid only in the diagram modes | The grid is a measuring aid, not part of a photo |

Light and dark were both re-checked; each needed its own light and shadow strengths, which are now separate.

## Performance

Measured directly on the renderer (30 consecutive frames):

| Mode | Cost per frame | Triangles |
|---|---|---|
| Realistic | **0.36 ms** | 3,868 |
| Illustration | 0.46 ms | 3,938 |

Realism costs nothing here — the scene is a few thousand triangles. Frame-rate numbers from the automated pane are meaningless (the embedded pane throttles animation frames), which is why frame cost was measured instead.

## What is still not realistic, and why

| Gap | Status |
|---|---|
| **No wood grain** — boards are a single colour | By decision: real material photos from the supplier catalogue (stage 3), not a synthetic fake texture. This is the single biggest remaining gap. |
| **Plywood edges don't show the plies** | The characteristic look of birch plywood is the striped edge. Needs either a photo texture or a deliberate edge material — same stage. |
| **The mattress reads as a board** | It is drawn as a box. It needs a soft material and rounded corners to look like a mattress. |
| **Colours are approximations** | The decor colours in the catalogue are our visual approximation of the supplier's named decors, stated as such in the data. Real swatches come with the photos. |
| **No room context or scale reference** | Nothing in the view says how big the piece is. A floor/wall corner, or a human silhouette, would help — worth doing together with AR. |

## Recommended order for the rest

1. Real material photos from the supplier catalogue (also unlocks AR looking right) — **requires the image-permission decision**.
2. Plywood edge treatment.
3. Mattress and soft items rendered as soft materials.
4. Room context and a scale reference.
