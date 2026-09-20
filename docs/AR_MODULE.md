# AR module — see the design at full size

Status 2026-09-20: **step 1 shipped** (3D file export), step 2 (in-room AR straight from the site) waits for deployment.

## What it does

The review screen offers a 3D file of the current design at true 1:1 scale:

- **USDZ** for iPhone/iPad — opening the file (Files, WhatsApp, e-mail) starts Apple AR Quick Look: point at the floor and the piece appears at its real size.
- **GLB (glTF binary)** for Android viewers and 3D software (Blender, model-viewer, Scene Viewer).

The device's own format is offered first; the other stays available for sending to someone else.

## How it is built, and why not the way the first draft proposed

| Decision | Reason |
|---|---|
| The exported scene is built **from the model**, not grabbed from the live canvas | Deterministic and testable; the editor's grid, floor, dimension labels and selection highlights never leak into the file |
| Millimetres → metres, **centred on the footprint with the base at y = 0** | AR viewers place a model on the floor at the origin; this is what makes 1:1 scale correct |
| Every mesh carries the **part id, its name and its cut size**; the scene carries project, overall size, part count and weight | The file doubles as a readable handoff to anyone opening it in 3D software |
| USDZ written with **plane anchoring, horizontal alignment, Quick Look compatible mode** | Furniture stands on the floor; Quick Look is stricter than plain USD. (The first draft passed `{ binary: true }`, which USDZ has no such option for.) |
| Reference items (mattress, steel bar) are included but visually distinct, and can be excluded | Seeing a bed without its mattress is confusing; but they are not parts that get cut |
| Both exporters are **loaded on demand** | They stay out of the main download until someone asks for a file |

## Why in-room AR from the website is a second step

`blob:` URLs — files that exist only inside the browser tab — **do not work with AR Quick Look or Google Scene Viewer**. Both are separate system apps that fetch the file over the network. Placing the piece in the room directly from a web page therefore needs:

1. the exported file uploaded to hosting with a public https address (Cloudflare or Supabase Storage),
2. `@google/model-viewer` bundled with the site (not from a CDN — external scripts are blocked by our security headers),
3. a mobile-friendly page, and a QR code so the design can jump from desktop to phone.

Until then, downloading the file and opening it on the phone gives the same AR result on iPhone, with one extra step.

## Verified

`src/ui/ar/arExport.test.ts` builds and checks real files for **every catalog item in both formats**: glTF binary magic and version, USDZ zip archive containing `model.usda` with the anchoring properties, base on the ground, centred footprint, part names and cut sizes present, and colours that follow each part's decor. Checked in the real browser too: GLB 77 KB and USDZ 130 KB for the Montessori bed.

## Next

- Host the file and add the in-room button (with deployment).
- A QR code to move from desktop to phone.
- Wall-mounted furniture should anchor to a **vertical** plane instead of the floor.
- Realistic materials in AR depend on the material-photo decision (audit 4).
