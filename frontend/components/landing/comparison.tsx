import { Check, X } from 'lucide-react';

const OLD_WAY: string[] = [
  'You type keywords; they hand back a wall of links',
  'Ranked by recency and ad spend, not by fit',
  'Ghost postings and re-listed roles slip through',
  'A chatbot answers questions — you still do the searching',
  'No reasoning, no evidence, no company context',
  'You read 200 JDs to find the 3 worth applying to',
];

const NEW_WAY: string[] = [
  'An agent runs the whole search end-to-end, autonomously',
  'Every role graded A–F across 10 weighted dimensions',
  'Ghost and stale postings detected and discarded',
  'It does the work and shows it — a live, auditable run',
  'Each grade cites the JD and your profile as evidence',
  'You wake up to 3 vetted matches with resumes queued',
];

export function Comparison() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-16 sm:py-20">
      <div className="mb-10 text-center">
        <h2 className="text-[28px] font-extrabold tracking-[-1px] text-[var(--text)] sm:text-[34px]">
          Stop searching. Start sending an agent.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] text-[var(--muted2)]">
          The difference between a tool you operate and an agent that operates
          for you.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Old way */}
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <div className="mb-5 flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-[var(--muted)]">
              The old way
            </span>
          </div>
          <h3 className="mb-5 text-[18px] font-bold tracking-[-0.5px] text-[var(--muted2)]">
            Job boards &amp; chatbots
          </h3>
          <ul className="space-y-3.5">
            {OLD_WAY.map((item) => (
              <li key={item} className="flex gap-3">
                <X
                  size={18}
                  strokeWidth={2.25}
                  className="mt-px shrink-0 text-[var(--muted)]"
                  aria-hidden
                />
                <span className="text-[14px] leading-relaxed text-[var(--muted)]">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {/* New way */}
        <div className="rounded-xl border border-[var(--border-bright)] bg-[var(--surface)] p-6">
          <div className="mb-5 flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.8px] text-[var(--green)]">
              The agent way
            </span>
          </div>
          <h3 className="mb-5 text-[18px] font-bold tracking-[-0.5px] text-[var(--text)]">
            JobReach AI
          </h3>
          <ul className="space-y-3.5">
            {NEW_WAY.map((item) => (
              <li key={item} className="flex gap-3">
                <Check
                  size={18}
                  strokeWidth={2.5}
                  className="mt-px shrink-0 text-[var(--green)]"
                  aria-hidden
                />
                <span className="text-[14px] leading-relaxed text-[var(--text)]">
                  {item}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

export default Comparison;
