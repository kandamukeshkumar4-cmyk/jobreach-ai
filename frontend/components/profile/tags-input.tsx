'use client';

import { useState, type KeyboardEvent } from 'react';
import { X, Plus } from 'lucide-react';
import { cn } from '@/lib/format';

export interface TagsInputProps {
  /** Current list of tags. */
  value: string[];
  /** Called with the next list whenever a tag is added or removed. */
  onChange: (next: string[]) => void;
  placeholder?: string;
  id?: string;
  /** Disable adding/removing (e.g. while saving). */
  disabled?: boolean;
}

/**
 * Lightweight tags / chips input.
 * - Type and press Enter (or comma) to add a chip.
 * - Backspace on an empty field removes the last chip.
 * - Click the x on a chip to remove it.
 * Dedupes case-insensitively and trims whitespace.
 */
export function TagsInput({
  value,
  onChange,
  placeholder = 'Type and press Enter…',
  id,
  disabled = false,
}: TagsInputProps) {
  const [draft, setDraft] = useState('');

  const addTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    const exists = value.some((t) => t.toLowerCase() === tag.toLowerCase());
    if (!exists) onChange([...value, tag]);
    setDraft('');
  };

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(draft);
    } else if (e.key === 'Backspace' && draft === '' && value.length > 0) {
      e.preventDefault();
      removeTag(value.length - 1);
    }
  };

  const commitDraft = () => {
    if (draft.trim()) addTag(draft);
  };

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2 rounded-[8px] border border-[var(--border)] bg-[var(--card)] px-3 py-2 transition-colors focus-within:border-[var(--border-bright)]',
        disabled && 'opacity-60',
      )}
    >
      {value.map((tag, i) => (
        <span
          key={`${tag}-${i}`}
          className="inline-flex items-center gap-1 rounded-full border border-[var(--border-bright)] bg-[var(--surface)] py-1 pl-2.5 pr-1.5 text-xs font-medium text-[var(--text)]"
        >
          {tag}
          <button
            type="button"
            onClick={() => !disabled && removeTag(i)}
            disabled={disabled}
            aria-label={`Remove ${tag}`}
            className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--card)] hover:text-[var(--red)] disabled:cursor-not-allowed"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <div className="flex min-w-[8rem] flex-1 items-center gap-1">
        <input
          id={id}
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
          disabled={disabled}
          placeholder={value.length === 0 ? placeholder : 'Add more…'}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none disabled:cursor-not-allowed"
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={() => addTag(draft)}
            disabled={disabled}
            aria-label="Add tag"
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--muted2)] transition-colors hover:text-[var(--cyan)]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

export default TagsInput;
