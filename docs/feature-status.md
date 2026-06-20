# JobReach AI — Feature Status Tracker

**Last updated:** 2026-06-19  
**Audit method:** Static code review of all frontend pages, components, API routes, and Celery workers.

---

## Legend
| Symbol | Meaning |
|--------|---------|
| ✅ | Working as designed |
| ⚠️ | Works but has UX/logic issues |
| ❌ | Broken / not functional |
| 🔧 | Fixed in this session |

---

## User Stories & Status

### AUTH
| # | User story | Expected behaviour | Status | Notes |
|---|---|---|---|---|
| A1 | User signs up | Account created in Supabase, redirected to onboarding | ✅ | |
| A2 | User signs in | JWT issued, stored in Supabase session | ✅ | |
| A3 | User signs out | Session cleared, redirected to /login | ✅ | |

---

### ONBOARDING
| # | User story | Expected behaviour | Status | Notes |
|---|---|---|---|---|
| O1 | Upload resume | PDF/DOCX parsed → formatted Markdown in under 5s | 🔧 | Fixed: switched to 8B model, 4.5s timeout |
| O2 | Location autocomplete | Dropdown with US states/cities/Remote as user types | ✅ | Built in this session |
| O3 | Skills with years | Up to 10 skills, per-skill year selector, serialised as `"Python (5y)"` | ✅ | Built in this session |
| O4 | Profile saved to DB | `POST /profile/` stores all fields | ✅ | |
| O5 | Redirect after onboarding | Goes to /dashboard on complete | ✅ | |

---

### MISSIONS (AGENT.CONSOLE)
| # | User story | Expected behaviour | Status | Notes |
|---|---|---|---|---|
| M1 | Create mission | `POST /missions/` queues Celery search task | ✅ | |
| M2 | Mission console loads | Shows radar, progress bar, event stream in real time via SSE | ✅ | |
| M3 | Radar always rotates | Sweep never stops during or after search | 🔧 | Fixed in this session |
| M4 | Progress bar never stalls | Ticks 0.4% every 500ms regardless of event rate | 🔧 | Fixed in this session |
| M5 | Company nodes on radar | Radar shows company initials as matches are found | 🔧 | Built in this session |
| M6 | Rich match cards | Cards show company badge, role, score, "NEW" badge | 🔧 | Built in this session |
| M7 | Center flash on match | Radar center pulses cyan when a star event arrives | 🔧 | Built in this session |
| M8 | Mission list page | All missions listed, clicking navigates to match board | ✅ | |
| M9 | Mission completes | Status → completed, SSE stream closes | ✅ | |

---

### MATCHES
| # | User story | Expected behaviour | Status | Notes |
|---|---|---|---|---|
| MA1 | View all matches for mission | Grid of scored job cards, filterable by grade A/B/C | ✅ | |
| MA2 | Sort by score/salary/company | Sorting works client-side | ✅ | |
| MA3 | View job listing | Clicking "View" opens the original job URL in new tab | ✅ | |
| MA4 | Track a job | Clicking "Track" creates an ApplicationOut with status=evaluated | ✅ | |
| MA5 | Track button shows "View in Tracker" | After tracking, button becomes link to /tracker | 🔧 | Fixed in this session |
| MA6 | Company research chips | Funding stage, remote policy, layoff flag shown on card | ✅ | |

---

### RESUME TAILORING
| # | User story | Expected behaviour | Status | Notes |
|---|---|---|---|---|
| R1 | Click "Tailor Resume" | Triggers `POST /resumes/generate`, starts polling | ✅ | |
| R2 | Resume generates under 10s | Task uses 8B model, 8s timeout | 🔧 | Fixed: 70B→8B model |
| R3 | Download button appears | After SUCCESS, "Download resume (.docx)" button shown | ✅ | |
| R4 | Download works reliably | Uses fetch+blob approach (not cross-origin `<a>` click) | 🔧 | Fixed in this session |
| R5 | Resume PDF appears in Resumes page | Worker updates `applications.resume_pdf_url` after generation | 🔧 | Fixed in this session |
| R6 | Resume filename uses candidate name | Server-side filename from profile.full_name | ⚠️ | Partially fixed; uses `Resume_{id}` now |

---

