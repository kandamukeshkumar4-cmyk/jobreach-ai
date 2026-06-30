# JobReach — Mission Progress Loop

Closed-loop work log for the ongoing-mission "is it frozen?" redesign.
Per the task: inspect → design → backend → frontend → verify → repeat.

---

## Current branch & HEAD

- **Branch:** `main`
- **HEAD (baseline I built on):** `f6e4c89` — `feat(mission): live activity-pulse console + per-job scoring events`
  (this commit contains the pre-existing console redesign that was the starting point)
- **My changes:** uncommitted working-tree modifications on top of `f6e4c89`
  (7 files, +704 / −160). **Not committed** — per task rules, no commit/push/merge
  unless explicitly told.

## Current UI problems (before this pass)

The console at `f6e4c89` already had a strong foundation (Hero with elapsed/ETA,
NowLine, PhaseStepper, SourceBoard, ScoringTracker, 3-stat row, collapsible log,
matches grid). The gaps that still made a mission feel stuck:

1. **No stall detection.** If the backend went quiet during a long single-job
   research+LLM call (10–30s), the UI showed the last action line and a ticking
   clock — but never explicitly said "still working" or "possible stall". A user
   could not tell a live-but-slow run from a frozen one.
2. **No heartbeat during scoring.** `score_job` emitted one "Researching X" event
   at the start of each job and a "Scored X" event at the end. Between them (often
   15–40s) the feed was silent — the dominant "stuck" trigger.
3. **Counters too thin.** Only Scanned/Filtered/Matches were shown. The task asks
   for verified / pruned / queued / scored / strong as distinct counters.
4. **No completion summary.** On done, the matches grid appeared but there was no
     explicit end-state card (scanned/filtered/verified/scored/strong/elapsed/top 3).
5. **No "last update Xs ago" signal** in the hero — only an event count.
6. **ETA was client-only** (derived from scoring rate in the browser). The backend
   never published `eta_seconds`, so the ETA was blind during the first job.
7. **Stage was inferred by regex on message text**, fragile to wording changes.

## Backend event gaps (before this pass)

- `search.py`: events carried no `stage` field; liveness/verify events had no
  `verified`/`pruned` counters in metadata; the score-dispatch event had no
  `queued`/`eta_seconds`; ATS company fetches were **sequential** (18 Greenhouse
  boards × 10s timeout = up to 180s for one source alone — the biggest wall-time
  cost after scoring).
- `score.py`: per-job events had `kind`/`index`/`total` but no `stage`,
  `scored`, `url`, or `eta_seconds`; no heartbeat during the blocking
  research+LLM call; no live ETA refinement from the rolling rate.
- `research.py`: already cached in Redis (24h) — the "avoid repeated company
  research" perf requirement was already met. There was a dead unreachable
  `return result` line after the real return in `fetch_company_research`.

## Frontend changes made

`frontend/components/mission/mission-feed.tsx` (rewritten, preserving all existing
behavior + tokens):

- **`StallBanner`** — appears while `live` and silence ≥ 15s ("Still working —
  waiting for a backend update… (Xs since last event)" + a phase-specific
  "why it may feel slow" reason) and ≥ 60s ("Possible stall" + a
  `Check for update` button that calls `onRefreshStall`). `role="alert"`/
  `aria-live` set per WCAG.
- **`CounterStrip`** — replaces the 3-stat row with 6 animated counters:
  Scanned / Filtered / Verified / Pruned / Scored / Strong. Each cell is its own
  `CounterCell` component (fixes the hooks-in-loop rule) using `useCountUp`.
  `num()` helper fixed so `0`/`"0"` render as `0`, not `—`.
- **`CompletionSummary`** — end-state card (done only): checkmark + elapsed +
  6 summary stats + top 3 matches by score.
- **`RecentStrip`** — always-visible compact last-4-events timeline above the
  collapsible full log.
- **`Hero`** — added "updated Xs ago" indicator that fades amber after 15s of
  silence (second anti-stuck signal alongside the per-second clock).
- **Backend ETA preferred** — `latestBackendEta(events)` is used over the
  client estimate when the worker publishes `eta_seconds`.
- **`computeStages`** now reads `meta.stage` first (init/search/boards/filter/
  verify/score/complete → index), with the regex fallback kept for old events
  and the pre-metadata mockup script.
- **`deriveCounters`** scans event metadata (scanned/filtered/verified/pruned/
  queued/scored/strong) with mission-total + scoring-tracker fallbacks.
- **`deriveScoring`** now also tracks `heartbeat` events as the in-flight role
  (so the "Researching X" line stays accurate during a long single-job call) and
  carries `etaSeconds`.
