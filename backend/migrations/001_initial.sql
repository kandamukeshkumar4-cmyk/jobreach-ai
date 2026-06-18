-- ============================================================
-- JobReach AI — Supabase / Postgres Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- ============================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ── PROFILES ─────────────────────────────────────────────────────────────────
CREATE TABLE profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name       TEXT NOT NULL,
    email           TEXT NOT NULL,
    linkedin_url    TEXT,
    resume_markdown TEXT NOT NULL DEFAULT '',
    target_roles    TEXT[]  DEFAULT '{}',
    target_locations TEXT[] DEFAULT '{}',
    target_salary_min      INTEGER,
    target_salary_currency TEXT DEFAULT 'USD',
    skills          TEXT[]  DEFAULT '{}',
    years_experience INTEGER,
    archetypes      TEXT[]  DEFAULT '{}',
    resume_embedding vector(1536),
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_profiles_user ON profiles(user_id);

-- ── MISSIONS ─────────────────────────────────────────────────────────────────
CREATE TABLE missions (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id         UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    profile_id      UUID REFERENCES profiles(id) ON DELETE CASCADE,
    title           TEXT DEFAULT 'Job Search Mission',
    search_query    TEXT NOT NULL,
    location_filter TEXT,
    salary_min      INTEGER,
    salary_currency TEXT DEFAULT 'USD',
    sources         TEXT[] DEFAULT '{exa,greenhouse,lever,ashby,wellfound,rss}',
    status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending','running','completed','failed')),
    total_scanned   INTEGER DEFAULT 0,
    total_filtered  INTEGER DEFAULT 0,
    total_matches   INTEGER DEFAULT 0,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_missions_user   ON missions(user_id);
CREATE INDEX idx_missions_status ON missions(status);

-- ── MISSION EVENTS (the live agent telemetry feed) ───────────────────────────
CREATE TABLE mission_events (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id  UUID REFERENCES missions(id) ON DELETE CASCADE,
    event_type  TEXT NOT NULL CHECK (event_type IN ('run','ok','star','info','warn','error')),
    message     TEXT NOT NULL,
    detail      TEXT,
    metadata    JSONB DEFAULT '{}',
    created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_events_mission ON mission_events(mission_id);
CREATE INDEX idx_events_created ON mission_events(created_at);

-- ── JOBS ─────────────────────────────────────────────────────────────────────
CREATE TABLE jobs (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title               TEXT NOT NULL,
    company             TEXT NOT NULL,
    location            TEXT DEFAULT '',
    url                 TEXT UNIQUE NOT NULL,
    salary_min          INTEGER,
    salary_max          INTEGER,
    salary_currency     TEXT,
    description_snippet TEXT,
    full_description    TEXT,
    source              TEXT NOT NULL,
    ats_type            TEXT,
    posted_at           TIMESTAMPTZ,
    is_active           BOOLEAN DEFAULT true,
    discovered_at       TIMESTAMPTZ DEFAULT now(),
    description_embedding vector(1536)
);

CREATE INDEX idx_jobs_company   ON jobs(company);
CREATE INDEX idx_jobs_source    ON jobs(source);
CREATE INDEX idx_jobs_active    ON jobs(is_active);

-- ── MATCHES ──────────────────────────────────────────────────────────────────
CREATE TABLE matches (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mission_id       UUID REFERENCES missions(id) ON DELETE CASCADE,
    job_id           UUID REFERENCES jobs(id) ON DELETE CASCADE,
    overall_score    NUMERIC(3,1) NOT NULL,
    grade            TEXT NOT NULL CHECK (grade IN ('A','B','C','D','F')),
    dimensions       JSONB NOT NULL DEFAULT '[]',
    why_fit          TEXT,
    why_gap          TEXT,
    company_research JSONB DEFAULT '{}',
    resume_ready     BOOLEAN DEFAULT false,
    created_at       TIMESTAMPTZ DEFAULT now(),
    UNIQUE(mission_id, job_id)
);

CREATE INDEX idx_matches_mission ON matches(mission_id);
CREATE INDEX idx_matches_grade   ON matches(grade);
CREATE INDEX idx_matches_score   ON matches(overall_score DESC);

-- ── APPLICATIONS (tracker) ───────────────────────────────────────────────────
CREATE TABLE applications (
    id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id               UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    match_id              UUID REFERENCES matches(id) ON DELETE SET NULL,
    job_title             TEXT NOT NULL,
    company               TEXT NOT NULL,
    overall_score         NUMERIC(3,1),
    grade                 TEXT,
    status                TEXT DEFAULT 'evaluated'
                          CHECK (status IN ('evaluated','applied','responded','interview','offer','rejected','discarded','skip')),
    resume_pdf_url        TEXT,
    cover_letter_pdf_url  TEXT,
    notes                 TEXT,
    applied_at            TIMESTAMPTZ,
    next_action           TEXT,
    next_action_date      TIMESTAMPTZ,
    created_at            TIMESTAMPTZ DEFAULT now(),
    updated_at            TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_apps_user   ON applications(user_id);
CREATE INDEX idx_apps_status ON applications(status);

-- ── RESUMES ──────────────────────────────────────────────────────────────────
CREATE TABLE resumes (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    match_id            UUID REFERENCES matches(id) ON DELETE CASCADE,
    pdf_url             TEXT NOT NULL,
    cover_letter_pdf_url TEXT,
    keywords_injected   TEXT[] DEFAULT '{}',
    tailored_markdown   TEXT,
    created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_resumes_match ON resumes(match_id);

-- ── COMPANY PROFILES (research cache) ────────────────────────────────────────
CREATE TABLE company_profiles (
    id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    company_name     TEXT UNIQUE NOT NULL,
    funding_stage    TEXT,
    valuation        TEXT,
    headcount        TEXT,
    growth_signal    TEXT,
    remote_policy    TEXT,
    layoffs_24mo     BOOLEAN DEFAULT false,
    glassdoor_rating NUMERIC(3,1),
    tech_stack       TEXT[] DEFAULT '{}',
    recent_news      TEXT,
    red_flags        TEXT[] DEFAULT '{}',
    positive_signals TEXT[] DEFAULT '{}',
    raw_research     JSONB DEFAULT '{}',
    refreshed_at     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_company_name ON company_profiles(company_name);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE missions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE resumes       ENABLE ROW LEVEL SECURITY;

-- Users can only see their own data
CREATE POLICY "own_profile"  ON profiles      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_missions" ON missions      FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_events"   ON mission_events FOR SELECT
    USING (EXISTS (SELECT 1 FROM missions m WHERE m.id = mission_id AND m.user_id = auth.uid()));
CREATE POLICY "own_apps"     ON applications  FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "own_resumes"  ON resumes FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM matches ma
        JOIN missions mi ON mi.id = ma.mission_id
        WHERE ma.id = match_id AND mi.user_id = auth.uid()
    ));

-- Jobs + matches + company_profiles are readable by all authenticated users
ALTER TABLE jobs             ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches          ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "jobs_read"     ON jobs             FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "matches_read"  ON matches           FOR SELECT USING (
    EXISTS (SELECT 1 FROM missions m WHERE m.id = mission_id AND m.user_id = auth.uid())
);
CREATE POLICY "company_read"  ON company_profiles  FOR SELECT USING (auth.role() = 'authenticated');

-- ── UPDATED_AT TRIGGER ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_profiles_updated   BEFORE UPDATE ON profiles     FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_apps_updated       BEFORE UPDATE ON applications FOR EACH ROW EXECUTE FUNCTION set_updated_at();
