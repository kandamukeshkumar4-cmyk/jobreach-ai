"""Backfill / report NULL user_id on profiles and missions.

Run from the backend/ dir with the real env (.env / app settings) loaded:
    python -m scripts.backfill_user_id            # REPORT ONLY (no writes)
    python -m scripts.backfill_user_id --apply    # backfill inferable rows

Ownership rules:
- A mission's owner IS inferable from its profile (missions.profile_id ->
  profiles.user_id). Those are backfilled with --apply.
- A profile's owner is NOT inferable from data alone (it ties to a Supabase auth
  user). Orphaned profiles, and missions whose profile is also orphaned, are
  printed under "MANUAL RESOLUTION REQUIRED" — never silently guessed.
"""
import sys
from app.database import get_db


def main(apply: bool) -> None:
    db = get_db()
    profiles = db.table("profiles").select("id, user_id, email").execute().data or []
    missions = db.table("missions").select("id, user_id, profile_id, title").execute().data or []
    prof_owner = {p["id"]: p.get("user_id") for p in profiles}

    orphan_profiles = [p for p in profiles if not p.get("user_id")]
    null_missions = [m for m in missions if not m.get("user_id")]
    inferable = [m for m in null_missions if prof_owner.get(m.get("profile_id"))]
    uninferable = [m for m in null_missions if not prof_owner.get(m.get("profile_id"))]

    print(f"profiles: {len(profiles)} total, {len(orphan_profiles)} orphaned (NULL user_id)")
    print(f"missions: {len(missions)} total, {len(null_missions)} NULL user_id")
    print(f"  inferable from profile : {len(inferable)}")
    print(f"  NOT inferable (manual) : {len(uninferable)}")

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
    else:
        print("(report only — pass --apply to write)")

    if orphan_profiles or uninferable:
        print("\n=== MANUAL RESOLUTION REQUIRED (not auto-touched) ===")
        for p in orphan_profiles:
            print(f"  profile {p['id']} ({p.get('email')}) — NULL user_id, owner cannot be inferred")
        for m in uninferable:
            print(f"  mission {m['id']} ({m.get('title')}) — its profile has no owner")


if __name__ == "__main__":
    main("--apply" in sys.argv)