- **`currentAction`** shows the heartbeat message when the latest event is a
  heartbeat (truthful "still scoring X" line).
- Collapsible log gained the `feed-scroll` scrollbar class.

`frontend/hooks/useMissionStream.ts`:
- Now returns `lastEventAt` (epoch-ms of the most recent event's `created_at`)
  and `refresh()` (bumps a `refreshTick` state that re-runs the polling effect,
  cancelling any backed-off timer — the 60s stall recovery path).

`frontend/app/(app)/missions/[id]/page.tsx`:
- Destructures `lastEventAt` + `refresh` from the hook and passes them to
  `MissionFeed` as `lastEventAt` / `onRefreshStall`.

`frontend/app/mockups/mission-console/page.tsx` (seeded mission):
- Script updated with the new event shapes: `stage` on every event, `provider`/
  `source`/`count`/`scanned` on board events, `verified`/`pruned` on verify,
  `queued`/`eta_seconds` on score-dispatch, a `kind:"heartbeat"` event during
  the Stripe scoring, and `scored`/`eta_seconds` on each score event.
- Passes `lastEventAt` + `onRefreshStall` so pausing the playback demonstrates
  the 15s/60s stall banners.

## Backend changes made

`backend/app/workers/search.py`:
- **ATS company fetches parallelized.** `_search_ats_feeds` now runs each
  company's board fetch through `_parallel_flatten` (ThreadPoolExecutor,
  max_workers=12, single-threaded fallback). Previously sequential per ATS;
  worst case ~450s across all ATS → now bounded by the slowest single board.
- Every `_pub` call now carries structured `metadata`: `stage`, `provider`,
  `source`, `count`, `scanned`, `filtered`, `verified`, `pruned`, `queued`,
  `total`, `eta_seconds`, `by_source` (as applicable).
- Verify-start event carries `{stage:"verify", total, scanned, filtered}`;
  verify-end carries `{stage:"verify", verified, pruned, scanned, filtered}`.
- Score-dispatch event carries `{stage:"score", queued, scanned, filtered,
  verified, total, eta_seconds}` with a seeded ETA (`queued * _SCORE_RATE_SEED`,
  `_SCORE_RATE_SEED = 12`s/job).
- Seeds `mission:{id}:rate` hash `{total}` and deletes `score_start_ms` +
  `attempted` so stale state from a prior run can't poison the rate/counter.
- Failure event carries `{stage:"complete", error}`.

`backend/app/workers/score.py`:
- **Throttled scoring heartbeat.** `_start_scoring_heartbeat` spawns a daemon
  thread that publishes a DB `info` row every ~8s (`_HB_INTERVAL`) while the
  blocking research+LLM call is in flight, capped at 8 rows/job
  (`_HB_MAX_PER_JOB`, 64s window — past that the frontend's 60s stall UI takes
  over). Metadata: `{kind:"heartbeat", stage:"score", company, role,
  elapsed_job_sec, index, total, scored, eta_seconds}`. DB is the right channel
  because the frontend polls the events table (SSE is buffered out on Azure App
  Service). The per-second visual pulse stays client-side (elapsed clock).
- **Live ETA.** `_scoring_eta` records the phase start via `setnx` on the first
  completed job and recomputes `remaining / (done / elapsed)` each job, capped
  at 30min. Published as `eta_seconds` on every score/heartbeat event.
- All per-job events now carry `stage:"score"`, `url`, `scored`, `eta_seconds`.
- Completion event carries `{stage:"complete", strong_matches, total_scored,
  scored, queued}`.
- `_scoring_total` reads the Redis `rate` hash first (no DB round-trip), falls
  back to the mission row.

`backend/app/workers/research.py`:
- Removed the dead unreachable `return result` after the real return in
  `fetch_company_research` (was a latent `NameError` if ever reached).

## Verification evidence

### Hard gates

| Gate | Command | Result |
|---|---|---|
| Frontend build | `npm run build` (in `frontend/`) | **PASS** — exit 0. `✓ Compiled successfully in 9.3s`, TypeScript clean (18.7s), all 17 routes generated incl. `/mockups/mission-console`. |
| Backend compile | `python -m compileall -q backend\app` | **PASS** — exit 0 (run multiple times, incl. after every backend edit). |
| Focused lint | `npx eslint components/mission/mission-feed.tsx hooks/useMissionStream.ts` | **5 errors — all pre-existing.** Baseline (HEAD `f6e4c89` extracts) produces the identical 5: `set-state-in-effect` ×3 (useCountUp reduced-motion fast path, useRotatingHint reset, useMissionStream poll reset), `Compilation Skipped: memoization` ×2 (currentAction, startMs). **Zero new errors introduced** by this change. See "Pre-existing lint" below. |

