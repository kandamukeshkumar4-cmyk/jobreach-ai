'use client';

import { BrainIcon, ChevronDownIcon, DotIcon } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/format';
import {
  createContext,
  memo,
  useContext,
  useMemo,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import type { LucideIcon } from 'lucide-react';

// ── Context ──────────────────────────────────────────────────────────────────

interface CtxValue { isOpen: boolean; setIsOpen: (v: boolean) => void }
const Ctx = createContext<CtxValue | null>(null);
const useCtx = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('ChainOfThought components must be inside ChainOfThought');
  return c;
};

// ── Root ─────────────────────────────────────────────────────────────────────

export type ChainOfThoughtProps = ComponentProps<'div'> & {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
};

export const ChainOfThought = memo(({
  className, defaultOpen = true, open: controlledOpen,
  onOpenChange, children, ...props
}: ChainOfThoughtProps) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = (v: boolean) => { setInternalOpen(v); onOpenChange?.(v); };
  const ctx = useMemo(() => ({ isOpen, setIsOpen }), [isOpen]);
  return (
    <Ctx.Provider value={ctx}>
      <div className={cn('w-full space-y-3', className)} {...props}>
        {children}
      </div>
    </Ctx.Provider>
  );
});
ChainOfThought.displayName = 'ChainOfThought';

// ── Header (collapsible trigger) ─────────────────────────────────────────────

export type ChainOfThoughtHeaderProps = ComponentProps<'button'>;

export const ChainOfThoughtHeader = memo(({
  className, children, ...props
}: ChainOfThoughtHeaderProps) => {
  const { isOpen, setIsOpen } = useCtx();
  return (
    <button
      type="button"
      onClick={() => setIsOpen(!isOpen)}
      className={cn(
        'flex w-full items-center gap-2 text-[var(--muted)] text-xs transition-colors hover:text-[var(--text)]',
        className,
      )}
      {...props}
    >
      <BrainIcon className="size-3.5 shrink-0" />
      <span className="flex-1 text-left font-medium tracking-wide">
        {children ?? 'Thinking…'}
      </span>
      <ChevronDownIcon
        className={cn('size-3.5 transition-transform duration-200', isOpen && 'rotate-180')}
      />
    </button>
  );
});
ChainOfThoughtHeader.displayName = 'ChainOfThoughtHeader';

// ── Content ───────────────────────────────────────────────────────────────────

export type ChainOfThoughtContentProps = ComponentProps<'div'>;

export const ChainOfThoughtContent = memo(({
  className, children, ...props
}: ChainOfThoughtContentProps) => {
  const { isOpen } = useCtx();
  return (
    <AnimatePresence initial={false}>
      {isOpen && (
        <motion.div
          key="cot-content"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="overflow-hidden"
        >
          <div className={cn('space-y-2 pt-1', className)} {...props}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});
ChainOfThoughtContent.displayName = 'ChainOfThoughtContent';

// ── Step ──────────────────────────────────────────────────────────────────────

export type StepStatus = 'complete' | 'active' | 'pending';

export interface ChainOfThoughtStepProps {
  icon?: LucideIcon;
  label: ReactNode;
  description?: ReactNode;
  status?: StepStatus;
  className?: string;
  children?: ReactNode;
}

const statusText: Record<StepStatus, string> = {
  active:   'text-[var(--text)]',
  complete: 'text-[var(--muted2)]',
  pending:  'text-[var(--muted)]/40',
};

export const ChainOfThoughtStep = memo(({
  className, icon: Icon = DotIcon, label, description,
  status = 'complete', children,
}: ChainOfThoughtStepProps) => (
  <motion.div
    initial={{ opacity: 0, y: 6 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.25 }}
    className={cn('flex gap-2 text-xs', statusText[status], className)}
  >
    {/* icon + vertical line */}
    <div className="relative mt-0.5 shrink-0">
      <Icon className={cn(
        'size-3.5',
        status === 'active' && 'text-[var(--cyan)]',
      )} />
      <div className="absolute top-5 bottom-0 left-1/2 -mx-px w-px bg-white/[0.06]" />
    </div>
    {/* content */}
    <div className="flex-1 overflow-hidden pb-2">
      <div className="leading-snug">{label}</div>
      {description && (
        <div className="mt-0.5 text-[var(--muted)] text-[11px]">{description}</div>
      )}
      {children}
    </div>
  </motion.div>
));
ChainOfThoughtStep.displayName = 'ChainOfThoughtStep';

// ── Search result badges ──────────────────────────────────────────────────────

export const ChainOfThoughtSearchResults = memo(({
  className, ...props
}: ComponentProps<'div'>) => (
  <div className={cn('flex flex-wrap items-center gap-1.5', className)} {...props} />
));
ChainOfThoughtSearchResults.displayName = 'ChainOfThoughtSearchResults';

export const ChainOfThoughtSearchResult = memo(({
  className, children, ...props
}: ComponentProps<'span'>) => (
  <span
    className={cn(
      'inline-flex items-center rounded-[4px] border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 font-mono text-[10px] text-[var(--muted2)]',
      className,
    )}
    {...props}
  >
    {children}
  </span>
));
ChainOfThoughtSearchResult.displayName = 'ChainOfThoughtSearchResult';
