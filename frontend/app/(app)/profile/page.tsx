'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  User,
  FileText,
  Target,
  MapPin,
  DollarSign,
  Sparkles,
  Briefcase,
  Eye,
  Pencil,
  Check,
  AlertTriangle,
  Save,
  Upload,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { cn } from '@/lib/format';
import type { ProfileCreate, ProfileOut } from '@/lib/types';
import { useAppStore } from '../store';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { TagsInput } from '@/components/profile/tags-input';
import { LocationPicker } from '@/components/profile/location-picker';
import { SkillsInput, type SkillEntry, serializeSkills, parseSkills } from '@/components/profile/skills-input';

const PROFILE_ID_KEY = 'jobreach.activeProfileId';

const CURRENCIES = ['USD', 'EUR', 'GBP', 'INR', 'CAD', 'AUD', 'JPY'] as const;

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success' }
  | { kind: 'error'; message: string };

// --- Empty form ---

function emptyForm(): ProfileCreate {
  return {
    full_name: '',
    email: '',
    linkedin_url: '',
    resume_markdown: '',
    target_roles: [],
    target_locations: [],
    target_salary_min: undefined,
    target_salary_currency: 'USD',
    skills: [],
    years_experience: undefined,
    archetypes: [],
  };
}

function profileToForm(p: ProfileOut): ProfileCreate {
  return {
    full_name: p.full_name ?? '',
    email: p.email ?? '',
    linkedin_url: p.linkedin_url ?? '',
    resume_markdown: p.resume_markdown ?? '',
    target_roles: p.target_roles ?? [],
    target_locations: p.target_locations ?? [],
    target_salary_min: p.target_salary_min ?? undefined,
    target_salary_currency: p.target_salary_currency || 'USD',
    skills: p.skills ?? [],
    years_experience: p.years_experience ?? undefined,
    archetypes: p.archetypes ?? [],
  };
}

