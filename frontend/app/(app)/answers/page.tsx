'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  Copy,
  MessageSquareQuote,
  Pencil,
  Plus,
  RotateCw,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { errorMessage, relativeTime } from '@/lib/format';
import type { AnswerCreate, AnswerMatch, AnswerOut } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { Chip } from '@/components/ui/chip';

const ANSWERS_KEY = ['answers'];

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AnswersPage() {
  const { data, isLoading, isError, refetch, isFetching } = useQuery<AnswerOut[]>({
    queryKey: ANSWERS_KEY,
    queryFn: () => api.answers.list(),
  });

  const [showForm, setShowForm] = useState(false);
  const answers = data ?? [];

  return (
    <div className="space-y-6">
      {/* ── Chrome bar ─────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,white_2%),var(--surface))] shadow-[0_18px_80px_rgba(0,0,0,0.24)]">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--border)] px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5" aria-hidden="true">
              <span className="size-2.5 rounded-full bg-[#ff5f57]" />
              <span className="size-2.5 rounded-full bg-[#febc2e]" />
              <span className="size-2.5 rounded-full bg-[#28c840]" />
            </div>
            <span className="text-[11px] uppercase tracking-[1.8px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
              ANSWER.VAULT
            </span>
          </div>

          <div className="ml-auto flex items-center gap-3">
            {!isLoading && answers.length > 0 && (
              <span className="text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {answers.length} {answers.length === 1 ? 'answer' : 'answers'}
              </span>
            )}
            <button
              type="button"
              onClick={() => void refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted2)] transition-colors hover:border-[var(--border-bright)] hover:text-[var(--text)] disabled:opacity-40"
            >
              <RotateCw className={`h-3 w-3 ${isFetching ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Page header */}
        <div className="px-5 py-5">
          <h1 className="text-xl font-extrabold tracking-[-0.8px] text-[var(--text)]">
            Answer Vault
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-[var(--muted)]">
            Bank your best application answers once, then match any new form question against
            your vault instead of rewriting from scratch.
          </p>
        </div>

        {/* Match panel */}
        <div className="border-t border-[var(--border)] px-5 py-4">
          <MatchPanel />
        </div>
      </div>

      {/* ── Saved answers ──────────────────────────────────────────────────── */}
      <section>
        <div className="mb-3 flex items-center gap-2 px-1">
          <h2 className="text-[12px] uppercase tracking-[1.6px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
            Saved Answers
          </h2>
          <div className="ml-auto">
            <Button
              variant="secondary"
              onClick={() => setShowForm((v) => !v)}
              className="px-4 py-2 text-[12px]"
            >
              {showForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {showForm ? 'Close' : 'Add answer'}
            </Button>
          </div>
        </div>

        {showForm && (
          <div className="mb-4">
            <AnswerForm onDone={() => setShowForm(false)} />
          </div>
        )}

        {isError ? (
          <ErrorState
            variant="banner"
            title="Couldn't load your answers"
            onRetry={() => void refetch()}
          />
        ) : isLoading ? (
          <SkeletonList />
        ) : answers.length === 0 ? (
          !showForm && <EmptyVault onAdd={() => setShowForm(true)} />
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {answers.map((answer) => (
              <AnswerCard key={answer.id} answer={answer} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Match panel ───────────────────────────────────────────────────────────────

function scoreTone(score: number): { color: string; label: string } {
  if (score >= 70) return { color: 'var(--green)', label: 'Strong' };
  if (score >= 40) return { color: 'var(--amber)', label: 'Partial' };
  return { color: 'var(--muted)', label: 'Weak' };
}

function MatchPanel() {
  const [question, setQuestion] = useState('');

  const match = useMutation({
    mutationFn: (q: string) => api.answers.match(q),
  });

  const results: AnswerMatch[] = match.data?.matches ?? [];
  const canSearch = question.trim().length > 0 && !match.isPending;

  const submit = () => {
    if (!canSearch) return;
    match.mutate(question.trim());
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        <Search className="h-3.5 w-3.5 text-[var(--cyan)]" />
        <p className="text-[12px] font-semibold text-[var(--text)]">Match a question</p>
        <span className="text-[10px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
          semantic search over your vault
        </span>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-start">
        <textarea
          value={question}
          rows={2}
          disabled={match.isPending}
          placeholder='Paste the application question, e.g. "Why do you want to work here?"'
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit();
          }}
          className="w-full flex-1 resize-y px-3 py-2 text-sm leading-relaxed disabled:opacity-50 huly-input"
        />
        <Button
          variant="primary"
          onClick={submit}
          disabled={!canSearch}
          className="shrink-0"
        >
          {match.isPending ? <Spinner size={14} className="text-[var(--bg)]" /> : <Search className="h-3.5 w-3.5" />}
          Find my answer
        </Button>
      </div>

      {match.isError && (
        <p className="mt-2 text-[11px] text-[var(--red)]">
          {errorMessage(match.error)}
        </p>
      )}

      {match.isSuccess && results.length === 0 && (
        <p className="mt-3 text-[12px] text-[var(--muted)]">
          No matches in your vault yet — save an answer below and it becomes searchable.
        </p>
      )}

      {results.length > 0 && (
        <div className="mt-3 space-y-2">
          {results.map((m, i) => (
            <MatchResult key={m.id} match={m} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function MatchResult({ match, rank }: { match: AnswerMatch; rank: number }) {
  const tone = scoreTone(match.score);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(match.answer);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable — no-op, button stays in default state.
    }
  };

  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_70%,transparent)] p-3">
      <span className="mt-0.5 text-[10px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
        {String(rank).padStart(2, '0')}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[12px] font-semibold text-[var(--text)]">{match.question}</p>
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums leading-none"
            style={{
              color: tone.color,
              backgroundColor: `color-mix(in srgb, ${tone.color} 12%, transparent)`,
              border: `1px solid color-mix(in srgb, ${tone.color} 24%, transparent)`,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {Math.round(match.score)} · {tone.label}
          </span>
        </div>
        <p className="mt-1 whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--muted)]">
          {match.answer}
        </p>
      </div>
      <button
        type="button"
        onClick={() => void copy()}
        aria-label="Copy answer"
        className={`shrink-0 rounded-md border p-1.5 transition-colors ${
          copied
            ? 'border-[color-mix(in_srgb,var(--green)_40%,transparent)] text-[var(--green)]'
            : 'border-[var(--border)] text-[var(--muted2)] hover:border-[var(--border-bright)] hover:text-[var(--cyan)]'
        }`}
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

// ── Add / edit form ───────────────────────────────────────────────────────────

function AnswerForm({
  initial,
  onDone,
}: {
  initial?: AnswerOut;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [question, setQuestion] = useState(initial?.question ?? '');
  const [answer, setAnswer] = useState(initial?.answer ?? '');
  const [tags, setTags] = useState(initial?.tags.join(', ') ?? '');

  const save = useMutation({
    mutationFn: (payload: AnswerCreate) =>
      initial ? api.answers.update(initial.id, payload) : api.answers.create(payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ANSWERS_KEY });
      onDone();
    },
  });

  const canSave = question.trim().length > 0 && answer.trim().length > 0 && !save.isPending;

  return (
    <div className="rounded-xl border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--card)_82%,transparent)] p-4">
      <div className="space-y-4">
        <FormField label="Question">
          <textarea
            value={question}
            rows={2}
            disabled={save.isPending}
            placeholder='e.g. "Tell us about a time you led a project under pressure."'
            onChange={(e) => setQuestion(e.target.value)}
            className="w-full resize-y px-3 py-2 text-sm leading-relaxed disabled:opacity-50 huly-input"
          />
        </FormField>
        <FormField label="Answer">
          <textarea
            value={answer}
            rows={5}
            disabled={save.isPending}
            placeholder="Your polished, reusable answer…"
            onChange={(e) => setAnswer(e.target.value)}
            className="w-full resize-y px-3 py-2 text-sm leading-relaxed disabled:opacity-50 huly-input"
          />
        </FormField>
        <FormField label="Tags (comma-separated)">
          <input
            type="text"
            value={tags}
            disabled={save.isPending}
            placeholder="leadership, behavioral, culture-fit"
            onChange={(e) => setTags(e.target.value)}
            className="w-full px-3 py-2 text-sm disabled:opacity-50 huly-input"
          />
        </FormField>

        {save.isError && (
          <p className="text-[11px] text-[var(--red)]">{errorMessage(save.error)}</p>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button variant="secondary" onClick={onDone} disabled={save.isPending}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!canSave}
            onClick={() =>
              save.mutate({
                question: question.trim(),
                answer: answer.trim(),
                tags: parseTags(tags),
              })
            }
          >
            {save.isPending && <Spinner size={14} className="text-[var(--bg)]" />}
            {initial ? 'Save changes' : 'Save answer'}
          </Button>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold uppercase tracking-[0.5px] text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

// ── Answer card ───────────────────────────────────────────────────────────────

function AnswerCard({ answer }: { answer: AnswerOut }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const remove = useMutation({
    mutationFn: () => api.answers.remove(answer.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ANSWERS_KEY });
    },
  });

  if (editing) {
    return <AnswerForm initial={answer} onDone={() => setEditing(false)} />;
  }

  const longAnswer = answer.answer.length > 220 || answer.answer.split('\n').length > 3;

  return (
    <div className="group flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-bright)] bg-[color-mix(in_srgb,var(--card)_82%,transparent)] transition-all duration-200 hover:border-[color-mix(in_srgb,var(--cyan)_40%,var(--border-bright))] hover:shadow-[0_0_32px_color-mix(in_srgb,var(--cyan)_8%,transparent)]">
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-[var(--text)]">
            {answer.question}
          </p>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={remove.isPending}
              aria-label="Edit answer"
              className="rounded-md p-1.5 text-[var(--muted2)] transition-colors hover:bg-white/[0.06] hover:text-[var(--cyan)] disabled:opacity-40"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              disabled={remove.isPending}
              aria-label="Delete answer"
              className="rounded-md p-1.5 text-[var(--muted2)] transition-colors hover:bg-white/[0.06] hover:text-[var(--red)] disabled:opacity-40"
            >
              {remove.isPending ? <Spinner size={14} /> : <Trash2 className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <p className={`whitespace-pre-wrap text-[12px] leading-relaxed text-[var(--muted)] ${expanded ? '' : 'line-clamp-3'}`}>
          {answer.answer}
        </p>
        {longAnswer && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="self-start text-[11px] font-medium text-[var(--muted2)] transition-colors hover:text-[var(--cyan)]"
          >
            {expanded ? 'Show less' : 'Show more'}
          </button>
        )}

        {answer.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {answer.tags.map((tag) => (
              <Chip key={tag} tone="neutral">
                {tag}
              </Chip>
            ))}
          </div>
        )}

        {remove.isError && (
          <p className="text-[11px] text-[var(--red)]">{errorMessage(remove.error)}</p>
        )}

        {confirmDelete && (
          <div className="flex items-center gap-2 rounded-lg border border-[color-mix(in_srgb,var(--red)_30%,transparent)] bg-[color-mix(in_srgb,var(--red)_8%,transparent)] px-3 py-2">
            <span className="flex-1 text-[11px] text-[var(--muted2)]">Delete this answer?</span>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              disabled={remove.isPending}
              className="text-[11px] font-medium text-[var(--muted2)] transition-colors hover:text-[var(--text)] disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                setConfirmDelete(false);
                remove.mutate();
              }}
              disabled={remove.isPending}
              className="text-[11px] font-semibold text-[var(--red)] transition-colors hover:brightness-125 disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        )}

        <div className="mt-auto flex items-center gap-3 border-t border-[var(--border)] pt-3">
          <span className="text-[11px] tabular-nums text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            Used {answer.times_used}x
          </span>
          <span className="ml-auto text-[11px] text-[var(--muted)]" style={{ fontFamily: 'var(--font-mono)' }}>
            Updated {relativeTime(answer.updated_at)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyVault({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-bright)] bg-[linear-gradient(180deg,color-mix(in_srgb,var(--surface)_94%,white_2%),var(--surface))]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-full bg-[#ff5f57]" />
            <span className="size-2.5 rounded-full bg-[#febc2e]" />
            <span className="size-2.5 rounded-full bg-[#28c840]" />
          </div>
          <span className="text-[11px] uppercase tracking-[1.8px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
            vault is empty
          </span>
        </div>
      </div>

      <div className="grid gap-4 p-6 md:grid-cols-3">
        {['Save an answer you’re proud of', 'Tag it so it’s findable', 'Match future questions instantly'].map((msg, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-[var(--border)] bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] p-4 opacity-60">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] bg-[var(--card)]">
              <span className="text-[11px] font-bold text-[var(--cyan)]" style={{ fontFamily: 'var(--font-mono)' }}>
                {String(i + 1).padStart(2, '0')}
              </span>
            </div>
            <p className="text-[12px] text-[var(--muted)]">{msg}</p>
          </div>
        ))}
      </div>

      <div className="border-t border-[var(--border)] px-6 pb-6 pt-4 text-center">
        <MessageSquareQuote className="mx-auto h-5 w-5 text-[var(--muted2)]" />
        <p className="mt-3 text-[13px] text-[var(--muted2)]" style={{ fontFamily: 'var(--font-mono)' }}>
          No saved answers yet
        </p>
        <p className="mt-1 text-[12px] text-[var(--muted)]">
          Write an answer once, reuse it on every application form that asks the same thing.
        </p>
        <div className="mt-4">
          <Button variant="primary" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Add your first answer
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────

function SkeletonList() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex flex-col gap-3 rounded-xl border border-[var(--border)] bg-[color-mix(in_srgb,var(--card)_70%,transparent)] p-4">
          <Skeleton tone="surface" className="h-4 w-3/4" />
          <div className="space-y-2">
            <Skeleton tone="surface" className="h-3 w-full" />
            <Skeleton tone="surface" className="h-3 w-5/6" />
            <Skeleton tone="surface" className="h-3 w-2/3" />
          </div>
          <div className="flex gap-2">
            <Skeleton tone="surface" className="h-5 w-16 rounded-full" />
            <Skeleton tone="surface" className="h-5 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}
