// TypeScript types mirroring the JobReach AI backend API contract.
// Foundation: these are imported across the app — do not redefine elsewhere.

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export type MissionStatus = 'pending' | 'running' | 'completed' | 'failed';

export type EventType = 'run' | 'ok' | 'star' | 'info' | 'warn' | 'error';

export type ApplicationStatus =
  | 'evaluated'
  | 'applied'
  | 'responded'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'discarded'
  | 'skip';

// --- Profile ---

export interface ProfileCreate {
  full_name: string;
  email: string;
  linkedin_url?: string;
  resume_markdown: string;
  target_roles: string[];
  target_locations: string[];
  target_salary_min?: number;
  target_salary_currency: string;
  skills: string[];
  years_experience?: number;
  archetypes: string[];
}

export interface ProfileOut extends ProfileCreate {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

// --- Missions ---

export interface MissionCreate {
  search_query: string;
  profile_id: string;
  title?: string;
  location_filter?: string | null;
  salary_min?: number | null;
  salary_currency?: string;
  sources?: string[];
}

export interface MissionOut {
  id: string;
  user_id: string;
  profile_id: string;
  title: string;
  search_query: string;
  status: MissionStatus;
  total_scanned: number;
  total_filtered: number;
  total_matches: number;
  started_at?: string;
  completed_at?: string;
  created_at: string;
}

export interface MissionEventOut {
  id: string;
  mission_id: string;
  event_type: EventType;
  message: string;
  detail?: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

// --- Jobs & Matches ---

export interface JobOut {
  id: string;
  title: string;
  company: string;
  location: string;
  url: string;
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
  description_snippet?: string;
  source: string;
  posted_at?: string;
  discovered_at: string;
}

export interface DimensionScore {
  label: string;
  score: number;
  grade: Grade;
  evidence?: string;
}

export interface MatchOut {
  id: string;
  job: JobOut;
  mission_id: string;
  overall_score: number;
  grade: Grade;
  dimensions: DimensionScore[];
  why_fit: string;
  why_gap?: string;
  company_research?: Record<string, unknown>;
  resume_ready: boolean;
  created_at: string;
}

// --- Applications / Tracker ---

export interface ApplicationCreate {
  match_id: string;
  notes?: string;
}

export interface ApplicationUpdate {
  status?: ApplicationStatus;
  notes?: string;
  next_action?: string;
  next_action_date?: string;
}

export interface ApplicationOut {
  id: string;
  user_id: string;
  match_id: string;
  job_title: string;
  company: string;
  status: ApplicationStatus;
  overall_score: number;
  grade: Grade;
  resume_pdf_url?: string;
  cover_letter_pdf_url?: string;
  notes?: string;
  applied_at?: string;
  next_action?: string;
  next_action_date?: string;
  created_at: string;
}

// --- Tracker stats ---

export interface TrackerStats {
  total: number;
  by_status: Record<string, number>;
}

// --- Resumes ---

export interface ResumeGeneratePayload {
  match_id: string;
  include_cover_letter?: boolean;
  tone?: string;
}

export interface ResumeTask {
  task_id: string;
  status: string;
  match_id?: string;
  result?: unknown;
}
