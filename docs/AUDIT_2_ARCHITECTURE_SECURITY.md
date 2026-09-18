# Audit 2 of 5 — Architecture, load, DevOps and security

Date: 2026-09-17/18. Scope: what has to be right *before* the product goes online.

## 1. Security

### Database access rules — tested against the live project, not just read

The rules were tested by impersonating real roles inside the database (anonymous / signed-in stranger), in a transaction:

| Test | Result |
|---|---|
| Anonymous visitor reads projects | **denied** (no table permission) |
| Anonymous visitor reads the reporting view | **denied** |
| Signed-in stranger (not a member) creates a project | **denied** by row-level security |
| Signed-in stranger reads settings | **0 rows** |
| Signed-in stranger makes themselves admin | **denied** |
| Signed-in user reads the admin e-mail list | **denied** |
| **Unconfirmed sign-up with the bootstrap e-mail becomes admin** | **granted — this is the hole** |

Supabase security advisor: one informational note (the admin e-mail table has no policies, which is deliberate — nobody may read it).

### The hole, and the fix

Admin was granted the moment an account was *created* with `orenmindcet@gmail.com`, without the mailbox being confirmed. The database currently has **no users at all**, so the address is unclaimed: whoever registers it first would receive the admin row. Whether they could then sign in depends on the Supabase "Confirm email" setting, which is outside the code.

Prepared as `supabase/migrations/0003_bootstrap_on_confirmed_email.sql` (**not applied — waiting for the owner's approval**):
1. Admin is granted only when the address is confirmed (at sign-up if already confirmed, otherwise on confirmation).
2. `revoke` the leftover anonymous grants on `admin_storage_by_user` (the view was created after the blanket revoke, so it kept them; RLS still blocked the data, but the grants should not exist).
3. Advisor warnings: split the overlapping "for all" policies on `app_settings` / `app_users`; add the missing index on `app_settings.updated_by`.

**Also for the owner to check in the Supabase dashboard:** Authentication → Providers → Email → "Confirm email" must be on, and Authentication → Users should contain no unexpected accounts (during testing I created two fake users inside a transaction; the check whether they were committed was blocked by the permission guard and is still pending).

### Application security

- **Headers actually exercised.** The built site was served locally with the exact production headers (CSP, HSTS, no framing, no object, strict referrer). Home, the 3D editor and PDF export all ran with **zero policy violations**. This had never been tested before, because the headers only apply once deployed.
- **No external resources.** No CDN, no web fonts, no external images. The URLs in the bundle are documentation strings inside libraries, not loads.
- **Secrets.** `.env` is ignored by git; only the publishable key reaches the browser, which is its purpose. No service key anywhere in the repo.
- **Dependencies:** `npm audit` — 0 vulnerabilities.

## 2. Load and performance

| Measure | Before | After | Note |
|---|---|---|---|
| Home page download | 447 KB compressed | **177 KB** | The 3D editor and admin screen now load only when opened |
| Editor (on demand) | — | 268 KB | Loaded when entering the editor |
| Engine run (worst case: floor bed, wide failing bookcase) | — | **0.2–1.5 ms** | Runs on every keystroke; no perceptible cost |
| Full test suite | — | 3.1 s for 2,723 tests | Fast enough for every commit |

Scale: everything is computed in the browser, so traffic costs nothing but static hosting. The database only stores projects and versions, so Supabase's free tier is far from being a constraint for a single user.

## 3. Durability — the most serious risk found

Projects live **only in this browser**. Clearing browser data deletes every design, with no copy anywhere. Fixed:
- **Back up all projects to a file** and **restore from a backup**, on the My projects page (merges by project id; a file that is not a backup changes nothing).
- A plain sentence on that page saying projects live in this browser only.
- If the browser refuses to save (private mode, storage full), a **red banner** now says so instead of failing silently.
- A render crash no longer shows a blank page: a **crash screen** states the designs are safe, offers a one-click backup, and reloads.

## 4. DevOps

- **CI added** (`.github/workflows/ci.yml`): types, lint, tests, build and a dependency-vulnerability check on every push and pull request. Waiting for the repository to exist.
- **Deployment** is a single command (`npm run deploy` → Cloudflare Pages); `_headers` ships with the build (verified present in `dist/`).
- **Still missing (recommended before launch):** error monitoring in production, a check that Supabase backups match what we need, and a plan for what happens to saved projects when an engineering rule changes (today a saved design is re-validated with the current rules, and its status can change without the user being told).

## 5. Architecture

The engine is pure and fully tested, and geometry has a single source of truth — that part is healthy. The weak spots are size rather than structure:

| File | Lines | Note |
|---|---|---|
| `src/engine/validation/validate.ts` | 1031 | Should split per check family (geometry / materials / structure / manufacturing) |
| `src/i18n/index.ts` | 865 | Should split per screen; parity is covered by a test |
| `src/ui/DesignControls.tsx` | 596 | Several panels in one file |

None of this affects users, so I did not restructure during an audit. Recommended when the next feature touches these files.

## 6. Fixed in this audit

1. Home page download reduced by 60 % (code splitting).
2. Backup of all projects, and restore.
3. Visible warning when the browser cannot save.
4. Crash screen with a backup button instead of a blank page.
5. CI workflow.
6. Production headers verified against the real build.
7. Security migration prepared (awaiting approval).
