'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { X, MapPin, Loader2 } from 'lucide-react';
import { cn } from '@/lib/format';

interface NominatimResult {
  place_id: number;
  display_name: string;
  type: string;
  address: {
    city?: string;
    town?: string;
    village?: string;
    suburb?: string;
    municipality?: string;
    county?: string;
    state?: string;
    country?: string;
    country_code?: string;
  };
}

function formatPlace(item: NominatimResult): string {
  const a = item.address;
  const city = a.city || a.town || a.village || a.municipality || a.suburb;
  const parts: string[] = [];
  if (city) parts.push(city);
  if (a.state && a.state !== city) parts.push(a.state);
  if (a.country_code) parts.push(a.country_code.toUpperCase());
  return parts.length > 0
    ? parts.join(', ')
    : item.display_name.split(',').slice(0, 2).join(',').trim();
}

export interface LocationPickerProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function LocationPicker({ value, onChange, disabled = false }: LocationPickerProps) {
  const [draft, setDraft] = useState('');
  const [suggestions, setSuggestions] = useState<{ id: number; label: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const addLocation = useCallback(
    (label: string) => {
      const trimmed = label.trim();
      if (!trimmed) return;
      const exists = value.some((v) => v.toLowerCase() === trimmed.toLowerCase());
      if (!exists) onChange([...value, trimmed]);
      setDraft('');
      setSuggestions([]);
      setOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    },
    [value, onChange],
  );

  const removeLocation = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx));
  };

  // Debounced Nominatim search
  useEffect(() => {
    const q = draft.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const signal = abortRef.current.signal;
      const headers = { 'Accept-Language': 'en', 'User-Agent': 'JobReachAI/1.0' };
      setLoading(true);
      try {
        const [directData, citiesData] = await Promise.all([
          fetch(
            `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&featuretype=city,state,country`,
            { headers, signal },
          ).then<NominatimResult[]>((r) => r.json()),
          fetch(
            `https://nominatim.openstreetmap.org/search?state=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&featuretype=city`,
            { headers, signal },
          ).then<NominatimResult[]>((r) => r.json()),
        ]);
        const seen = new Set<string>();
        const items = [...directData, ...citiesData].flatMap((item) => {
          const label = formatPlace(item);
          if (seen.has(label.toLowerCase())) return [];
          seen.add(label.toLowerCase());
          return [{ id: item.place_id, label }];
        });
        setSuggestions(items);
        setOpen(items.length > 0);
        setActiveIndex(-1);
      } catch {
        // aborted or network error — ignore
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [draft]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      setActiveIndex(-1);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open && suggestions.length) setOpen(true);
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, -1));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        addLocation(suggestions[activeIndex].label);
      } else if (draft.trim()) {
        // Allow freeform entry too
        addLocation(draft.trim());
      }
      return;
    }
    if (e.key === ',') {
      e.preventDefault();
      if (draft.trim()) addLocation(draft.trim());
    }
  };

  // Scroll active suggestion into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      item?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  return (
    <div ref={containerRef} className="relative">
      {/* Tags + input row */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-bright)] bg-[var(--card)] px-3 py-2 transition-colors focus-within:border-[var(--blue)] focus-within:ring-2 focus-within:ring-[var(--blue)]/30',
          disabled && 'opacity-60',
        )}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((loc, i) => (
          <span
            key={`${loc}-${i}`}
            className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border)] bg-white/[0.06] py-1 pl-2.5 pr-1.5 text-xs font-medium text-[var(--text)]"
          >
            <MapPin className="h-3 w-3 text-[var(--cyan)]" />
            {loc}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (!disabled) removeLocation(i); }}
              disabled={disabled}
              aria-label={`Remove ${loc}`}
              className="flex h-4 w-4 items-center justify-center rounded-full text-[var(--muted)] transition-colors hover:bg-[var(--card)] hover:text-[var(--red)] disabled:cursor-not-allowed"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}

        <div className="flex min-w-[10rem] flex-1 items-center gap-1.5">
          <input
            ref={inputRef}
            type="text"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => suggestions.length > 0 && setOpen(true)}
            disabled={disabled}
            placeholder={value.length === 0 ? 'Type a city, state or country…' : 'Add more…'}
            autoComplete="off"
            className="min-w-0 flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none disabled:cursor-not-allowed"
          />
          {loading && <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[var(--muted)]" />}
        </div>
      </div>

      {/* Suggestions dropdown */}
      {open && suggestions.length > 0 && (
        <ul
          ref={listRef}
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-auto rounded-[var(--radius-md)] border border-[var(--border-bright)] bg-[var(--surface)] py-1 shadow-lg"
        >
          {suggestions.map((s, idx) => (
            <li
              key={s.id}
              role="option"
              aria-selected={idx === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click registers
                addLocation(s.label);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 px-3 py-2.5 text-sm transition-colors',
                idx === activeIndex
                  ? 'bg-[color-mix(in_srgb,var(--cyan)_10%,transparent)] text-[var(--text)]'
                  : 'text-[var(--muted2)] hover:bg-[var(--card)] hover:text-[var(--text)]',
              )}
            >
              <MapPin className="h-3.5 w-3.5 shrink-0 text-[var(--cyan)]" />
              {/* Bold the matching portion */}
              <span>{highlightMatch(s.label, draft)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="mt-1.5 text-xs text-[var(--muted)]">
        Type a location and select from suggestions, or press Enter / comma to add freeform.
      </p>
    </div>
  );
}

/** Wraps the matched substring in a <strong> for visual highlighting. */
function highlightMatch(label: string, query: string): React.ReactNode {
  if (!query.trim()) return label;
  const idx = label.toLowerCase().indexOf(query.trim().toLowerCase());
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <strong className="font-semibold text-[var(--text)]">
        {label.slice(idx, idx + query.length)}
      </strong>
      {label.slice(idx + query.length)}
    </>
  );
}
