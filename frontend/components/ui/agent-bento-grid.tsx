'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ChatCircle,
  Brain,
  Database,
  TerminalWindow,
  Code,
  FileText,
  SlackLogo,
  NotionLogo,
  Check,
  CircleNotch,
  Clock,
  Minus,
  Globe,
} from '@phosphor-icons/react';
import { cn } from '@/lib/format';

// ── shared card shell ──────────────────────────────────────────────────────────

interface FeatCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}

export function FeatCard({ title, description, children, className = '' }: FeatCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        'group relative flex flex-col gap-2 overflow-hidden rounded-[var(--radius-xl)] p-4',
        'bg-[var(--surface)]',
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05),0_0_0_1px_rgba(255,255,255,0.05),0_2px_4px_rgba(0,0,0,0.3)]',
        className,
      )}
    >
      <div className="z-10 flex flex-col gap-1.5">
        <h3 className="font-semibold text-[var(--text)] text-sm tracking-tight">{title}</h3>
        <p className="text-[var(--muted)] text-xs leading-relaxed max-w-[90%]">{description}</p>
      </div>
      <div className="relative mt-2 flex-1 w-full rounded-[14px] overflow-hidden border border-[var(--border)] bg-[var(--bg)]/50">
        {children}
      </div>
    </motion.div>
  );
}

// ── Card 1: Agent Pipeline ─────────────────────────────────────────────────────

type ActiveStep = 'request' | 'router' | 'agent' | 'memory' | 'tools' | 'response';

const VW = 320;
const VH = 240;

interface NodeConfig { id: string; x: number; y: number; icon?: React.ElementType; label?: string; type: 'box' | 'circle'; }

const NODES: NodeConfig[] = [
  { id: 'A',      x: 50,  y: 120, icon: ChatCircle,  label: 'REQUEST', type: 'box'    },
  { id: 'Router', x: 125, y: 120,                                       type: 'circle' },
  { id: 'C',      x: 200, y: 120, icon: Brain,       label: 'AGENT',   type: 'box'    },
  { id: 'B',      x: 280, y: 50,  icon: Database,    label: 'MEMORY',  type: 'box'    },
  { id: 'D',      x: 280, y: 190, icon: TerminalWindow, label: 'TOOLS',type: 'box'    },
];

interface FlowPath { id: string; d: string; activeSteps: ActiveStep[]; colorClass: string; }

const PATHS: FlowPath[] = [
  { id: 'a-to-router',    d: 'M 78 120 L 113 120',          activeSteps: ['request'],  colorClass: 'text-[var(--cyan)]'   },
  { id: 'router-to-agent',d: 'M 137 120 L 172 120',         activeSteps: ['agent'],    colorClass: 'text-[var(--violet)]' },
  { id: 'agent-to-memory',d: 'M 200 92 L 200 50 L 252 50',  activeSteps: ['memory'],   colorClass: 'text-fuchsia-400'     },
  { id: 'agent-to-tools', d: 'M 200 148 L 200 190 L 252 190',activeSteps: ['tools'],   colorClass: 'text-emerald-400'     },
  { id: 'resp-1',         d: 'M 172 120 L 137 120',          activeSteps: ['response'], colorClass: 'text-[var(--cyan)]'   },
  { id: 'resp-2',         d: 'M 113 120 L 78 120',           activeSteps: ['response'], colorClass: 'text-[var(--cyan)]'   },
];

const NODE_COLORS: Record<string, { bg: string; border: string; buttonBg: string; buttonBorder: string }> = {
  A:      { bg: 'bg-[var(--cyan)]/10',   border: 'border-[var(--cyan)]/50',   buttonBg: 'bg-[var(--cyan)]/80',   buttonBorder: 'border-[var(--cyan)]'   },
  Router: { bg: 'bg-amber-500/10',        border: 'border-amber-500/50',        buttonBg: 'bg-amber-500',           buttonBorder: 'border-amber-600'        },
  C:      { bg: 'bg-[var(--violet)]/10', border: 'border-[var(--violet)]/50', buttonBg: 'bg-[var(--violet)]/80', buttonBorder: 'border-[var(--violet)]'  },
  B:      { bg: 'bg-fuchsia-500/10',      border: 'border-fuchsia-500/50',      buttonBg: 'bg-fuchsia-500',         buttonBorder: 'border-fuchsia-600'      },
  D:      { bg: 'bg-emerald-500/10',      border: 'border-emerald-500/50',      buttonBg: 'bg-emerald-500',         buttonBorder: 'border-emerald-600'      },
};

