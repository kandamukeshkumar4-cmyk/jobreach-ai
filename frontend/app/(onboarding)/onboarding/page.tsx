'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowLeft,
  Upload,
  FileText,
  User,
  Target,
  Rocket,
  Check,
} from 'lucide-react';
import { api } from '@/lib/api';
import { useAppStore } from '@/app/(app)/store';
import type { ProfileCreate, MissionCreate } from '@/lib/types';
import { TagsInput } from '@/components/profile/tags-input';
import { Spinner } from '@/components/ui/spinner';

const PROFILE_ID_KEY = 'jobreach.activeProfileId';

const SOURCES = [
  { id: 'exa', label: 'Exa', hint: 'AI web search' },
  { id: 'greenhouse', label: 'Greenhouse', hint: 'ATS boards' },
  { id: 'lever', label: 'Lever', hint: 'ATS boards' },
  { id: 'ashby', label: 'Ashby', hint: 'ATS boards' },
  { id: 'wellfound', label: 'Wellfound', hint: 'Startups' },
  { id: 'rss', label: 'RSS', hint: 'Job feeds' },
];

interface WizardData {
  full_name: string;
  email: string;
  linkedin_url: string;
  years_experience: string;
  resume_markdown: string;
  target_roles: string[];
  target_locations: string[];
  target_salary_min: string;
  skills: string[];
  search_query: string;
  sources: string[];
}

function emptyData(): WizardData {
  return {
    full_name: '',
    email: '',
    linkedin_url: '',
    years_experience: '',
    resume_markdown: '',
    target_roles: [],
    target_locations: [],
    target_salary_min: '',
    skills: [],
    search_query: '',
    sources: SOURCES.map((s) => s.id),
  };
}

const STEPS = [
  {
    icon: User,
    label: 'About You',
    title: "First, tell us who you are",
    subtitle:
      "This info goes on every resume we tailor for you. Use your real name and contact details.",
    cta: "Continue",
  },
  {
    icon: FileText,
    label: 'Your Resume',
    title: "Add your current resume",
    subtitle:
      "Upload your resume file (PDF, DOCX, or TXT) or paste the text below. Our AI reads it to understand your experience.",
    cta: "Continue",
  },
  {
    icon: Target,
    label: 'Job Preferences',
    title: "What kind of role are you looking for?",
    subtitle:
      "The more specific you are, the better your matches. You can update all of this later from your profile.",
    cta: "Save profile & continue",
  },
  {
    icon: Rocket,
    label: 'First Search',
    title: "Launch your first job search",
    subtitle:
      "Describe the role you want in plain language. The AI will scan hundreds of job boards and rank the best matches just for you.",
    cta: "Launch search",
  },
];

const INPUT =
  'w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)] outline-none transition-colors focus:border-[var(--cyan)] focus:ring-2 focus:ring-[var(--cyan)]/20';

