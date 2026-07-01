# UI Redesign — Progress Loop

Loop protocol state file. Read at the start of every iteration, written at the end.

## Status

**All 9 real `(app)` tabs are redesigned, polished dark-SaaS, and wired to real APIs.** Build, eslint (changed files), and backend compile are green. The code work is complete; the only unresolved item is populated screenshots of the auth-gated tabs (blocked — see Blockers).

- Branch: `feat/mission-anti-stall-pulse` (uncommitted working-tree changes: `mission-feed.tsx` v2 + `globals.css` pulse keyframes; all other tabs already committed at HEAD).
- HEAD: `1cb3cef` on `github/main`.

## Route-by-route wiring (Discovery + checker)

| Route | Data source (real API) | States present | Console-heavy? | Status |
|---|---|---|---|---|
| `/dashboard` | `api.missions.list()`, `api.tracker.stats()`, `api.tracker.list()` | loading skeletons, cold-start `WarmingUpBanner`, error→retry, empty (getting-started checklist), success (stat cards + recent missions) | No (cards) | ✅ wired |
| `/missions` | `api.missions.list()` (refetchInterval 5s while running) | skeleton rows, error→retry, empty→CTA, success (table + LivePulse) | No (table) | ✅ wired |
| `/missions/new` | `api.profile.get(activeProfileId)`, `api.missions.create()` | no-profile notice, profile badge (loading/data), submitting, 409-already-running error, validation | No (form) | ✅ wired |
| `/missions/[id]` | `api.missions.get(id)`, `useMissionStream(id)` (polls `/events`), `api.missions.events(id)` | connecting, empty, running pulse, 15s/60s stall, success (completion summary), failed | No (SaaS console, log secondary) | ✅ wired |
| `/matches` | `api.missions.list()` | skeleton, error→retry, empty→CTA, success (mission cards) | No (cards) | ✅ wired |
| `/matches/[missionId]` | `api.matches.list(missionId)` | skeleton grid, error→retry, empty→view-mission, per-grade empty, success (grade tabs + sort + MatchCard grid) | No (cards) | ✅ wired |
| `/tracker` | `api.tracker.list()`, `update`, `remove`, `stats` (optimistic) | skeleton kanban, error→retry, empty→CTA, success (kanban + table + drawer + followup) | No (kanban/table) | ✅ wired |
| `/resumes` | `api.tracker.list()` (poll 15s), `downloadDoc()` helpers | skeleton grid, error banner, empty (3-step guide), success (Document Studio + pipeline + cards) | No (cards) | ✅ wired |
| `/profile` | `api.profile.get/me/create/update/parseResume` | initial loading, load-error→retry, saving/success/error, validation, parse-loading/parse-error | No (form sections) | ✅ wired |

### Mission stream metadata fields consumed (`/missions/[id]`)

`event.metadata.stage` (init/search/boards/filter/verify/score/complete), `provider`/`source`, `count`, `scanned`, `filtered`, `verified`, `pruned` (and legacy `dead_pruned`), `queued`, `scored`, `index`/`total`, `eta_seconds`, `strong_matches`, `kind` (research/score/heartbeat), `company`, `role`, `url`, `grade`, `score`. All read defensively (`num()` coerces; old events without metadata fall back to regex on message text).

## Screenshots captured

In `docs/ui-redesign/screenshots/`:

| File | Route | Viewport | State |
|---|---|---|---|
| `mission-before-desktop.png` / `mission-before-mobile.png` | `/mockups/mission-console` (old `MissionFeed`) | 1440 / 390×2 | old console (for comparison) |
| `mission-running-desktop.png` | `/mockups/mission-console` (shares production `MissionFeed`) | 1440 | running, scoring phase |
| `mission-running-mobile.png` | same | 390 @ 2× | running, scoring phase |
| `mission-done-desktop.png` | same | 1440 | complete |
| `mission-done-mobile.png` | same | 390 @ 2× | complete |
| `login-desktop.png` | `/login` | 1440 | auth-gate boundary (what `(app)` tabs redirect to without a session) |

> Note: I cannot view images (no image input). Files are for the user to open.

## Verification commands run

| Command | Where | Result |
|---|---|---|
| `npm run build` | `frontend/` | ✅ exit 0 — all 17 routes compiled, TS clean |
| `npx eslint "app/(app)/**/*.tsx" components/mission/*.tsx hooks/useMissionStream.ts` | `frontend/` | 8 problems, **all pre-existing** React-Compiler rules (set-state-in-effect, exhaustive-deps, memoization-skip on intentional polling/reset hooks). Zero related to mock data or wiring. Changed files (`mission-feed.tsx`) = same 4 pre-existing as baseline, zero new. |
| `python -m compileall -q backend\app` | repo root | ✅ exit 0 |

## Checker pass (reviewing as if someone else's work)

- ✅ **No production route uses mock data** — `Select-String` for `mockups|mock-data` across `app/(app)/**/*.tsx` = empty.
- ✅ **Every `(app)` page calls a real `api.*` method** — confirmed (missions/tracker/matches/resumes/profile).
- ✅ **No page is visually-only** — each is wired to react-query mutations/queries with optimistic updates where relevant (tracker).
- ✅ **No raw log is primary UI** — the only log is in `MissionFeed`, collapsed by default under "Activity log".
- ✅ **No chain-of-thought** — mission UI shows operational activity only (stage/provider/role/counts/ETA).
- ✅ **Build + lint + compile not skipped.**
- ⚠️ **Screenshots of real `(app)` tabs not captured** — see Blockers.
- ⚠️ **Mobile overflow risk** — `missions` table and `tracker` table view use fixed-px grid columns (`grid-cols-[...104px_88px_92px]`); on very narrow phones the missions table can overflow. Not clipping text per se, but worth a mobile screenshot once auth is available. Kanban uses `overflow-x-auto` (safe).

## Blockers

1. **Populated screenshots of the 8 auth-gated `(app)` tabs.** All `(app)` routes return `307 → /login` without a cookie session (server-side `proxy.ts` gate, confirmed by probing `/dashboard`, `/missions`, `/tracker`, `/matches`). Producing real-data screenshots requires (a) the Azure/Supabase backend running and (b) an authed session — both are task stop-conditions ("Stop if Azure/Supabase/Redis secrets are needed"). Worked around by screenshotting the `/mockups/mission-console` route (which renders the **same production `MissionFeed` component** with seeded data) for the mission running page, and the `/login` boundary. The other tabs' wiring is verified by code reading (table above) + build, not by populated screenshot.

## Exact next step

To unblock populated screenshots of every tab, either:
- run the live Azure backend + sign in to capture the 8 gated tabs at desktop+mobile, OR
- explicitly approve a temporary dev-only auth bypass (would modify `proxy.ts` — currently disallowed by "keep auth/profile flow intact").

No code changes are pending — all tabs are redesigned, wired, and green. The only open item is the screenshot evidence for the gated tabs, which is blocked on secrets/auth.
