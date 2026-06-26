'use client';

import {
  useState,
  useRef,
  useEffect,
  useCallback,
  type KeyboardEvent,
  type ChangeEvent,
} from 'react';
import { X, MapPin } from 'lucide-react';
import { cn } from '@/lib/format';

// ── Static location data ─────────────────────────────────────────────────────

interface LocationEntry {
  display: string;
  /** Additional search keywords (abbrevs, aliases). */
  keywords: string[];
}

const REMOTE: LocationEntry = {
  display: 'Remote',
  keywords: ['remote', 'wfh', 'anywhere', 'worldwide'],
};

const US_STATES: LocationEntry[] = [
  { display: 'Alabama', keywords: ['al'] },
  { display: 'Alaska', keywords: ['ak'] },
  { display: 'Arizona', keywords: ['az'] },
  { display: 'Arkansas', keywords: ['ar'] },
  { display: 'California', keywords: ['ca', 'socal', 'norcal'] },
  { display: 'Colorado', keywords: ['co'] },
  { display: 'Connecticut', keywords: ['ct'] },
  { display: 'Delaware', keywords: ['de'] },
  { display: 'Florida', keywords: ['fl'] },
  { display: 'Georgia', keywords: ['ga'] },
  { display: 'Hawaii', keywords: ['hi'] },
  { display: 'Idaho', keywords: ['id'] },
  { display: 'Illinois', keywords: ['il'] },
  { display: 'Indiana', keywords: ['in'] },
  { display: 'Iowa', keywords: ['ia'] },
  { display: 'Kansas', keywords: ['ks'] },
  { display: 'Kentucky', keywords: ['ky'] },
  { display: 'Louisiana', keywords: ['la'] },
  { display: 'Maine', keywords: ['me'] },
  { display: 'Maryland', keywords: ['md'] },
  { display: 'Massachusetts', keywords: ['ma', 'mass'] },
  { display: 'Michigan', keywords: ['mi'] },
  { display: 'Minnesota', keywords: ['mn'] },
  { display: 'Mississippi', keywords: ['ms'] },
  { display: 'Missouri', keywords: ['mo'] },
  { display: 'Montana', keywords: ['mt'] },
  { display: 'Nebraska', keywords: ['ne'] },
  { display: 'Nevada', keywords: ['nv'] },
  { display: 'New Hampshire', keywords: ['nh'] },
  { display: 'New Jersey', keywords: ['nj'] },
  { display: 'New Mexico', keywords: ['nm'] },
  { display: 'New York', keywords: ['ny'] },
  { display: 'North Carolina', keywords: ['nc'] },
  { display: 'North Dakota', keywords: ['nd'] },
  { display: 'Ohio', keywords: ['oh'] },
  { display: 'Oklahoma', keywords: ['ok'] },
  { display: 'Oregon', keywords: ['or'] },
  { display: 'Pennsylvania', keywords: ['pa'] },
  { display: 'Rhode Island', keywords: ['ri'] },
  { display: 'South Carolina', keywords: ['sc'] },
  { display: 'South Dakota', keywords: ['sd'] },
  { display: 'Tennessee', keywords: ['tn'] },
  { display: 'Texas', keywords: ['tx'] },
  { display: 'Utah', keywords: ['ut'] },
  { display: 'Vermont', keywords: ['vt'] },
  { display: 'Virginia', keywords: ['va'] },
  { display: 'Washington', keywords: ['wa'] },
  { display: 'Washington, D.C.', keywords: ['dc', 'district of columbia', 'washington dc'] },
  { display: 'West Virginia', keywords: ['wv'] },
  { display: 'Wisconsin', keywords: ['wi'] },
  { display: 'Wyoming', keywords: ['wy'] },
];

