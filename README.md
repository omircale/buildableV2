# Buildable

A Hebrew (RTL) web app built from one codebase into two sites:

| Edition | Site | What it has |
|---|---|---|
| Contractors | https://buildable.buildable.workers.dev | The design studio: DXF plan → proposed plumbing → checks → approval → field marks → DXF/PDF |
| Hospitality | https://buildable-hospitality.buildable.workers.dev | Property check, space bill of quantities, journey, compare, projects |

Everything runs on Cloudflare: each site is a Worker that serves the built app and answers `/api/*`
(accounts, folders, saved bills, studio projects) from one D1 database shared by both sites.

## Run

```bash
npm install
npm run dev                 # http://localhost:5173 (no /api: signed-out, local-only)
npm test                    # app, engine and Worker tests (Vitest)
npx tsc -b && npm run lint
npm run build               # contractors → dist
npm run build:hospitality   # hospitality → dist-hospitality
```

Deploy (after `npx wrangler login` once):

```bash
npm run build && npx wrangler deploy
npm run build:hospitality && npx wrangler deploy --env hospitality
npx wrangler d1 migrations apply buildable --remote   # when migrations/ has a new file
```

Secrets are set once per Worker with `npx wrangler secret put <NAME>` (add `--env hospitality` for the
second site) and survive deploys: `GOOGLE_CLIENT_SECRET`, `BOOTSTRAP_ADMIN_EMAIL`. The Google client ID
is not a secret and sits in `wrangler.jsonc`.

## Layout

```
src/edition.ts       which routes each edition has (fixed at build time by --mode)
src/engine/          pure TypeScript, no React; studio/ is the design studio's model and drawings
src/state/           zustand stores, kept on the device under the signed-in account
src/cloud/api.ts     the app's only server client: /api/me, places, bills, studio, admin
src/pages, src/ui    screens
worker/              the Worker: index.ts routes, api.ts endpoints, auth.ts Google sign-in
migrations/          D1 schema, applied in order
public/_headers      security headers (CSP, frame-ancestors none, HSTS)
```

## Accounts

- Sign-in is Google only, handled by the Worker (authorization code + PKCE). The session is an HttpOnly
  cookie; the page never sees a token.
- Signing in grants nothing. The admin invites an address; it becomes a member on its first sign-in.
  The bootstrap address becomes admin only while there is no admin.
- Every folder, bill and studio project has an owner, and every query in `worker/api.ts` is scoped to
  the signed-in account. The admin sees counts, never anyone's work. `worker/api.test.ts` checks this
  against a real SQLite database.

## Principles

- **No guessed engineering data.** A value without a source is `null` → GREY, with the reason shown.
- **The proposal is derived.** Only decisions are stored; proposals and issues are recomputed from them,
  and an approval is tied to the revision it approved.
- **No "safe" / "compliant" claims.** Physical verification is always shown as required.

See [docs/ENGINEERING_DATA.md](docs/ENGINEERING_DATA.md) for engineering values and their sources.