export default function OnboardingPage() {
  const router = useRouter();
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);
  const setActiveMission = useAppStore((s) => s.setActiveMission);

  const [step, setStep] = useState(0);
  const [data, setData] = useState<WizardData>(emptyData);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [savedProfileId, setSavedProfileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const update = useCallback(
    <K extends keyof WizardData>(key: K, value: WizardData[K]) => {
      setData((prev) => ({ ...prev, [key]: value }));
      setError(null);
    },
    [],
  );

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setParseLoading(true);
    setParseError(null);
    try {
      const result = await api.profile.parseResume(file);
      update('resume_markdown', result.text);
    } catch (err) {
      setParseError(
        err instanceof Error ? err.message : 'Failed to parse file',
      );
    } finally {
      setParseLoading(false);
    }
  };

  const validate = (s: number): string | null => {
    if (s === 0) {
      if (!data.full_name.trim()) return 'Please enter your full name.';
      if (!data.email.trim()) return 'Please enter your email address.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim()))
        return 'Please enter a valid email address.';
    }
    if (s === 1) {
      if (!data.resume_markdown.trim())
        return 'Please upload or paste your resume before continuing.';
    }
    if (s === 3) {
      if (!data.search_query.trim())
        return 'Please describe the role you want to find.';
      if (data.sources.length === 0)
        return 'Select at least one job source to search.';
    }
    return null;
  };

  const handleNext = async () => {
    const err = validate(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);

    // Step 2 → 3: save profile
    if (step === 2) {
      setSaving(true);
      try {
        const payload: ProfileCreate = {
          full_name: data.full_name.trim(),
          email: data.email.trim(),
          linkedin_url: data.linkedin_url?.trim() || undefined,
          resume_markdown: data.resume_markdown,
          target_roles: data.target_roles,
          target_locations: data.target_locations,
          target_salary_min: data.target_salary_min
            ? Number(data.target_salary_min)
            : undefined,
          target_salary_currency: 'USD',
          skills: data.skills,
          years_experience: data.years_experience
            ? Number(data.years_experience)
            : undefined,
          archetypes: [],
        };
        const result = await api.profile.create(payload);
        setSavedProfileId(result.id);
        setActiveProfile(result.id);
        try {
          localStorage.setItem(PROFILE_ID_KEY, result.id);
        } catch {
          // non-fatal
        }
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to save profile. Please try again.',
        );
        setSaving(false);
        return;
      }
      setSaving(false);
      setStep(3);
      return;
    }

    // Step 3 (index) = Launch mission
    if (step === 3) {
      if (!savedProfileId) {
        setError('Profile not saved yet — please go back and try again.');
        return;
      }
      setSaving(true);
      try {
        const payload: MissionCreate = {
          profile_id: savedProfileId,
          search_query: data.search_query.trim(),
          title: data.search_query.trim(),
          sources: data.sources,
        };
        const mission = await api.missions.create(payload);
        setActiveMission(mission.id);
        router.push(`/missions/${mission.id}`);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Failed to launch mission. Please try again.',
        );
        setSaving(false);
      }
      return;
    }

    setStep((s) => s + 1);
  };

  const cfg = STEPS[step];
  const Icon = cfg.icon;

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col">
      {/* Top bar */}
      <header className="flex h-16 items-center border-b border-[var(--border)] bg-[var(--surface)] px-8">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--cyan)]">
            <span className="text-xs font-bold tracking-tight text-[#07071a]">
              JR
            </span>
          </div>
          <span className="text-lg font-bold tracking-[-0.8px] text-[var(--text)]">
            JobReach AI
          </span>
        </div>
        <div className="ml-auto text-xs font-medium text-[var(--muted)]">
          Step {step + 1} of {STEPS.length}
        </div>
      </header>

      {/* Step progress bar */}
      <div className="flex border-b border-[var(--border)] bg-[var(--surface)]">
        {STEPS.map((s, i) => {
          const StepIcon = s.icon;
          const done = i < step;
          const active = i === step;
          return (
            <div
              key={i}
              className="relative flex flex-1 flex-col items-center gap-1 py-3"
            >
              {/* Connector line */}
              {i > 0 && (
                <div
                  className={`absolute left-0 top-1/2 h-px w-1/2 -translate-y-1/2 transition-colors ${
                    i <= step ? 'bg-[var(--cyan)]' : 'bg-[var(--border)]'
                  }`}
                />
              )}
              {i < STEPS.length - 1 && (
                <div
                  className={`absolute right-0 top-1/2 h-px w-1/2 -translate-y-1/2 transition-colors ${
                    i < step ? 'bg-[var(--cyan)]' : 'bg-[var(--border)]'
                  }`}
                />
              )}
              <span
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold transition-all ${
                  done
                    ? 'bg-[var(--cyan)] text-[#07071a]'
                    : active
                      ? 'bg-[var(--cyan)] text-[#07071a] ring-4 ring-[var(--cyan)]/20'
                      : 'border border-[var(--border)] bg-[var(--card)] text-[var(--muted)]'
                }`}
              >
                {done ? <Check className="h-3.5 w-3.5" /> : <StepIcon className="h-3.5 w-3.5" />}
              </span>
              <span
                className={`hidden text-[11px] font-medium sm:block ${active ? 'text-[var(--text)]' : done ? 'text-[var(--cyan)]' : 'text-[var(--muted)]'}`}
              >
                {s.label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Main content */}
      <main className="flex flex-1 items-start justify-center px-4 py-12">
        <div className="w-full max-w-lg">
          {/* Step header */}
          <div className="mb-8 flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[color-mix(in_srgb,var(--cyan)_15%,transparent)] text-[var(--cyan)]">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-[-1px] text-[var(--text)]">
                {cfg.title}
              </h1>
              <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
                {cfg.subtitle}
              </p>
            </div>
          </div>

          {/* Form card */}
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-7 shadow-lg shadow-black/20">
            {/* ── Step 0: Identity ── */}
            {step === 0 && (
              <div className="space-y-5">
                <Field label="Full Name" required>
                  <input
                    type="text"
                    value={data.full_name}
                    onChange={(e) => update('full_name', e.target.value)}
                    placeholder="Jane Smith"
                    autoFocus
                    className={INPUT}
                  />
                  <Hint>This will appear on every resume we generate for you.</Hint>
                </Field>
                <Field label="Email Address" required>
                  <input
                    type="email"
                    value={data.email}
                    onChange={(e) => update('email', e.target.value)}
                    placeholder="jane@example.com"
                    className={INPUT}
                  />
                  <Hint>Used on your resumes as your contact email.</Hint>
                </Field>
                <Field label="LinkedIn URL" optional>
                  <input
                    type="url"
                    value={data.linkedin_url}
                    onChange={(e) => update('linkedin_url', e.target.value)}
                    placeholder="https://linkedin.com/in/jane-smith"
                    className={INPUT}
                  />
                </Field>
                <Field label="Years of Work Experience" optional>
                  <input
                    type="number"
                    min={0}
                    max={50}
                    value={data.years_experience}
                    onChange={(e) => update('years_experience', e.target.value)}
                    placeholder="5"
                    className={INPUT}
                  />
                  <Hint>Helps us filter roles that match your seniority level.</Hint>
                </Field>
              </div>
            )}

            {/* ── Step 1: Resume ── */}
            {step === 1 && (
              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parseLoading}
                  className="group flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[var(--border-bright)] bg-[var(--card)] px-6 py-10 text-center transition-colors hover:border-[var(--cyan)] hover:bg-[color-mix(in_srgb,var(--cyan)_4%,transparent)] disabled:pointer-events-none disabled:opacity-60"
                >
                  {parseLoading ? (
                    <>
                      <Spinner size={26} />
                      <span className="text-sm font-medium text-[var(--muted)]">
                        Reading your resume…
                      </span>
                    </>
                  ) : data.resume_markdown ? (
                    <>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--green)_15%,transparent)]">
                        <Check className="h-5 w-5 text-[var(--green)]" />
                      </span>
                      <div>
                        <span className="block text-sm font-semibold text-[var(--green)]">
                          Resume uploaded successfully
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          Click to replace with a different file
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--card)] ring-2 ring-[var(--border-bright)] transition-colors group-hover:ring-[var(--cyan)]">
                        <Upload className="h-5 w-5 text-[var(--muted2)]" />
                      </span>
                      <div>
                        <span className="block text-sm font-semibold text-[var(--text)]">
                          Click to upload your resume
                        </span>
                        <span className="mt-0.5 block text-xs text-[var(--muted)]">
                          Supports PDF, DOCX, and TXT files
                        </span>
                      </div>
                    </>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {parseError && (
                  <p className="text-xs text-[var(--red)]">{parseError}</p>
                )}

                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-[var(--border)]" />
                  <span className="text-xs text-[var(--muted)]">
                    or paste text below
                  </span>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                </div>

                <textarea
                  value={data.resume_markdown}
                  onChange={(e) => update('resume_markdown', e.target.value)}
                  placeholder="Paste your resume content here — plain text is fine..."
                  rows={6}
                  className={`${INPUT} resize-none font-mono text-[13px] leading-relaxed`}
                />
                <Hint>
                  The AI uses this to understand your background and tailor resumes for each role.
                </Hint>
              </div>
            )}

            {/* ── Step 2: Preferences ── */}
            {step === 2 && (
              <div className="space-y-6">
                <Field label="Target Job Titles" required={false}>
                  <p className="mb-2 text-xs text-[var(--muted)]">
                    Type a job title and press{' '}
                    <kbd className="rounded bg-[var(--card)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted2)]">
                      Enter
                    </kbd>
                    . Add 2–4 titles for best results.
                  </p>
                  <TagsInput
                    value={data.target_roles}
                    onChange={(v) => update('target_roles', v)}
                    placeholder="e.g. Backend Engineer, Python Developer"
                  />
                </Field>
                <Field label="Preferred Locations">
                  <p className="mb-2 text-xs text-[var(--muted)]">
                    Enter cities, states, or type{' '}
                    <span className="font-semibold text-[var(--muted2)]">Remote</span> for remote roles.
                  </p>
                  <TagsInput
                    value={data.target_locations}
                    onChange={(v) => update('target_locations', v)}
                    placeholder="e.g. Remote, New York, London"
                  />
                </Field>
                <Field label="Your Top Skills">
                  <p className="mb-2 text-xs text-[var(--muted)]">
                    Add your strongest skills — these are used to score job matches.
                  </p>
                  <TagsInput
                    value={data.skills}
                    onChange={(v) => update('skills', v)}
                    placeholder="e.g. Python, FastAPI, AWS, Docker"
                  />
                </Field>
                <Field label="Minimum Salary (USD)" optional>
                  <input
                    type="number"
                    min={0}
                    step={5000}
                    value={data.target_salary_min}
                    onChange={(e) => update('target_salary_min', e.target.value)}
                    placeholder="e.g. 120000"
                    className={INPUT}
                  />
                  <Hint>We use this to filter out roles below your target.</Hint>
                </Field>
              </div>
            )}

            {/* ── Step 3: Launch Mission ── */}
            {step === 3 && (
              <div className="space-y-6">
                <Field label="Describe the role you want" required>
                  <p className="mb-2 text-xs text-[var(--muted)]">
                    Be specific — mention the title, tech stack, seniority, or any preferences.
                  </p>
                  <textarea
                    value={data.search_query}
                    onChange={(e) => update('search_query', e.target.value)}
                    placeholder="e.g. Senior Python backend engineer, FastAPI or Django, remote-friendly startup, 3–7 years experience"
                    autoFocus
                    rows={4}
                    className={`${INPUT} resize-none`}
                  />
                </Field>

                <div>
                  <label className="mb-3 block text-xs font-bold uppercase tracking-widest text-[var(--muted2)]">
                    Where to search
                  </label>
                  <p className="mb-3 text-xs text-[var(--muted)]">
                    All sources are selected by default. Uncheck any you want to skip.
                  </p>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {SOURCES.map((source) => {
                      const checked = data.sources.includes(source.id);
                      return (
                        <button
                          key={source.id}
                          type="button"
                          onClick={() =>
                            update(
                              'sources',
                              checked
                                ? data.sources.filter((s) => s !== source.id)
                                : [...data.sources, source.id],
                            )
                          }
                          className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                            checked
                              ? 'border-[var(--cyan)] bg-[color-mix(in_srgb,var(--cyan)_10%,transparent)]'
                              : 'border-[var(--border)] bg-[var(--card)] hover:border-[var(--border-bright)]'
                          }`}
                        >
                          <span
                            className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                              checked
                                ? 'border-[var(--cyan)] bg-[var(--cyan)]'
                                : 'border-[var(--border-bright)] bg-transparent'
                            }`}
                          >
                            {checked && (
                              <Check className="h-2.5 w-2.5 text-[#07071a]" />
                            )}
                          </span>
                          <span>
                            <span className="block text-xs font-semibold text-[var(--text)]">
                              {source.label}
                            </span>
                            <span className="block text-[10px] text-[var(--muted)]">
                              {source.hint}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* What happens next */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
                  <p className="mb-2 text-xs font-bold uppercase tracking-widest text-[var(--muted2)]">
                    What happens next
                  </p>
                  <ul className="space-y-1.5">
                    {[
                      'Our AI scans selected job boards for matching roles',
                      'Each job is scored against your profile (skills, experience, salary)',
                      'You see a ranked list of your top matches with grades (A–F)',
                      'Click "Tailor Resume" on any match to generate a custom DOCX resume',
                    ].map((item, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-[var(--muted)]">
                        <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--cyan)_15%,transparent)] text-[8px] font-bold text-[var(--cyan)]">
                          {i + 1}
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-5 rounded-xl border border-[var(--red)]/30 bg-[color-mix(in_srgb,var(--red)_8%,transparent)] px-4 py-3 text-sm text-[var(--red)]">
                {error}
              </div>
            )}

            {/* Navigation */}
            <div className="mt-7 flex items-center justify-between">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setStep((s) => s - 1);
                    setError(null);
                  }}
                  disabled={saving}
                  className="flex items-center gap-1.5 text-sm text-[var(--muted)] transition-colors hover:text-[var(--text)] disabled:opacity-40"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={handleNext}
                disabled={saving || parseLoading}
                className="flex items-center gap-2 rounded-xl bg-[var(--cyan)] px-7 py-3 text-sm font-bold text-[#07071a] shadow-lg shadow-[var(--cyan)]/20 transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
              >
                {saving ? (
                  <>
                    <Spinner size={16} className="text-[#07071a]" />
                    {step === 2 ? 'Saving profile…' : 'Launching…'}
                  </>
                ) : (
                  <>
                    {cfg.cta}
                    {step < 3 && <ArrowRight className="h-4 w-4" />}
                    {step === 3 && <Rocket className="h-4 w-4" />}
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Returning user link (step 0 only) */}
          {step === 0 && (
            <p className="mt-5 text-center text-xs text-[var(--muted)]">
              Already have a profile?{' '}
              <button
                type="button"
                onClick={() => router.push('/dashboard')}
                className="font-medium text-[var(--cyan)] underline-offset-2 hover:underline"
              >
                Go to dashboard
              </button>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

// ── Helper components ──────────────────────────────────────────────────────────

function Field({
  label,
  required,
  optional,
  children,
}: {
  label: string;
  required?: boolean;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-widest text-[var(--muted2)]">
        {label}
        {required && (
          <span className="text-[var(--cyan)] normal-case tracking-normal">
            *
          </span>
        )}
        {optional && (
          <span className="text-[10px] font-normal normal-case tracking-normal text-[var(--muted)]">
            (optional)
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
      {children}
    </p>
  );
}