const MAJOR_CITIES: LocationEntry[] = [
  { display: 'New York City, NY', keywords: ['nyc', 'new york city', 'manhattan', 'brooklyn'] },
  { display: 'Los Angeles, CA', keywords: ['la', 'los angeles'] },
  { display: 'San Francisco, CA', keywords: ['sf', 'bay area'] },
  { display: 'Seattle, WA', keywords: ['seattle'] },
  { display: 'Chicago, IL', keywords: ['chicago'] },
  { display: 'Austin, TX', keywords: ['austin'] },
  { display: 'Boston, MA', keywords: ['boston'] },
  { display: 'Denver, CO', keywords: ['denver'] },
  { display: 'Miami, FL', keywords: ['miami'] },
  { display: 'Atlanta, GA', keywords: ['atlanta'] },
  { display: 'Dallas, TX', keywords: ['dallas', 'dfw'] },
  { display: 'Houston, TX', keywords: ['houston'] },
  { display: 'Phoenix, AZ', keywords: ['phoenix'] },
  { display: 'Portland, OR', keywords: ['portland'] },
  { display: 'San Diego, CA', keywords: ['san diego'] },
  { display: 'Minneapolis, MN', keywords: ['minneapolis'] },
  { display: 'Nashville, TN', keywords: ['nashville'] },
  { display: 'Raleigh, NC', keywords: ['raleigh', 'research triangle'] },
  { display: 'Salt Lake City, UT', keywords: ['slc'] },
  { display: 'San Jose, CA', keywords: ['san jose', 'silicon valley'] },
  { display: 'Philadelphia, PA', keywords: ['philly'] },
  { display: 'Pittsburgh, PA', keywords: ['pittsburgh'] },
  { display: 'Charlotte, NC', keywords: ['charlotte'] },
  { display: 'Columbus, OH', keywords: ['columbus'] },
  { display: 'Indianapolis, IN', keywords: ['indianapolis'] },
  { display: 'Kansas City, MO', keywords: ['kansas city'] },
  { display: 'Las Vegas, NV', keywords: ['las vegas'] },
  { display: 'Detroit, MI', keywords: ['detroit'] },
  { display: 'Baltimore, MD', keywords: ['baltimore'] },
];

const INTERNATIONAL: LocationEntry[] = [
  { display: 'London, UK', keywords: ['london', 'uk', 'england'] },
  { display: 'Toronto, Canada', keywords: ['toronto', 'canada'] },
  { display: 'Vancouver, Canada', keywords: ['vancouver'] },
  { display: 'Berlin, Germany', keywords: ['berlin', 'germany'] },
  { display: 'Amsterdam, Netherlands', keywords: ['amsterdam'] },
  { display: 'Dublin, Ireland', keywords: ['dublin', 'ireland'] },
  { display: 'Sydney, Australia', keywords: ['sydney', 'australia'] },
  { display: 'Singapore', keywords: ['sg'] },
  { display: 'Bangalore, India', keywords: ['bengaluru', 'india'] },
  { display: 'Tel Aviv, Israel', keywords: ['israel'] },
];

const ALL_LOCATIONS: LocationEntry[] = [
  REMOTE,
  ...MAJOR_CITIES,
  ...US_STATES,
  ...INTERNATIONAL,
];

const DEFAULT_SUGGESTIONS: LocationEntry[] = [
  REMOTE,
  ...MAJOR_CITIES.slice(0, 5),
];

function filterLocations(query: string, existing: string[]): LocationEntry[] {
  const existingSet = new Set(existing.map((e) => e.toLowerCase()));

  if (!query.trim()) {
    return DEFAULT_SUGGESTIONS.filter(
      (l) => !existingSet.has(l.display.toLowerCase()),
    );
  }

  const q = query.toLowerCase().trim();
  return ALL_LOCATIONS.filter((loc) => {
    if (existingSet.has(loc.display.toLowerCase())) return false;
    return (
      loc.display.toLowerCase().includes(q) ||
      loc.keywords.some((k) => k.includes(q))
    );
  }).slice(0, 8);
}

// ── Component ────────────────────────────────────────────────────────────────

export interface LocationTagsInputProps {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}