### RESUMES PAGE (DOCUMENT STUDIO)
| # | User story | Expected behaviour | Status | Notes |
|---|---|---|---|---|
| RS1 | Page loads generated documents | Shows all resumes where `applications.resume_pdf_url` is set | 🔧 | Fixed: worker now updates applications table |
| RS2 | Open/download resume | "Resume" link opens DOCX download in new tab | ✅ | |
| RS3 | Cover letter shown if generated | "Cover letter" link appears when `cover_letter_pdf_url` set | ✅ | |
| RS4 | Empty state with guidance | Shows 3-step guide when no docs yet | 🔧 | Redesigned to match missions UI |
| RS5 | UI matches missions console | Dark chrome bar, company badge, mission-console aesthetic | 🔧 | Redesigned in this session |
| RS6 | Auto-refresh every 15s | `refetchInterval: 15_000` — picks up newly generated resumes | 🔧 | Added in this session |

---

### TRACKER
| # | User story | Expected behaviour | Status | Notes |
|---|---|---|---|---|
| T1 | Applications appear after tracking | POST /tracker/ creates row, GET /tracker/ returns it | ✅ | Backend works; RLS not enforced (no user_id filter) |
| T2 | Kanban view: 5 pipeline columns | Evaluated, Applied, Responded, Interview, Offer | ✅ | |
| T3 | Drag card to different column | Optimistic update → PATCH → rollback on error | ✅ | |
| T4 | Archived column | Rejected + Discarded shown in side rail | ✅ | |
| T5 | Click card → drawer opens | AppDrawer slides in with editable fields | ✅ | |
| T6 | Edit status in drawer | PATCH updates status, kanban re-renders | ✅ | |
| T7 | Edit notes in drawer | PATCH updates notes | ✅ | |
| T8 | Set next action + date | PATCH updates next_action and next_action_date | ✅ | |
| T9 | Delete application | DELETE removes from pipeline, drawer closes | ✅ | |
| T10 | Table view | Sortable by status/score/date | ✅ | |
| T11 | View resume from drawer | Opens resume_pdf_url if available | ✅ | |
| T12 | UI matches missions console | Dark chrome bar, pipeline stats, mission aesthetic | 🔧 | Redesigned in this session |
| T13 | Stats bar shows counts per stage | Live count chips in chrome bar header | 🔧 | Added in this session |

---

### DASHBOARD
| # | User story | Expected behaviour | Status | Notes |
|---|---|---|---|---|
| D1 | Overview stats cards | Missions run, matches, in progress, resumes | ✅ | |
| D2 | Getting started checklist | 4-step onboarding progress | ✅ | |
| D3 | Recent missions list | Last 5 missions shown | ✅ | |
| D4 | Cold-start banner | Shows warming animation when API is cold | ✅ | |

---

## Known Remaining Issues

| ID | Issue | Severity | Suggested fix |
|----|-------|----------|---------------|
| I1 | Tracker has no user_id filtering — all users see all applications | HIGH | Add JWT extraction + `eq("user_id", user_id)` to `GET /tracker/` |
| I2 | Resume filename is generic `Resume_{id}.docx` instead of candidate name | MEDIUM | Pass `candidate_name` from task result; set `Content-Disposition` dynamically |
| I3 | No duplicate prevention when tracking same job twice | LOW | Add unique constraint on (user_id, match_id) in applications table |
| I4 | Tracker stats endpoint iterates all rows in Python (O(n)) | LOW | Replace with SQL `GROUP BY status` |
| I5 | Cover letter tone not validated as enum | LOW | Add `Literal["direct","warm","formal"]` type |
| I6 | Research cache TTL 24h may miss recent news | LOW | Reduce to 4h for high-growth/pre-IPO companies |
| I7 | No mission cancellation endpoint | MEDIUM | Add `POST /missions/{id}/cancel` that revokes Celery tasks |
| I8 | No pagination on matches/missions/tracker list endpoints | MEDIUM | Add offset/limit params |
| I9 | Auth signout doesn't use access_token param | LOW | Fix `auth.py` to call `sb.auth.sign_out(token)` |
| I10 | CORS wildcard in production | MEDIUM | Set `allowed_origins` to actual frontend domain |

---

## Session Fix Summary (2026-06-19)

| Area | What was fixed |
|------|---------------|
| Resume speed | 70B model → 8B model; timeout 90s → 8s; tokens 1500 → 900 |
| Resumes page | Worker now updates `applications.resume_pdf_url` after generation |
| Download | Replaced cross-origin `<a>` click with `fetch()+blob` for reliable download |
| Track button | After tracking, shows "View in Tracker" link to /tracker |
| Missions console | Always-rotating radar, company nodes, ticking progress bar, rich match cards |
| Onboarding | Location autocomplete, Skills with years-of-experience |
| Resumes page UI | Dark missions-console chrome bar, company badges, pipeline steps |
| Tracker page UI | Dark chrome bar, pipeline stats grid, count badges per stage |