// --- Tiny dependency-free markdown renderer (headings, bold/italic/code,
// links, unordered/ordered lists, paragraphs). HTML is escaped first. ---

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function renderInline(text: string): string {
  let out = escapeHtml(text);
  // inline code
  out = out.replace(
    /`([^`]+)`/g,
    '<code class="rounded bg-[var(--card)] px-1 py-0.5 font-mono text-[0.85em] text-[var(--cyan)]">$1</code>',
  );
  // bold
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  // italic
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  out = out.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2</em>');
  // links [text](url) — url already HTML-escaped above, and constrained to http(s)
  out = out.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label: string, url: string) =>
      `<a href="${url}" class="text-[var(--cyan)] underline" target="_blank" rel="noreferrer noopener">${label}</a>`,
  );
  return out;
}

function markdownToHtml(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html: string[] = [];
  let listType: 'ul' | 'ol' | null = null;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length) {
      html.push(
        `<p class="my-2 leading-relaxed">${renderInline(paragraph.join(' '))}</p>`,
      );
      paragraph = [];
    }
  };
  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = null;
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    if (line.trim() === '') {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph();
      closeList();
      const level = heading[1].length;
      const sizes = [
        'text-2xl font-bold tracking-[-1px]',
        'text-xl font-bold tracking-[-0.8px]',
        'text-lg font-semibold tracking-[-0.5px]',
        'text-base font-semibold',
        'text-sm font-semibold',
        'text-sm font-semibold text-[var(--muted2)]',
      ];
      html.push(
        `<h${level} class="mt-4 mb-1 text-[var(--text)] ${sizes[level - 1]}">${renderInline(heading[2])}</h${level}>`,
      );
      continue;
    }

    const ul = /^[-*+]\s+(.*)$/.exec(line);
    if (ul) {
      flushParagraph();
      if (listType !== 'ul') {
        closeList();
        html.push('<ul class="my-2 list-disc space-y-1 pl-5">');
        listType = 'ul';
      }
      html.push(`<li>${renderInline(ul[1])}</li>`);
      continue;
    }

    const ol = /^\d+\.\s+(.*)$/.exec(line);
    if (ol) {
      flushParagraph();
      if (listType !== 'ol') {
        closeList();
        html.push('<ol class="my-2 list-decimal space-y-1 pl-5">');
        listType = 'ol';
      }
      html.push(`<li>${renderInline(ol[1])}</li>`);
      continue;
    }

    // plain text -> accumulate into paragraph
    closeList();
    paragraph.push(line.trim());
  }

  flushParagraph();
  closeList();
  return html.join('\n');
}

// --- Section wrapper ---

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: typeof User;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-5 flex items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--cyan)_12%,transparent)] text-[var(--cyan)]">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-base font-bold tracking-[-0.5px] text-[var(--text)]">
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs text-[var(--muted)]">{description}</p>
          )}
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-xs font-medium uppercase tracking-[0.5px] text-[var(--muted2)]"
      >
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

const inputClass =
  'w-full rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--text)] placeholder:text-[var(--muted)] transition-colors focus:border-[var(--border-bright)] focus:outline-none';

// --- Page ---

export default function ProfilePage() {
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setActiveProfile = useAppStore((s) => s.setActiveProfile);

  // Resolve the effective profile id: prefer the store, fall back to
  // localStorage on first mount so the selection survives a reload.
  const [resolvedId, setResolvedId] = useState<string | null>(null);
  const [idResolved, setIdResolved] = useState(false);

  useEffect(() => {
    if (activeProfileId) {
      setResolvedId(activeProfileId);
      setIdResolved(true);
      return;
    }
    // Store empty — try localStorage.
    try {
      const stored = window.localStorage.getItem(PROFILE_ID_KEY);
      if (stored) {
        setResolvedId(stored);
        setActiveProfile(stored);
      }
    } catch {
      // localStorage unavailable — proceed with blank form.
    }
    setIdResolved(true);
  }, [activeProfileId, setActiveProfile]);

  const profileQuery = useQuery<ProfileOut>({
    queryKey: ['profile', resolvedId],
    queryFn: () => api.profile.get(resolvedId as string),
    enabled: idResolved && !!resolvedId,
    retry: 1,
  });

  const [form, setForm] = useState<ProfileCreate>(emptyForm);
  const [skillEntries, setSkillEntries] = useState<SkillEntry[]>([]);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });
  const [showPreview, setShowPreview] = useState(false);
  const [parseLoading, setParseLoading] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Guard so we only hydrate the form from a fetched profile once per load.
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (profileQuery.data && hydratedFor.current !== profileQuery.data.id) {
      setForm(profileToForm(profileQuery.data));
      setSkillEntries(parseSkills(profileQuery.data.skills ?? []));
      hydratedFor.current = profileQuery.data.id;
    }
  }, [profileQuery.data]);

  const update = useCallback(
    <K extends keyof ProfileCreate>(key: K, value: ProfileCreate[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
      setSaveState((s) => (s.kind === 'success' ? { kind: 'idle' } : s));
    },
    [],
  );

  const previewHtml = useMemo(
    () => markdownToHtml(form.resume_markdown || '_Nothing to preview yet._'),
    [form.resume_markdown],
  );

  const validationError = useMemo(() => {
    if (!form.full_name.trim()) return 'Full name is required.';
    if (!form.email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      return 'Enter a valid email address.';
    if (!form.resume_markdown.trim()) return 'Resume content is required.';
    return null;
  }, [form.full_name, form.email, form.resume_markdown]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = ''; // allow re-picking the same file
    setParseLoading(true);
    setParseError(null);
    try {
      const result = await api.profile.parseResume(file);
      update('resume_markdown', result.text);
      setShowPreview(false);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Failed to parse file.');
    } finally {
      setParseLoading(false);
    }
  };

  const handleSave = async () => {
    if (validationError) {
      setSaveState({ kind: 'error', message: validationError });
      return;
    }

    setSaveState({ kind: 'saving' });

    // Normalize the payload: trim strings, drop empty optionals.
    const payload: ProfileCreate = {
      full_name: form.full_name.trim(),
      email: form.email.trim(),
      linkedin_url: form.linkedin_url?.trim() || undefined,
      resume_markdown: form.resume_markdown,
      target_roles: form.target_roles,
      target_locations: form.target_locations,
      target_salary_min:
        typeof form.target_salary_min === 'number' &&
        Number.isFinite(form.target_salary_min)
          ? form.target_salary_min
          : undefined,
      target_salary_currency: form.target_salary_currency || 'USD',
      skills: serializeSkills(skillEntries),
      years_experience: form.years_experience,
      archetypes: form.archetypes,
    };

    try {
      let result: ProfileOut;
      if (resolvedId) {
        result = await api.profile.update(resolvedId, payload);
      } else {
        result = await api.profile.create(payload);
        // Persist the new id everywhere so it survives navigation + reload.
        setResolvedId(result.id);
        setActiveProfile(result.id);
        hydratedFor.current = result.id;
        try {
          window.localStorage.setItem(PROFILE_ID_KEY, result.id);
        } catch {
          // ignore — non-fatal
        }
      }
      setForm(profileToForm(result));
      setSaveState({ kind: 'success' });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong while saving.';
      setSaveState({ kind: 'error', message });
    }
  };

  const isSaving = saveState.kind === 'saving';
  const isExisting = !!resolvedId;

  // Initial load state: only block when we're fetching an existing profile and
  // have nothing cached yet.
  const isInitialLoading =
    !idResolved || (profileQuery.isLoading && !!resolvedId);

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-24">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-1.2px] text-[var(--text)]">
            Candidate Profile
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            {isExisting
              ? 'Edit the profile used to score and match jobs across your missions.'
              : 'Create the profile used to score and match jobs across your missions.'}
          </p>
        </div>
      </div>

      {isInitialLoading ? (
        <Card className="flex items-center justify-center gap-3 px-6 py-20 text-sm text-[var(--muted)]">
          <Spinner size={18} />
          Loading profile…
        </Card>
      ) : profileQuery.isError && resolvedId ? (
        <Card className="p-6">
          <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--red)_12%,transparent)] text-[var(--red)]">
              <AlertTriangle className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <h3 className="text-sm font-bold tracking-[-0.3px] text-[var(--text)]">
                Couldn&apos;t load your profile
              </h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                The backend may be cold-starting (this can take up to 30
                seconds). You can retry, or start editing below.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => profileQuery.refetch()}
              className="shrink-0"
            >
              Retry
            </Button>
          </div>
        </Card>
      ) : (
        <>
          {/* Identity */}
          <Section
            icon={User}
            title="Identity"
            description="How you appear to employers."
          >
            <Field label="Full name" htmlFor="full_name">
              <input
                id="full_name"
                type="text"
                value={form.full_name}
                onChange={(e) => update('full_name', e.target.value)}
                placeholder="Ada Lovelace"
                className={inputClass}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Email" htmlFor="email">
                <input
                  id="email"
                  type="email"
                  value={form.email}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="you@example.com"
                  className={inputClass}
                />
              </Field>
              <Field label="LinkedIn URL" htmlFor="linkedin_url">
                <input
                  id="linkedin_url"
                  type="url"
                  value={form.linkedin_url ?? ''}
                  onChange={(e) => update('linkedin_url', e.target.value)}
                  placeholder="https://linkedin.com/in/…"
                  className={inputClass}
                />
              </Field>
            </div>
          </Section>

          {/* Resume */}
          <Card className="p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--cyan)_12%,transparent)] text-[var(--cyan)]">
                  <FileText className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="text-base font-bold tracking-[-0.5px] text-[var(--text)]">
                    Resume
                  </h2>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    Markdown supported — or upload a PDF, DOCX, or TXT file.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {/* Upload button */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSaving || parseLoading}
                  className="flex items-center gap-1.5 rounded-[7px] border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--muted2)] transition-colors hover:border-[var(--border-bright)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {parseLoading ? (
                    <Spinner size={12} />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  {parseLoading ? 'Parsing…' : 'Upload'}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.docx,.txt"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                {/* Edit / Preview toggle */}
                <div className="flex overflow-hidden rounded-[7px] border border-[var(--border)]">
                  <button
                    type="button"
                    onClick={() => setShowPreview(false)}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors',
                      !showPreview
                        ? 'bg-[var(--card)] text-[var(--text)]'
                        : 'text-[var(--muted)] hover:text-[var(--text)]',
                    )}
                    aria-pressed={!showPreview}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPreview(true)}
                    className={cn(
                      'flex items-center gap-1.5 border-l border-[var(--border)] px-3 py-1.5 text-xs font-medium transition-colors',
                      showPreview
                        ? 'bg-[var(--card)] text-[var(--text)]'
                        : 'text-[var(--muted)] hover:text-[var(--text)]',
                    )}
                    aria-pressed={showPreview}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    Preview
                  </button>
                </div>
              </div>
            </div>
            {parseError && (
              <p className="mb-3 text-xs text-[var(--red)]">{parseError}</p>
            )}

            {showPreview ? (
              <div
                className="min-h-[18rem] rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm text-[var(--text)]"
                // Markdown is escaped before formatting in markdownToHtml.
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
            ) : (
              <textarea
                id="resume_markdown"
                value={form.resume_markdown}
                onChange={(e) => update('resume_markdown', e.target.value)}
                placeholder={'# Ada Lovelace\n\n## Experience\n\n- **Analytical Engine** — Lead Programmer\n  - Wrote the first algorithm…'}
                spellCheck
                className={cn(
                  inputClass,
                  'min-h-[18rem] resize-y font-mono text-[13px] leading-relaxed',
                )}
              />
            )}
          </Card>

          {/* Targets */}
          <div className="grid gap-6 lg:grid-cols-2">
            <Section
              icon={Target}
              title="Target roles"
              description="Titles you want to be matched against."
            >
              <TagsInput
                value={form.target_roles}
                onChange={(next) => update('target_roles', next)}
                placeholder="e.g. Senior Frontend Engineer"
                disabled={isSaving}
              />
            </Section>

            <Section
              icon={MapPin}
              title="Target locations"
              description="Cities, states, or countries — type to search."
            >
              <LocationPicker
                value={form.target_locations}
                onChange={(next) => update('target_locations', next)}
                disabled={isSaving}
              />
            </Section>
          </div>

          {/* Compensation */}
          <Section
            icon={DollarSign}
            title="Target salary"
            description="Minimum compensation you'll consider."
          >
            <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
              <Field label="Minimum salary" htmlFor="target_salary_min">
                <input
                  id="target_salary_min"
                  type="number"
                  min={0}
                  step={1000}
                  inputMode="numeric"
                  value={
                    form.target_salary_min === undefined
                      ? ''
                      : form.target_salary_min
                  }
                  onChange={(e) =>
                    update(
                      'target_salary_min',
                      e.target.value === ''
                        ? undefined
                        : Number(e.target.value),
                    )
                  }
                  placeholder="120000"
                  className={inputClass}
                />
              </Field>
              <Field label="Currency" htmlFor="target_salary_currency">
                <select
                  id="target_salary_currency"
                  value={form.target_salary_currency}
                  onChange={(e) =>
                    update('target_salary_currency', e.target.value)
                  }
                  className={cn(inputClass, 'sm:w-28')}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </Section>

          {/* Skills + Experience */}
          <Section
            icon={Sparkles}
            title="Skills & experience"
            description="Add up to 10 skills with years of experience — focused profiles match better."
          >
            <SkillsInput
              value={skillEntries}
              onChange={setSkillEntries}
              disabled={isSaving}
            />
          </Section>

          {/* Archetypes */}
          <Section
            icon={Briefcase}
            title="Archetypes"
            description="Working styles or candidate personas."
          >
            <TagsInput
              value={form.archetypes}
              onChange={(next) => update('archetypes', next)}
              placeholder="e.g. Builder, Generalist, Player-coach"
              disabled={isSaving}
            />
          </Section>

          {/* Sticky save bar */}
          <div className="sticky bottom-4 z-10">
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-h-[1.25rem] text-sm">
                {saveState.kind === 'error' && (
                  <span className="inline-flex items-center gap-1.5 text-[var(--red)]">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    {saveState.message}
                  </span>
                )}
                {saveState.kind === 'success' && (
                  <span className="inline-flex items-center gap-1.5 text-[var(--green)]">
                    <Check className="h-4 w-4 shrink-0" />
                    {isExisting ? 'Profile saved.' : 'Profile created.'}
                  </span>
                )}
                {saveState.kind === 'idle' && validationError && (
                  <span className="text-[var(--muted)]">{validationError}</span>
                )}
                {saveState.kind === 'idle' && !validationError && (
                  <span className="text-[var(--muted)]">
                    {isExisting
                      ? 'Changes are saved to your existing profile.'
                      : 'Saving creates your profile.'}
                  </span>
                )}
                {saveState.kind === 'saving' && (
                  <span className="inline-flex items-center gap-2 text-[var(--muted2)]">
                    <Spinner size={16} />
                    Saving…
                  </span>
                )}
              </div>

              <Button
                variant="primary"
                onClick={handleSave}
                disabled={isSaving || !!validationError}
                className="shrink-0"
              >
                <Save className="h-4 w-4" />
                {isExisting ? 'Save changes' : 'Create profile'}
              </Button>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