export function LocationTagsInput({
  value,
  onChange,
  disabled = false,
}: LocationTagsInputProps) {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const suggestions = filterLocations(draft, value);

  const addTag = useCallback(
    (raw: string) => {
      const tag = raw.trim();
      if (!tag) return;
      if (!value.some((t) => t.toLowerCase() === tag.toLowerCase())) {
        onChange([...value, tag]);
      }
      setDraft('');
      setOpen(false);
      setHighlighted(-1);
    },
    [value, onChange],
  );

  const removeTag = useCallback(
    (i: number) => onChange(value.filter((_, idx) => idx !== i)),
    [value, onChange],
  );

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setHighlighted(-1);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setDraft(e.target.value);
    setHighlighted(-1);
    setOpen(true);
  };

  const handleFocus = () => setOpen(true);

  const handleBlur = () => {
    if (draft.trim()) addTag(draft);
    else {
      setOpen(false);
      setHighlighted(-1);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlighted((h) => Math.max(h - 1, -1));
        break;
      case 'Escape':
        setOpen(false);
        setHighlighted(-1);
        break;
      case 'Enter':
      case ',':
        e.preventDefault();
        if (highlighted >= 0 && suggestions[highlighted]) {
          addTag(suggestions[highlighted].display);
        } else if (draft.trim()) {
          addTag(draft);
        }
        break;
      case 'Backspace':
        if (draft === '' && value.length > 0) {
          e.preventDefault();
          removeTag(value.length - 1);
        }
        break;
    }
  };

  // e.preventDefault() on mousedown keeps the input focused so onBlur never fires
  const pickSuggestion = (loc: LocationEntry, e: React.MouseEvent) => {
    e.preventDefault();
    addTag(loc.display);
    inputRef.current?.focus();
  };

  const showDropdown = open && !disabled && suggestions.length > 0;
  const hasCustomEntry =
    draft.trim() &&
    !suggestions.some((s) => s.display.toLowerCase() === draft.trim().toLowerCase());

  return (
    <div ref={wrapperRef} className="relative">
      {/* Tags + text input */}
      <div
        className={cn(
          'flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-[var(--border-bright)] bg-[var(--card)] px-3 py-2 transition-colors focus-within:border-[var(--blue)] focus-within:ring-2 focus-within:ring-[var(--blue)]/30',
          showDropdown && 'rounded-b-none border-b-transparent',
          disabled && 'opacity-60',
        )}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--border)] bg-white/[0.06] py-1 pl-2.5 pr-1.5 text-xs font-medium text-[var(--text)]"
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

        <input
          ref={inputRef}
          type="text"
          value={draft}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          disabled={disabled}
          placeholder={value.length === 0 ? 'City, state, or Remote…' : 'Add more…'}
          autoComplete="off"
          spellCheck={false}
          className="min-w-[10rem] flex-1 bg-transparent text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none disabled:cursor-not-allowed"
        />
      </div>

      {/* Autocomplete dropdown */}
      {showDropdown && (
        <ul className="absolute left-0 right-0 z-50 overflow-hidden rounded-b-[var(--radius-md)] border border-t-0 border-[var(--border-bright)] bg-[var(--card)] shadow-2xl shadow-black/40">
          {suggestions.map((loc, i) => (
            <li key={loc.display}>
              <button
                type="button"
                onMouseDown={(e) => pickSuggestion(loc, e)}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors',
                  i === highlighted
                    ? 'bg-[color-mix(in_srgb,var(--cyan)_10%,transparent)] text-[var(--text)]'
                    : 'text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)]',
                )}
              >
                <MapPin
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    loc.display === 'Remote'
                      ? 'text-[var(--cyan)]'
                      : 'text-[var(--muted2)]',
                  )}
                />
                <span className="flex-1">{loc.display}</span>
                {loc.display === 'Remote' && (
                  <span className="text-[10px] text-[var(--muted)]">worldwide</span>
                )}
              </button>
            </li>
          ))}

          {/* Free-text fallback when no exact match */}
          {hasCustomEntry && (
            <li className="border-t border-[var(--border)]">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  addTag(draft);
                  inputRef.current?.focus();
                }}
                className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-xs text-[var(--muted)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)]"
              >
                <span>Add</span>
                <span className="font-medium text-[var(--text)]">
                  &ldquo;{draft.trim()}&rdquo;
                </span>
                <span>as custom location</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