export function Card1() {
  const [step, setStep] = useState<ActiveStep>('request');

  useEffect(() => {
    const steps: ActiveStep[] = ['request', 'router', 'agent', 'memory', 'tools', 'response'];
    let idx = 0;
    const t = setInterval(() => { idx = (idx + 1) % steps.length; setStep(steps[idx]); }, 2000);
    return () => clearInterval(t);
  }, []);

  const isNodeActive = (id: string) => {
    switch (step) {
      case 'request':  return id === 'A';
      case 'router':   return id === 'Router';
      case 'agent':    return id === 'C';
      case 'memory':   return id === 'C' || id === 'B';
      case 'tools':    return id === 'C' || id === 'D';
      case 'response': return id === 'C' || id === 'Router' || id === 'A';
      default:         return false;
    }
  };

  return (
    <div className="w-full h-full relative overflow-hidden select-none bg-[var(--bg)]/80 rounded-xl flex items-center justify-center p-2">
      <svg className="absolute inset-0 w-full h-full" aria-hidden>
        <defs>
          <pattern id="ag-grid" width="16" height="16" patternUnits="userSpaceOnUse">
            <circle cx="1.5" cy="1.5" r="0.75" fill="currentColor" className="text-white/[0.04]" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#ag-grid)" />
      </svg>

      <svg className="absolute inset-0 w-full h-full" viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" aria-hidden>
        {/* static base paths */}
        <path d="M 78 120 L 113 120"             fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <path d="M 137 120 L 172 120"            fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <path d="M 200 92 L 200 50 L 252 50"    fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
        <path d="M 200 148 L 200 190 L 252 190" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />

        {PATHS.map((p) => {
          if (!p.activeSteps.includes(step)) return null;
          return (
            <g key={p.id}>
              <motion.path d={p.d} fill="none" stroke="currentColor" className={p.colorClass} strokeWidth="3.5" strokeOpacity="0.2"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: 'easeInOut' }} />
              <motion.path d={p.d} fill="none" stroke="currentColor" className={p.colorClass} strokeWidth="1.5"
                initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: 'easeInOut' }} />
            </g>
          );
        })}

        {NODES.map((node) => {
          const isBox = node.type === 'box';
          const w = isBox ? 56 : 24; const h = isBox ? 56 : 24;
          const isActive = isNodeActive(node.id);
          const c = NODE_COLORS[node.id];
          const NodeIcon = node.icon;
          return (
            <foreignObject key={node.id} x={node.x - w / 2} y={node.y - h / 2} width={w} height={h} className="overflow-visible">
              <div className="w-full h-full flex items-center justify-center">
                {isBox && NodeIcon ? (
                  <div className={`w-full h-full rounded-[14px] border flex flex-col items-center justify-center text-white ${c.buttonBg} ${c.buttonBorder}`}>
                    <div className="mb-0.5 flex items-center justify-center">
                      <NodeIcon className="w-5 h-5" weight="fill" />
                    </div>
                    <span className="text-[8.5px] font-mono font-bold tracking-wider select-none">{node.label}</span>
                  </div>
                ) : (
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all duration-300 ${isActive ? 'bg-amber-500/20 border-amber-500/70' : 'bg-[var(--card)] border-[var(--border)]'}`}>
                    <motion.div
                      className={`w-2.5 h-2.5 rounded-full border border-dashed ${isActive ? 'border-amber-500' : 'border-white/20'}`}
                      animate={{ rotate: 360 }}
                      transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                    />
                  </div>
                )}
              </div>
            </foreignObject>
          );
        })}
      </svg>
    </div>
  );
}

// ── Card 2: Token Monitor ──────────────────────────────────────────────────────

export function Card2() {
  const bars = [45, 75, 35, 85, 60, 95, 50];
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
  const [activeIdx, setActiveIdx] = useState(0);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  useEffect(() => {
    const t = setInterval(() => setActiveIdx((p) => (p === 0 ? 1 : 0)), 3000);
    return () => clearInterval(t);
  }, []);

  return (
    <div className="w-full h-full flex flex-col gap-3.5 justify-between">
      <div className="flex gap-4 pt-[0.625rem] pr-[0.625rem] pb-0.5 pl-0.5">
        {[
          { label: 'Tokens/min', value: '12.4k', trend: '+8%' },
          { label: 'Cost/run',   value: '$0.042', trend: '-3%' },
        ].map((s, i) => {
          const isActive = i === activeIdx || hoveredIdx === i;
          return (
            <div key={i} className="flex-1 h-[76px] relative select-none">
              <div className="absolute inset-0 rounded-xl border border-[var(--border)] bg-white/[0.01] text-white/[0.03]"
                style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, currentColor 6px, currentColor 7px)' }} />
              <motion.div
                className="absolute inset-0 w-full h-full rounded-xl bg-[var(--card)] border border-[var(--border)] p-3 backdrop-blur-[2px] flex items-center justify-between gap-3 cursor-pointer hover:bg-[var(--surface)] transition-colors duration-300"
                animate={{ x: isActive ? '0.5rem' : '0rem', y: isActive ? '-0.5rem' : '0rem' }}
                transition={{ type: 'spring', stiffness: 200, damping: 16 }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-[8px] text-[var(--muted)] font-mono uppercase tracking-widest leading-none">{s.label}</span>
                  <span className="text-base font-bold font-mono text-[var(--text)] leading-none mt-1.5 tracking-tight">{s.value}</span>
                  <div className="flex items-center gap-1.5 mt-2">
                    <span className={`text-[8px] font-mono font-bold ${s.trend.startsWith('+') ? 'text-emerald-400' : 'text-rose-400'}`}>{s.trend}</span>
                    <span className="text-[8px] text-[var(--muted)] font-mono">prev</span>
                  </div>
                </div>
                <div className="w-12 h-6 flex items-center justify-center shrink-0">
                  <svg className="w-full h-full overflow-visible" viewBox="0 0 48 24">
                    <motion.path
                      d={i === 0 ? 'M 0 18 L 16 11 L 32 14 L 48 4' : 'M 0 4 L 16 12 L 32 8 L 48 18'}
                      fill="none" stroke="currentColor" className="text-[var(--muted)]/30"
                      strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"
                      initial={{ pathLength: 0 }} animate={{ pathLength: 1 }}
                      transition={{ duration: 0.8, delay: 0.2 + i * 0.15, ease: 'easeOut' }}
                    />
                    {(i === 0
                      ? [{ x: 0, y: 18 }, { x: 16, y: 11 }, { x: 32, y: 14 }, { x: 48, y: 4 }]
                      : [{ x: 0, y: 4  }, { x: 16, y: 12 }, { x: 32, y:  8 }, { x: 48, y: 18}]
                    ).map((pt, idx) => (
                      <motion.circle key={idx} cx={pt.x} cy={pt.y} r="1.5"
                        className="fill-[var(--bg)] stroke-[var(--muted)]/40" strokeWidth="1"
                        initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.5 + idx * 0.08, duration: 0.25 }} />
                    ))}
                  </svg>
                </div>
              </motion.div>
            </div>
          );
        })}
      </div>

      <div className="flex-1 flex items-end gap-2.5 px-0.5 min-h-[90px]">
        {bars.map((h, i) => (
          <div key={i} className="flex-1 h-full rounded-xl border border-[var(--border)] relative overflow-hidden bg-white/[0.01] text-white/[0.03]"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 6px, currentColor 6px, currentColor 7px)' }}>
            <motion.div
              className="absolute bottom-0 left-0 right-0 bg-[var(--blue)] border-t border-x border-[var(--blue)]/80 rounded-t-[10px]"
              initial={{ height: '0%' }}
              animate={{ height: [`${h}%`, `${Math.min(95,h+15)}%`, `${Math.max(10,h-20)}%`, `${Math.min(90,h+8)}%`, `${h}%`] }}
              transition={{ repeat: Infinity, duration: 3 + (i%3)*0.8, ease: 'easeInOut', delay: i*0.1 }}
            />
          </div>
        ))}
      </div>

      <div className="flex gap-2.5 px-0.5">
        {days.map((d, i) => (
          <p key={i} className="flex-1 text-center text-[8px] text-[var(--muted)] font-mono font-medium">{d}</p>
        ))}
      </div>
    </div>
  );
}

// ── Card 3: Activity Feed ──────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, { icon: React.ElementType; color: string; gradient: string; border: string }> = {
  done:    { icon: Check,       color: 'text-lime-400',    gradient: 'bg-gradient-to-b from-lime-400 to-lime-600',    border: 'border-lime-600'    },
  running: { icon: CircleNotch, color: 'text-[var(--blue)]', gradient: 'bg-gradient-to-b from-blue-400 to-blue-600',   border: 'border-blue-600'    },
  waiting: { icon: Clock,       color: 'text-amber-400',   gradient: 'bg-gradient-to-b from-amber-400 to-amber-600',  border: 'border-amber-600'   },
  idle:    { icon: Minus,       color: 'text-[var(--muted)]', gradient: 'bg-gradient-to-b from-zinc-400 to-zinc-600', border: 'border-zinc-600'    },
};

export function Card3() {
  const logs = [
    { agent: 'Planner',    action: 'Decomposed task into 4 sub-goals',      status: 'done',    t: '0.2s' },
    { agent: 'Researcher', action: 'Queried web for latest embeddings',       status: 'done',    t: '1.4s' },
    { agent: 'Coder',      action: 'Generating vector DB schema…',            status: 'running', t: '3.1s' },
    { agent: 'Reviewer',   action: 'Awaiting output from Coder',              status: 'waiting', t: '—'    },
    { agent: 'Writer',     action: 'Idle — queued',                           status: 'idle',    t: '—'    },
  ];
  const [activeIdx, setActiveIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setActiveIdx((p) => (p + 1) % logs.length), 2400);
    return () => clearInterval(t);
  }, [logs.length]);

  const getSlot = (i: number) => {
    const N = logs.length; let rel = i - activeIdx;
    if (rel > Math.floor(N/2)) rel -= N;
    if (rel < -Math.floor(N/2)) rel += N;
    return rel;
  };
  const Y: Record<string, number> = { '-2': -68, '-1': -38, '0': 0, '1': 38, '2': 68 };

  return (
    <div className="w-full h-full relative flex items-center justify-center overflow-hidden">
      {logs.map((l, i) => {
        const slot = getSlot(i); const si = STATUS_ICONS[l.status];
        const abs = Math.abs(slot); const isActive = slot === 0; const isVisible = abs <= 2;
        const yOffset = Y[String(slot)] ?? (slot < 0 ? -120 : 120);
        const scale = isActive ? 1 : abs === 1 ? 0.93 : 0.87;
        const opacity = isActive ? 1 : abs === 1 ? 0.65 : 0.38;

        return (
          <motion.div key={l.agent}
            className="absolute left-0 right-0 mx-auto px-1.5"
            style={{ zIndex: isActive ? 30 : abs === 1 ? 20 : 10 }}
            animate={{ y: isVisible ? yOffset : slot < 0 ? -150 : 150, scale, opacity: isVisible ? opacity : 0 }}
            transition={{ y: { type: 'spring', stiffness: 500, damping: 35 }, scale: { type: 'spring', stiffness: 500, damping: 35 }, opacity: { duration: 0.25 } }}
          >
            <div className={`w-full rounded-2xl border flex items-center gap-2.5 ${isActive ? 'px-3 py-2.5 bg-[var(--card)] border-[var(--border)]' : 'px-2.5 py-1.5 bg-[var(--surface)] border-[var(--border)]'}`}>
              <div className={`shrink-0 rounded-[8px] flex items-center justify-center font-bold text-white transition-all duration-300 ${si.gradient} border ${si.border} ${isActive ? 'w-8 h-8' : 'w-5 h-5'}`}>
                <si.icon weight="bold" className={`${isActive ? 'w-4 h-4' : 'w-2.5 h-2.5'} ${l.status === 'running' ? 'animate-spin' : ''}`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className={`font-mono font-semibold text-[var(--text)] leading-none ${isActive ? 'text-[10px]' : 'text-[9px]'}`}>{l.agent}</span>
                  <span className={`font-mono uppercase tracking-wide rounded px-1 py-0.5 ${si.color} bg-white/[0.05] ${isActive ? 'text-[7px]' : 'text-[6px]'}`}>{l.status}</span>
                </div>
                {isActive && <p className="text-[9px] text-[var(--muted)] truncate mt-0.5 leading-tight">{l.action}</p>}
              </div>
              {isActive && <span className="text-[9px] font-mono text-[var(--muted)] shrink-0">{l.t}</span>}
            </div>
          </motion.div>
        );
      })}
      <div className="absolute bottom-1 left-0 right-0 flex justify-center gap-1">
        {logs.map((_, i) => (
          <motion.div key={i} className="rounded-full bg-[var(--muted2)]/25"
            animate={{ width: i === activeIdx ? 14 : 4, opacity: i === activeIdx ? 0.7 : 0.2 }}
            style={{ height: 3 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} />
        ))}
      </div>
    </div>
  );
}

// ── Card 4: Knowledge Base ─────────────────────────────────────────────────────

const NS_ICONS: Record<string, React.ElementType> = { codebase: Code, docs: FileText, slack: SlackLogo, notion: NotionLogo };
const NS_COLORS: Record<string, { bar: string; dot: string; badge: string; buttonBg: string; buttonBorder: string }> = {
  codebase: { bar: 'from-[var(--violet)] to-violet-400',  dot: 'bg-[var(--violet)]', badge: 'bg-[var(--violet)]/10 text-[var(--violet)]', buttonBg: 'bg-[var(--violet)]/80', buttonBorder: 'border-[var(--violet)]'  },
  docs:     { bar: 'from-[var(--cyan)] to-sky-400',       dot: 'bg-[var(--cyan)]',   badge: 'bg-[var(--cyan)]/10 text-[var(--cyan)]',     buttonBg: 'bg-[var(--cyan)]/80',   buttonBorder: 'border-[var(--cyan)]'    },
  slack:    { bar: 'from-emerald-500 to-emerald-400',     dot: 'bg-emerald-400',     badge: 'bg-emerald-400/10 text-emerald-400',          buttonBg: 'bg-emerald-500',        buttonBorder: 'border-emerald-600'      },
  notion:   { bar: 'from-amber-500 to-amber-400',         dot: 'bg-amber-400',       badge: 'bg-amber-400/10 text-amber-400',              buttonBg: 'bg-amber-500',          buttonBorder: 'border-amber-600'        },
};
const RETRIEVAL_QUERIES = [
  { ns: 'codebase', q: 'vector embeddings auth module',      t: '0.2s' },
  { ns: 'docs',     q: 'API rate limiting config',            t: '1.1s' },
  { ns: 'codebase', q: 'Redis cache invalidation patterns',  t: '2.4s' },
  { ns: 'slack',    q: 'deployment discussion #eng',          t: '4.0s' },
  { ns: 'notion',   q: 'Q3 roadmap — agent features',        t: '5.8s' },
  { ns: 'docs',     q: 'OpenAI function calling schema',      t: '7.2s' },
];

export function Card4() {
  const namespaces = [
    { name: 'codebase', hits: 342, fill: 88 },
    { name: 'docs',     hits: 218, fill: 56 },
    { name: 'slack',    hits: 97,  fill: 25 },
    { name: 'notion',   hits: 54,  fill: 14 },
  ];
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((p) => (p + 1) % RETRIEVAL_QUERIES.length), 2000);
    return () => clearInterval(t);
  }, []);
  const activeNs = RETRIEVAL_QUERIES[tick].ns;
  const recentQueries = [0,1,2,3].map((o) => RETRIEVAL_QUERIES[(tick - o + RETRIEVAL_QUERIES.length) % RETRIEVAL_QUERIES.length]);

  return (
    <div className="w-full h-full flex gap-5 py-2 px-3">
      <div className="flex-1 flex flex-col gap-0 min-w-0 pr-2">
        <p className="text-[8px] font-mono uppercase tracking-widest text-[var(--muted)] mb-3">Namespaces</p>
        <div className="flex flex-col gap-3 flex-1">
          {namespaces.map((ns, i) => {
            const c = NS_COLORS[ns.name];
            const isActive = ns.name === activeNs;
            const Icon = (NS_ICONS[ns.name] || Database) as React.ComponentType<{ size?: number; weight?: string; className?: string }>;
            return (
              <div key={ns.name} className="flex items-center gap-3 group">
                <div className={`relative flex shrink-0 items-center justify-center w-[36px] h-[36px] rounded-[12px] border transition-all duration-500 ${isActive ? `text-white ${c.buttonBg} ${c.buttonBorder} scale-105` : 'bg-[var(--card)] border-[var(--border)] text-[var(--muted)]'}`}>
                  <Icon size={16} weight={isActive ? 'fill' : 'regular'} className="relative z-10" />
                </div>
                <span className={`text-[10px] font-mono w-16 shrink-0 transition-colors duration-400 ${isActive ? 'text-[var(--text)] font-semibold' : 'text-[var(--muted)]'}`}>{ns.name}</span>
                <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden relative">
                  <motion.div
                    className={`absolute left-0 top-0 bottom-0 rounded-full bg-gradient-to-r ${c.bar}`}
                    initial={{ width: '0%' }}
                    animate={{ width: `${ns.fill}%`, opacity: isActive ? 1 : 0.25 }}
                    transition={{ width: { duration: 1.2, delay: i*0.1, type: 'spring', bounce: 0.2 }, opacity: { duration: 0.4 } }}
                  >
                    {isActive && (
                      <motion.div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-transparent via-white/50 to-transparent"
                        initial={{ x: '-100%' }} animate={{ x: '100%' }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }} />
                    )}
                  </motion.div>
                </div>
                <div className={`flex items-center gap-1.5 w-10 justify-end transition-all duration-500 ${isActive ? 'opacity-100 scale-105' : 'opacity-60 scale-100'}`}>
                  <span className={`text-[9px] font-mono font-medium ${isActive ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>{ns.hits}</span>
                  {isActive && (
                    <motion.div className={`w-1 h-1 rounded-full ${c.dot}`}
                      animate={{ opacity: [1, 0.2, 1], scale: [1, 1.5, 1] }}
                      transition={{ repeat: Infinity, duration: 1 }} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-2 pt-3 mt-auto">
          <div className="relative flex items-center justify-center w-2 h-2">
            <motion.div className="absolute inset-0 rounded-full bg-emerald-400/40"
              animate={{ scale: [1, 2.5, 1], opacity: [0.5, 0, 0.5] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }} />
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[8px] font-mono text-[var(--muted)] font-medium tracking-wide">Live retrieval active</span>
        </div>
      </div>

      <div className="w-px bg-[var(--border)] self-stretch shrink-0" />

      <div className="w-[172px] shrink-0 flex flex-col gap-0">
        <p className="text-[8px] font-mono uppercase tracking-widest text-[var(--muted)] mb-2.5">Retrieval Log</p>
        <div className="flex flex-col gap-1.5 flex-1 overflow-hidden">
          {recentQueries.map((q, qi) => {
            const c = NS_COLORS[q.ns];
            return (
              <motion.div key={`${q.ns}-${q.q}-${qi}`}
                className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-2.5 py-2"
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: qi === 0 ? 1 : qi === 1 ? 0.8 : qi === 2 ? 0.5 : 0.25, y: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 35, delay: qi * 0.05 }}
              >
                <div className="flex items-center gap-1 mb-1">
                  <span className={`text-[6.5px] font-mono font-semibold uppercase px-1.5 py-0.5 rounded-md ${c.badge}`}>{q.ns}</span>
                  <span className="text-[7px] font-mono text-[var(--muted)] ml-auto tabular-nums">{q.t}</span>
                </div>
                <p className="text-[8px] text-[var(--muted2)] leading-tight font-mono truncate">{q.q}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Card 5: Tool Inspector ─────────────────────────────────────────────────────

export function Card5() {
  const tools = [
    { name: 'web_search',   calls: 14, icon: Globe,         latency: '280ms', color: 'bg-gradient-to-b from-sky-400 to-sky-600',     borderColor: 'border-sky-600'     },
    { name: 'code_exec',    calls: 8,  icon: TerminalWindow, latency: '1.2s',  color: 'bg-gradient-to-b from-emerald-400 to-emerald-600', borderColor: 'border-emerald-600' },
    { name: 'file_read',    calls: 22, icon: FileText,       latency: '12ms',  color: 'bg-gradient-to-b from-amber-400 to-amber-600',  borderColor: 'border-amber-600'   },
    { name: 'vector_query', calls: 31, icon: Brain,          latency: '95ms',  color: 'bg-gradient-to-b from-violet-400 to-violet-600',borderColor: 'border-violet-600'  },
  ];
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="grid grid-cols-2 gap-2 w-full">
        {tools.map((t, i) => (
          <motion.div key={i}
            className="relative rounded-[16px] border border-[var(--border)] bg-[var(--card)] flex flex-col justify-between p-2.5 group hover:border-[var(--border-bright)] transition-all duration-300"
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, type: 'spring', stiffness: 300, damping: 25 }}
          >
            <div className="flex items-start justify-between">
              <div className={`w-[28px] h-[28px] rounded-[8px] flex items-center justify-center text-white ${t.color} border ${t.borderColor} group-hover:scale-105 transition-transform duration-300`}>
                <t.icon weight="fill" className="w-3.5 h-3.5 relative z-10" />
              </div>
              <div className="flex flex-col items-end gap-0.5 mt-0.5">
                <span className="text-[12px] font-mono font-bold text-[var(--text)] leading-none">{t.calls}</span>
                <span className="text-[7px] font-mono text-[var(--muted)] uppercase tracking-widest leading-none">Calls</span>
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono font-medium text-[var(--text)] tracking-tight">{t.name}</span>
                <span className="text-[8px] font-mono text-[var(--muted)] tabular-nums">{t.latency}</span>
              </div>
              <div className="w-full h-1.5 bg-white/[0.04] rounded-full overflow-hidden relative">
                <motion.div className={`absolute left-0 top-0 bottom-0 rounded-full ${t.color}`}
                  initial={{ width: '0%' }} animate={{ width: `${(t.calls/31)*100}%` }}
                  transition={{ delay: 0.4 + i*0.1, duration: 0.8, ease: 'easeOut' }} />
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Main Grid ──────────────────────────────────────────────────────────────────

const CARDS = [
  { title: 'Agent Pipeline',  description: 'Watch tasks flow across the multi-agent graph in real time.',          visual: <Card1 />, colSpan: 'lg:col-span-1', height: 'h-[260px]' },
  { title: 'Token Monitor',   description: 'Track LLM token usage and cost-per-run across every model call.',     visual: <Card2 />, colSpan: 'lg:col-span-1', height: 'h-[260px]' },
  { title: 'Activity Feed',   description: 'Real-time logs of agent actions, tool calls, and memory retrievals.', visual: <Card3 />, colSpan: 'lg:col-span-1', height: 'h-[260px]' },
  { title: 'Knowledge Base',  description: 'Semantic search across documents, codebases, and conversations.',     visual: <Card4 />, colSpan: 'lg:col-span-2', height: 'h-[260px]' },
  { title: 'Tool Inspector',  description: 'Monitor tool usage, latency, and success rates across all agents.',   visual: <Card5 />, colSpan: 'lg:col-span-1', height: 'h-[260px]' },
];

export interface AgentBentoGridProps { className?: string; }

export function AgentBentoGrid({ className }: AgentBentoGridProps) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full', className)}>
      {CARDS.map((card, idx) => (
        <FeatCard key={idx} title={card.title} description={card.description}
          className={cn(card.colSpan, card.height)}>
          {card.visual}
        </FeatCard>
      ))}
    </div>
  );
}

export default AgentBentoGrid;
