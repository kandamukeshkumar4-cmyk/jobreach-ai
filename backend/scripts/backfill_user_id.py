"""Backfill / report NULL user_id on profiles, missions, and applications.

Run from the backend/ dir with the real env (.env / app settings) loaded:
    python -m scripts.backfill_user_id            # REPORT ONLY (no writes)
    python -m scripts.backfill_user_id --apply    # backfill inferable rows

Ownership rules:
- A mission's owner IS inferable from its profile (missions.profile_id ->
  profiles.user_id). Those are backfilled with --apply.
- An application's owner IS inferable via its match (applications.match_id ->
  matches.mission_id -> missions.user_id, or the mission's profile owner).
  Without this, the tracker routes' user_id filter hides every pre-auth
  application (and the Resumes page, which derives its documents from tracker
  rows). Those are backfilled with --apply.
- A profile's owner is NOT inferable from data alone (it ties to a Supabase auth
  user). Orphaned profiles, and missions/applications whose chain is also
  orphaned, are printed under "MANUAL RESOLUTION REQUIRED" — never silently
  guessed.
"""
import sys
from app.database import get_db


def main(apply: bool) -> None:
    db = get_db()
    profiles = db.table("profiles").select("id, user_id, email").execute().data or []
    missions = db.table("missions").select("id, user_id, profile_id, title").execute().data or []
    matches = db.table("matches").select("id, mission_id").execute().data or []
    applications = db.table("applications").select("id, user_id, match_id, job_title").execute().data or []
    prof_owner = {p["id"]: p.get("user_id") for p in profiles}

    orphan_profiles = [p for p in profiles if not p.get("user_id")]
    null_missions = [m for m in missions if not m.get("user_id")]
    inferable = [m for m in null_missions if prof_owner.get(m.get("profile_id"))]
    uninferable = [m for m in null_missions if not prof_owner.get(m.get("profile_id"))]

    # Application owner = its match's mission's owner (stamped user_id first,
    # else the mission's profile owner — same rule the API's legacy path uses).
    mission_owner = {
        m["id"]: (m.get("user_id") or prof_owner.get(m.get("profile_id")))
        for m in missions
    }
    match_owner = {mt["id"]: mission_owner.get(mt.get("mission_id")) for mt in matches}
    null_apps = [a for a in applications if not a.get("user_id")]
    apps_inferable = [a for a in null_apps if match_owner.get(a.get("match_id"))]
    apps_uninferable = [a for a in null_apps if not match_owner.get(a.get("match_id"))]

    print(f"profiles: {len(profiles)} total, {len(orphan_profiles)} orphaned (NULL user_id)")
    print(f"missions: {len(missions)} total, {len(null_missions)} NULL user_id")
    print(f"  inferable from profile : {len(inferable)}")
    print(f"  NOT inferable (manual) : {len(uninferable)}")
    print(f"applications: {len(applications)} total, {len(null_apps)} NULL user_id")
    print(f"  inferable via match->mission : {len(apps_inferable)}")
    print(f"  NOT inferable (manual)       : {len(apps_uninferable)}")

    if apply:
        done = 0
        for m in inferable:
            uid = prof_owner[m["profile_id"]]
            try:
                db.table("missions").update({"user_id": uid}).eq("id", m["id"]).execute()
                done += 1
            except Exception as e:  # noqa: BLE001
                print(f"  ! failed to backfill mission {m['id']}: {e}")
        print(f"APPLIED: backfilled {done}/{len(inferable)} missions.")

        app_done = 0
        for a in apps_inferable:
            uid = match_owner[a["match_id"]]
            try:
                db.table("applications").update({"user_id": uid}).eq("id", a["id"]).execute()
                app_done += 1
            except Exception as e:  # noqa: BLE001
                print(f"  ! failed to backfill application {a['id']}: {e}")
        print(f"APPLIED: backfilled {app_done}/{len(apps_inferable)} applications.")
    else:
        print("(report only — pass --apply to write)")

    if orphan_profiles or uninferable or apps_uninferable:
        print("\n=== MANUAL RESOLUTION REQUIRED (not auto-touched) ===")
        for p in orphan_profiles:
            print(f"  profile {p['id']} ({p.get('email')}) — NULL user_id, owner cannot be inferred")
        for m in uninferable:
            print(f"  mission {m['id']} ({m.get('title')}) — its profile has no owner")
        for a in apps_uninferable:
            print(f"  application {a['id']} ({a.get('job_title')}) — its match/mission chain has no owner")


if __name__ == "__main__":
    main("--apply" in sys.argv)
