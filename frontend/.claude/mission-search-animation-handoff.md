# Mission Search Animation Handoff

## Goal

Replace the plain terminal waiting state with an anticipatory live-search surface. The user should feel the backend is actively doing useful work while internet search, ATS scans, live verification, company research, and scoring are running.

## Current Hookup

- UI component: `frontend/components/mission/mission-feed.tsx`
- Row renderer: `frontend/components/mission/feed-item.tsx`
- Mission page: `frontend/app/(app)/missions/[id]/page.tsx`
- Review mockup route: `/mockups/mission-search-animation`
- Stream source: `useMissionStream(id)` in `frontend/hooks/useMissionStream.ts`
- Input events: `MissionEventOut[]` with `event_type`, `message`, `detail`, `metadata`, and `created_at`

The redesigned component does not require a new API contract. It derives stage, source progress, and emerging matches from streamed event text and event types.

## Backend Event Loop Contract

For the best UI behavior, emit events in this loop:

1. `run`: profile loaded and search accepted.
2. `run`: Exa semantic web search started.
3. `ok`: Exa returned N postings.
4. `run`: ATS feeds started.
5. `ok`: ATS feeds returned N postings, ideally with detail by source.
6. `run`: RSS feeds started.
7. `ok`: RSS returned N postings.
8. `ok`: scanned N postings across N sources.
9. `run`: applying filters.
10. `ok`: filtered to N matching roles.
11. `run`: verifying N postings are still live.
12. `ok`: pruned N dead/closed postings, N verified live.
13. `run`: deep-researching N companies and scoring roles.
14. `star`: match found lines as each high-quality role is ready.
15. `ok`: mission complete.

Keep each event small and incremental. Do not wait until the end to emit all progress; the animation depends on a steady event cadence.

## Preferred Metadata

The UI currently parses text, but Claude should move it toward metadata when backend time allows:

```json
{
  "stage": "search|verify|research|score",
  "source": "exa|ats|rss|filter|live_verification|company_research|scoring",
  "value": 52,
  "total": 60,
  "match": {
    "title": "Applied AI Engineer",
    "company": "Anthropic",
    "score": 4.3
  }
}
```

If metadata exists, update `buildSourceProgress()` and `buildEmergingMatches()` to prefer metadata and fall back to text parsing.

## Scroll And Motion Behavior

- Keep auto-scroll pinned only while the user is near the bottom.
- If the user scrolls up, show the `Jump to latest` button and stop forcing scroll.
- Highlight only the newest live row.
- Keep the sticky current-step capsule visible above the feed.
- Let match cards appear as soon as `star` events arrive, not only after mission completion.
- Respect `prefers-reduced-motion`; the CSS already disables radar, cursor, rail, and card entrance animations.

## Visual Rules

- Preserve the dark terminal identity from the screenshots.
- Use cyan for active work, green for completed source checks, amber for verification/caution, violet for research.
- Do not add mascots, stock illustrations, or marketing copy.
- Use mono text for console chrome, stage labels, metrics, and source rows.
- Keep the right panel factual: show what is happening, not fake promises.
