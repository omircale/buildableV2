# Buildable — rules for AI developers

Read README.md and docs/ENGINEERING_DATA.md first.

- Never add an engineering number without a source and a value kind. Unknown stays `null` → GREY.
- All geometry comes from `src/engine/templates/*`. UI, exports and validation must not compute their own dimensions.
- Any change to formulas, factors or materials needs a Vitest case with a hand-checked expected value.
- Fix suggestions and any AI output must be `DesignChange` objects, re-validated through `runDesign` before display.
- Do not generate G-code or claim standard compliance.
- Every new Supabase table: enable RLS, add policies gated on `private.is_member()` / `private.is_admin()`, run the security advisor.
- UI is Hebrew RTL; code and identifiers are English.
- Run `npm test`, `npx tsc -b` and `npm run build` before declaring work done.
