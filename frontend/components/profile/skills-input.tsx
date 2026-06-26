'use client';

import { useState, useRef } from 'react';
import { X, Plus } from 'lucide-react';
import { SmoothInput } from '@/components/ui/smooth-input';

export const MAX_SKILLS = 10;

export interface SkillEntry {
  name: string;
  years: number;
}

const YEAR_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15] as const;

const selectClass =
  'rounded-[var(--radius-md)] border border-[var(--border-bright)] bg-[var(--surface)] px-2 py-1 text-xs text-[var(--muted2)] focus:border-[var(--blue)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/30 disabled:cursor-not-allowed';

interface SkillsInputProps {
  value: SkillEntry[];
  onChange: (next: SkillEntry[]) => void;
  disabled?: boolean;
}

export function SkillsInput({ value, onChange, disabled = false }: SkillsInputProps) {
  const [draftName, setDraftName] = useState('');
  const [draftYears, setDraftYears] = useState(1);
  const inputRef = useRef<HTMLInputElement>(null!);
  const atMax = value.length >= MAX_SKILLS;

  const add = () => {
    const name = draftName.trim();
    if (!name || atMax) return;
    if (value.some((s) => s.name.toLowerCase() === name.toLowerCase())) {
      setDraftName('');
      return;
    }
    onChange([...value, { name, years: draftYears }]);
    setDraftName('');
    setDraftYears(1);
    inputRef.current?.focus();
  };

  const remove = (idx: number) => onChange(value.filter((_, i) => i !== idx));

  const updateYears = (idx: number, years: number) =>
    onChange(value.map((s, i) => (i === idx ? { ...s, years } : s)));

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="space-y-2">
      {value.map((skill, i) => (
        <div
          key={`${skill.name}-${i}`}
          className="flex items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-3 py-2.5"
        >
          <span className="flex-1 truncate text-sm font-medium text-[var(--text)]">
            {skill.name}
          </span>
          <select
            value={skill.years}
            onChange={(e) => updateYears(i, Number(e.target.value))}
            disabled={disabled}
            className={selectClass}
          >
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>
                {y} yr{y > 1 ? 's' : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => remove(i)}
            disabled={disabled}
            aria-label={`Remove ${skill.name}`}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--red)] disabled:cursor-not-allowed"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}

      {atMax ? (
        <p className="text-xs text-[var(--amber)]">
          Max {MAX_SKILLS} skills reached — remove one to add another.
        </p>
      ) : (
        <>
          <div className="flex gap-2">
            <SmoothInput
              ref={inputRef}
              type="text"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={disabled}
              placeholder="Skill name…"
              className="px-3 py-2 text-sm"
              wrapperClassName="min-w-0 flex-1"
            />
            <select
              value={draftYears}
              onChange={(e) => setDraftYears(Number(e.target.value))}
              disabled={disabled}
              className="rounded-[var(--radius-md)] border border-[var(--border-bright)] bg-[var(--card)] px-2 py-2 text-sm text-[var(--muted2)] focus:border-[var(--blue)] focus:outline-none focus:ring-2 focus:ring-[var(--blue)]/30 disabled:cursor-not-allowed"
            >
              {YEAR_OPTIONS.map((y) => (
                <option key={y} value={y}>
                  {y} yr{y > 1 ? 's' : ''}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={add}
              disabled={disabled || !draftName.trim()}
              className="flex shrink-0 items-center gap-1.5 rounded-[var(--radius-md)] border border-[var(--border-bright)] bg-[var(--card)] px-3 py-2 text-sm text-[var(--muted2)] transition-colors hover:border-white/25 hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {value.length}/{MAX_SKILLS} skills — press Enter to add.
          </p>
        </>
      )}
    </div>
  );
}

/** Serialize to backend string[]: "TypeScript (5y)" */
export function serializeSkills(entries: SkillEntry[]): string[] {
  return entries.map((e) => `${e.name} (${e.years}y)`);
}

/** Parse from backend string[]. Handles both "TypeScript (5y)" and bare "TypeScript". */
export function parseSkills(skills: string[]): SkillEntry[] {
  return skills.map((s) => {
    const m = /^(.+)\s+\((\d+)y\)$/.exec(s.trim());
    return m ? { name: m[1].trim(), years: Number(m[2]) } : { name: s, years: 1 };
  });
}
