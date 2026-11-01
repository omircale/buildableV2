# Buildable — rules for AI developers

Read README.md and docs/ENGINEERING_DATA.md first.

- Never add an engineering number without a source and a value kind. Unknown stays `null` → GREY.
- All geometry comes from `src/engine/templates/*`. UI, exports and validation must not compute their own dimensions.
- Any change to formulas, factors or materials needs a Vitest case with a hand-checked expected value.
- Fix suggestions and any AI output must be `DesignChange` objects, re-validated through `runDesign` before display.
- Do not generate G-code or claim standard compliance.
- Data lives in Cloudflare D1 behind the Worker (`worker/api.ts`). Every new table gets an `owner_id`, every query is scoped to the signed-in account in the Worker, and the rule is covered in `worker/api.test.ts`. Schema changes are new files in `migrations/`.
- The build has two editions (`npm run build`, `npm run build:hospitality`); `src/edition.ts` decides which routes each one has.
- UI is Hebrew RTL; code and identifiers are English.
- Run `npm test`, `npx tsc -b` and `npm run build` before declaring work done.