### Pre-existing lint (documented separately, unrelated to this change)

All 5 are React-Compiler rules on intentional patterns carried over from `f6e4c89`:
- `mission-feed.tsx` `useCountUp`: `setVal(target)` for the reduced-motion fast path.
- `mission-feed.tsx` `useRotatingHint`: `setIdx(0)` to reset the hint index on phase change.
- `mission-feed.tsx` `currentAction` / `startMs`: `useMemo` the compiler can't auto-preserve (early returns + `.at(-1)`); functionally correct, just not compiler-memoized.
- `useMissionStream.ts`: `setEvents([]); setStatus('connecting')` to reset on missionId change (polling hook lifecycle).
The mockup page also has 2 pre-existing `Date.now` purity errors (identical to HEAD).

### Seeded-mission UI check (no backend needed)

Served the production build (`node node_modules/next/dist/bin/next start -p 4321`)
and fetched `http://localhost:4321/mockups/mission-console`:

```
HTML_LEN=23177
CHECK elapsed            = YES
CHECK Search/Boards/Filter/Verify/Score = YES   (PhaseStepper, all 5 stages)
CHECK Scanned/Filtered/Verified/Pruned/Scored/Strong = YES  (CounterStrip, all 6)
CHECK Recent activity    = YES
CHECK Candidate profile  = YES
CHECK Exa returned       = YES
CHECK Deep-scoring       = no   (correct: prerender state is n=3, search phase)
CHECK Top matches        = no   (correct: no matches yet at n=3)
```

The page prerenders without runtime errors (build statically generated it) and
the served HTML contains every new structural element. "Deep-scoring"/"Top
matches" are absent only because the initial prerender state is the first 3
script events (search phase); they appear client-side once scoring events stream
in via the playback timer.

### Exact commands run

```powershell
# backend
python -m compileall -q backend\app

# frontend
npm run build
npx eslint components/mission/mission-feed.tsx hooks/useMissionStream.ts
npx eslint components/mission/mission-meta.tsx "app/(app)/missions/[id]/page.tsx" app/mockups/mission-console/page.tsx

# seeded UI (production server)
node node_modules/next/dist/bin/next start -p 4321
Invoke-WebRequest http://localhost:4321/mockups/mission-console
```

## What remains unverified

- **Live browser animation.** I cannot execute JS in a headed browser here, so
  the following client-side runtime behaviors are verified by build + TypeScript +
  prerender only, not by a visual screenshot:
  - count-up animation on the 6 counters
  - the 15s "Still working" and 60s "Possible stall" banners appearing live when
    playback is paused (logic is present and wired; `lastEventAt` flows from the
    hook to the feed)
  - scoring-tracker progress bar filling and ETA counting down as score events
    stream in
  - `CompletionSummary` rendering at done with top-3
  - heartbeat-driven `currentAction` ("Still scoring X… (8s in this role)")
- **Real backend run.** Not executed — would need Azure/Supabase/Redis secrets,
  which is a task stop-condition. The event shapes were verified instead via the
  seeded mockup script that mirrors the new metadata exactly.

## Was speed actually improved?

**Yes — two real speedups, not just visibility:**

1. **ATS source fetching parallelized** (`search.py`). Company board fetches
   within Greenhouse/Lever/Ashby/SmartRecruiters now run concurrently
   (ThreadPoolExecutor, 12 workers) instead of sequentially. This is the largest
   non-scoring wall-time cost: e.g. 18 Greenhouse boards at up to 10s timeout
   each was ~180s worst case for one ATS → now bounded by the slowest single
   board (~10–20s). Single-threaded fallback is kept for safety.
2. **Scoring heartbeat + live ETA** don't make scoring faster, but they
   eliminate the *perception* of a stall during the genuinely long research+LLM
   phase, which was the primary user complaint.

Perf items already satisfied by the baseline (kept, not re-done): company
research cached 24h in Redis (`research.py`), URL dedup, SCORE_CAP bound on
liveness + scoring, round-robin interleave by source, partial matches streamed
as soon as scored. I did **not** raise Celery concurrency (task warned of OOM
risk) and did **not** reduce the liveness pool (already 12 workers, already
bounded to `SCORE_CAP*2`).

## Remaining blockers

None blocking the hard gates. The only open items are the visual/live-run
verifications listed above, which require either a headed browser or backend
secrets (a task stop-condition).
