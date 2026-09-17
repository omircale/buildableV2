# Buildable

From idea to buildable furniture. Phase 1 closes the loop for an **open shelf unit**:
design → validate → visualize (3D) → manufacture (cut list, nesting, BOM, assembly) → order package.

## Run

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # engine tests (Vitest)
npm run build
npm run deploy   # tests + build + Cloudflare Pages (requires `npx wrangler login` once)
```

Environment: copy `.env.example` to `.env` and set the Supabase URL and publishable key.
The publishable key is safe in the browser because every table is protected by RLS.

## Architecture

```
src/engine/          pure TypeScript, no React — the single source of truth
  types.ts           model, sourced values, checks, design changes
  materials.ts       material library; every number carries kind + source; EC5 factors
  templates/         params → components (geometry) → parts → hardware
  structural/beam.ts beam formulas
  validation/        geometry, materials, structure (deflection + creep + bending), stability, manufacturing
  manufacturing/     guillotine nesting (kerf, trim, grain), BOM, CSV
  index.ts           runDesign(params) — the one pipeline used by UI, exports and tests
src/state/           Zustand store: params, undo/redo, local autosave
src/ui, src/pages    Designer (3D + panels), Login, Admin
src/cloud/           Supabase client: auth, projects, append-only versions, usage events
supabase/migrations  schema + RLS (applied to project `buildable`)
public/_headers      Cloudflare security headers (CSP, frame-ancestors none, HSTS)
```

Principles enforced in code:

- **Single source of geometry.** The 3D view, cut list, nesting and PDF all derive from `buildOpenShelf(params)`.
- **No guessed engineering data.** A value without a source is `null` → status GREY. Assumptions are labelled and cap results at YELLOW.
- **Fixes are re-validated.** Every suggested fix is a `DesignChange` that is run through the full engine before it is shown. The future AI assistant must produce the same `DesignChange` objects.
- **Export is blocked** when geometry, materials, structure or manufacturing is RED.
- **No "safe" / "compliant" claims.** Physical verification is always shown as required.

## Security

- RLS on every table. A signed-up user has **no access** until they have a row in `app_users`.
- `orenmindcet@gmail.com` becomes admin automatically on sign-up (`bootstrap_admin_emails`).
- RLS helper functions live in the non-exposed `private` schema.
- `project_versions` is append-only (no update policy).
- Verified with simulated users: strangers read 0 rows, cannot insert, cannot self-promote; anon is rejected.

See [docs/ENGINEERING_DATA.md](docs/ENGINEERING_DATA.md) for every engineering value and its source.
