'use client';

import { useState, useEffect, useRef } from "react";
import { motion, useInView, useScroll, useTransform, AnimatePresence } from "framer-motion";
import Link from "next/link";
import {
  Menu, X, ArrowRight, Mail,
  Search, Star, FileText, LayoutGrid, Activity,
  Terminal, Layers, Cpu, GitBranch, Zap, Database,
  MapPin, CheckCircle,
} from "lucide-react";
import { MetalLink } from "@/components/ui/metal-button";
import { TiltCard } from "@/components/ui/tilt-card";
import { Marquee } from "@/components/ui/marquee";
import { TextReveal } from "@/components/ui/text-reveal";

/* ════════════════════════════════════════════════════════════
   ANIMATION PRIMITIVES  (from Awwwards transcript techniques)
   ════════════════════════════════════════════════════════════ */

/* 1. anim() variant template — direct from transcript */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function anim(v: { initial: any; enter: any; exit?: any }) {
  return { initial: v.initial, animate: v.enter, ...(v.exit && { exit: v.exit }) };
}

/* 2. FadeUp — scroll-triggered opacity + translateY (opacity entry) */
function FadeUp({
  children, delay = 0, className, style,
}: { children: React.ReactNode; delay?: number; className?: string; style?: React.CSSProperties }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-8% 0px' });
  return (
    <motion.div ref={ref} className={className} style={style}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: 32 }}
      transition={{ duration: 0.72, delay, ease: [0.76, 0, 0.24, 1] }}>
      {children}
    </motion.div>
  );
}

/* 3. SlideIn — directional slide for arch/about panels */
function SlideIn({
  children, from = 'left', delay = 0, className,
}: { children: React.ReactNode; from?: 'left' | 'right'; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-8% 0px' });
  const x = from === 'left' ? -44 : 44;
  return (
    <motion.div ref={ref} className={className}
      initial={{ opacity: 0, x }}
      animate={inView ? { opacity: 1, x: 0 } : { opacity: 0, x }}
      transition={{ duration: 0.68, delay, ease: [0.76, 0, 0.24, 1] }}>
      {children}
    </motion.div>
  );
}

/* 4. StairsReveal — staggered curtain columns (index-based delay, transitionEnd)
      directly from the Awwwards stairs/columns technique */
function StairsReveal({ children, n = 6 }: { children: React.ReactNode; n?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '-4% 0px' });
  return (
    <div ref={ref} className="relative overflow-hidden">
      {children}
      <div className="absolute inset-0 pointer-events-none z-20 flex">
        {Array.from({ length: n }).map((_, i) => (
          <motion.div key={i}
            className="flex-1 bg-[var(--bg)] origin-top"
            initial={{ scaleY: 1 }}
            animate={inView
              ? { scaleY: 0, transition: { duration: 0.55, delay: (n - 1 - i) * 0.07, ease: [0.76, 0, 0.24, 1] } }
              : { scaleY: 1 }}
          />
        ))}
      </div>
    </div>
  );
}

/* 5. CurveDivider — SVG quadratic Bezier path animation (from transcript curve section) */
function CurveDivider({ fill = 'var(--surface)' }: { fill?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: '0px' });
  const [w, setW] = useState(1440);
  useEffect(() => {
    const upd = () => setW(window.innerWidth);
    upd();
    window.addEventListener('resize', upd);
    return () => window.removeEventListener('resize', upd);
  }, []);
  /* control point high → flat as section enters (the "curve reset" from transcript) */
  const dInitial = `M 0 70 Q ${w / 2} 0 ${w} 70 L ${w} 80 L 0 80 Z`;
  const dEnter   = `M 0 70 Q ${w / 2} 80 ${w} 70 L ${w} 80 L 0 80 Z`;
  return (
    <div ref={ref} className="relative -mt-px overflow-hidden" style={{ height: 80 }}>
      <svg viewBox={`0 0 ${w} 80`} preserveAspectRatio="none"
        className="absolute inset-0 w-full h-full">
        <motion.path
          fill={fill}
          initial={{ d: dInitial }}
          animate={inView ? { d: dEnter } : { d: dInitial }}
          transition={{ duration: 1.5, ease: [0.76, 0, 0.24, 1] }}
        />
      </svg>
    </div>
  );
}

/* 6. SectionIndicator — dynamic route/section label with AnimatePresence mode=wait
      directly from the "page index indicator + text animation" in transcript */
function SectionIndicator({ label }: { label: string }) {
  return (
    <div className="fixed bottom-7 left-1/2 -translate-x-1/2 z-50 pointer-events-none">
      <AnimatePresence mode="wait">
        <motion.div key={label}
          className="px-4 py-1.5 rounded-[var(--radius-pill)] frosted border border-[var(--border-bright)] text-[11px] text-[var(--muted2)] font-[family-name:var(--font-mono)] tracking-wider"
          {...anim({
            initial: { opacity: 0, y: 10 },
            enter:   { opacity: 1, y: 0 },
            exit:    { opacity: 0, y: -10 },
          })}
          transition={{ duration: 0.28, ease: [0.76, 0, 0.24, 1] }}>
          {label}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* 7. HeroAgentCard — auto-running terminal animation, no video */
function HeroVideoCard() {
  const [events,  setEvents]  = useState<typeof AGENT_EVENTS>([]);
  const [running, setRunning] = useState(false);
  const [scanned, setScanned] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const feedRef  = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const runCycle = () => {
      setEvents([]); setScanned(0); setRunning(true);
      let i = 0, count = 0;
      timerRef.current = setInterval(() => {
        if (i >= AGENT_EVENTS.length) {
          clearInterval(timerRef.current); setRunning(false);
          setTimeout(runCycle, 2800);
          return;
        }
        const ev = AGENT_EVENTS[i];
        setEvents(p => [...p, ev]);
        if (ev.type === 'scan') count = Math.min(count + Math.floor(Math.random() * 90 + 55), 627);
        setScanned(count);
        if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
        i++;
      }, 270);
    };
    const t = setTimeout(runCycle, 700);
    return () => { clearTimeout(t); clearInterval(timerRef.current); };
  }, []);

  const hasVerified = events.some(e => e.type === 'verify');
  const hasMatch    = events.some(e => e.type === 'match');

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgb(5,5,6)' }}>

      {/* subtle dot-grid texture */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.028) 1px, transparent 1px)',
        backgroundSize: '28px 28px' }} />

      {/* ── Agent terminal card ── */}
      <motion.div
        initial={{ opacity: 0, x: 60 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 1.0, delay: 0.5, ease: [0.76, 0, 0.24, 1] }}
        style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)',
          width: '60%', maxWidth: 840,
          background: 'rgb(10,10,14)',
          borderRadius: '24px 0 0 24px',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRight: 'none',
          boxShadow: '-40px 0 100px rgba(0,0,0,0.9)',
          overflow: 'hidden', height: 540, zIndex: 4 }}>

        {/* Chrome header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(255,255,255,0.02)' }}>
          <div style={{ display: 'flex', gap: 5 }}>
            {(['#ff5f57','#ffbd2e','#28c840'] as const).map(c => (
              <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
            ))}
          </div>
          <span style={{ flex: 1, textAlign: 'center', fontSize: 11, letterSpacing: '0.02em',
            color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)' }}>
            jobreach · mission-runner · live
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%',
              background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981',
              fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>ACTIVE</span>
          </div>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', height: 'calc(100% - 40px)' }}>

          {/* LEFT: orb + stats */}
          <div style={{ width: 220, flexShrink: 0, borderRight: '1px solid rgba(255,255,255,0.07)',
            padding: '24px 18px', display: 'flex', flexDirection: 'column' }}>

            {/* Orb */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
              <div style={{ position: 'relative', width: 110, height: 110 }}>
                {[0, 0.55, 1.1].map((d, i) => (
                  <div key={i} style={{ position: 'absolute', inset: 0, borderRadius: '50%',
                    border: `1px solid ${running ? 'rgba(94,198,255,0.22)' : 'rgba(255,255,255,0.06)'}`,
                    animation: running ? `pulse-ring 2.6s ease-out ${d}s infinite` : 'none' }} />
                ))}
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', overflow: 'hidden',
                  animation: running ? 'radar-sweep 3.5s linear infinite' : 'none' }}>
                  <div style={{ position: 'absolute', inset: 0, borderRadius: '50%',
                    background: running
                      ? 'conic-gradient(from 0deg, transparent 260deg, rgba(94,198,255,0.14) 360deg)'
                      : 'transparent' }} />
                </div>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 13, height: 13, borderRadius: '50%', transition: 'all 0.7s',
                    background: running ? '#5ec6ff' : '#2a2a30',
                    boxShadow: running ? '0 0 24px 6px rgba(94,198,255,0.55)' : 'none' }} />
                </div>
                <div style={{ position: 'absolute', bottom: -24, left: 0, right: 0, textAlign: 'center',
                  fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.16em',
                  color: running ? '#5ec6ff' : '#3a3a42' }}>
                  {running ? 'SCANNING' : 'READY'}
                </div>
              </div>
            </div>

            {/* Big number */}
            <div style={{ textAlign: 'center', marginBottom: 20, marginTop: 6 }}>
              <div style={{ fontSize: 44, fontWeight: 800, color: 'rgba(255,255,255,0.92)',
                lineHeight: 1, letterSpacing: '-0.04em' }}>
                {scanned ? scanned.toLocaleString() : '—'}
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', marginTop: 4 }}>roles scanned</div>
              {hasMatch && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', letterSpacing: '-0.02em' }}>
                    B · 4.3/5
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', marginTop: 2 }}>top match grade</div>
                </motion.div>
              )}
            </div>

            {/* Stats */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 14,
              display: 'flex', flexDirection: 'column', gap: 12, marginTop: 'auto' }}>
              {[
                { label: 'Scanned',   val: scanned ? scanned.toLocaleString() : '—' },
                { label: 'Verified',  val: hasVerified ? '60' : '—' },
                { label: 'Top match', val: hasMatch ? 'B · 4.3/5' : '—' },
                { label: 'Events',    val: String(events.length) },
              ].map(row => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.38)', fontFamily: 'var(--font-mono)' }}>{row.label}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.82)',
                    fontFamily: 'var(--font-mono)' }}>{row.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT: event feed */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', padding: '10px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.07)',
              background: 'rgba(255,255,255,0.015)' }}>
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)',
                letterSpacing: '0.12em' }}>AGENT · LIVE FEED</span>
              {running && (
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="animate-pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#06b6d4' }} />
                  <span style={{ fontSize: 10, color: '#06b6d4', fontFamily: 'var(--font-mono)', letterSpacing: '0.12em' }}>LIVE</span>
                </div>
              )}
            </div>

            <div ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: '14px 16px',
              display: 'flex', flexDirection: 'column', gap: 10 }}>
              {events.length === 0 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.18)', fontFamily: 'var(--font-mono)' }}>
                    Initializing agent...
                  </span>
                </div>
              )}
              <AnimatePresence>
                {events.map((ev, i) => {
                  const meta = EVENT_META[ev.type];
                  return (
                    <motion.div key={ev.id}
                      initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.22 }}
                      style={{ display: 'flex', alignItems: 'baseline', gap: 10,
                        fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      <span style={{ color: 'rgba(255,255,255,0.22)', width: 24, flexShrink: 0, textAlign: 'right' }}>
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span style={{ padding: '1.5px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700, flexShrink: 0,
                        color: meta.color, background: `${meta.color}18` }}>
                        {meta.label}
                      </span>
                      <span style={{ color: 'rgba(255,255,255,0.65)', flex: 1, lineHeight: 1.5 }}>{ev.text}</span>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {running && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ color: 'rgba(255,255,255,0.22)', width: 24, textAlign: 'right',
                    fontFamily: 'var(--font-mono)' }}>›</span>
                  <span style={{ display: 'inline-block', width: 8, height: 14, background: 'rgba(255,255,255,0.5)',
                    animation: 'blink 1s step-end infinite' }} />
                </div>
              )}
            </div>
          </div>
        </div>


      </motion.div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────
   DATA CONSTANTS
   ───────────────────────────────────────────────────────── */
const EMAIL        = "mailto:kandadamukesh8@gmail.com";
const GITLAB_URL   = "https://gitlab.com/mukeshkumar-kanda";
const LINKEDIN_URL = "https://www.linkedin.com/in/mukesh-gen-ai/";
const RESUME_URL   = "/mukesh-resume.docx";
const APP_HREF     = "/signup";

function GitLabIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M22.65 14.39 12 22.13 1.35 14.39a.84.84 0 0 1-.3-.94l1.22-3.78 2.44-7.51A.42.42 0 0 1 4.82 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.49h8.1l2.44-7.51A.42.42 0 0 1 18.6 2a.43.43 0 0 1 .58 0 .42.42 0 0 1 .11.18l2.44 7.52L23 13.45a.84.84 0 0 1-.35.94z" />
    </svg>
  );
}
function LinkedinIcon({ style }: { style?: React.CSSProperties }) {
  return (
    <svg style={style} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14zM8.34 17V10.3H6.12V17h2.22zM7.23 9.36a1.29 1.29 0 1 0 0-2.58 1.29 1.29 0 0 0 0 2.58zM18 17v-3.67c0-1.96-.42-3.47-2.71-3.47a2.38 2.38 0 0 0-2.14 1.18h-.03V10.3H10.9V17h2.22v-3.32c0-.87.16-1.72 1.25-1.72 1.07 0 1.08 1 1.08 1.78V17H18z" />
    </svg>
  );
}

const NAV_LINKS = [
  { label: "See it work", href: "demo" },
  { label: "How it works", href: "how" },
  { label: "Features", href: "features" },
  { label: "About", href: "about" },
];

const SECTION_LABELS: Record<string, string> = {
  top:       "Hero",
  demo:      "Live Demo",
  how:       "How it works",
  features:  "Capabilities",
  arch:      "Architecture",
  stats:     "Quality",
  about:     "About",
};

const AGENT_EVENTS = [
  { id: 0,  type: "scan",     text: "Initializing mission · target: Senior AI Engineer roles" },
  { id: 1,  type: "scan",     text: "Ingesting LinkedIn · 214 postings indexed" },
  { id: 2,  type: "scan",     text: "Ingesting Greenhouse · 89 postings indexed" },
  { id: 3,  type: "scan",     text: "Ingesting Lever · 101 postings indexed" },
  { id: 4,  type: "scan",     text: "Ingesting Workday · 223 postings indexed" },
  { id: 5,  type: "filter",   text: "Conservative filter applied · 627 liveness-verified candidates" },
  { id: 6,  type: "verify",   text: "Dead links removed · reposted roles excluded · 60 live roles" },
  { id: 7,  type: "score",    text: "Scoring Staff AI Engineer @ Cohere…" },
  { id: 8,  type: "score",    text: "Score: B- · 3.6/5 · Skills↑  Culture↓  Growth↑" },
  { id: 9,  type: "score",    text: "Scoring Agentic AI Engineer @ Eigen Labs…" },
  { id: 10, type: "match",    text: "MATCH · Agentic AI Engineer @ Eigen Labs · B · 4.3/5" },
  { id: 11, type: "research", text: "Researching Eigen Labs · 12 signals: funding, stack, culture, news" },
  { id: 12, type: "tailor",   text: "Tailoring resume · emphasizing agent architecture & async queues" },
  { id: 13, type: "tailor",   text: "Writing cover letter · citing EigenDA distributed systems focus" },
  { id: 14, type: "track",    text: "Application logged · Kanban updated · mission complete ✓" },
];

const EVENT_META: Record<string, { color: string; label: string }> = {
  scan:     { color: "#5ec6ff", label: "SCAN" },
  filter:   { color: "#facc15", label: "FILT" },
  verify:   { color: "#fb923c", label: "VRFY" },
  score:    { color: "#8b6bff", label: "SCOR" },
  match:    { color: "#34d399", label: "MTCH" },
  research: { color: "#5ec6ff", label: "RSRC" },
  tailor:   { color: "#2f6bff", label: "TLOR" },
  track:    { color: "#4ade80", label: "TRAK" },
};

const FEATURES = [
  { icon: Search,     title: "Mission Scanning & Matching",    desc: "8+ job sources scanned per mission. Every result graded, not just listed.", accent: "#5ec6ff" },
  { icon: Star,       title: "6-Dimension Scoring Engine",     desc: "Skills, Culture, Growth, Location, Comp, and Fit — weighted and graded A–F per role.", accent: "#8b6bff" },
  { icon: Activity,   title: "Company Research & Intelligence",desc: "12+ signals per company: funding stage, team size, tech stack, news sentiment.", accent: "#2ed573" },
  { icon: FileText,   title: "Document Studio",                desc: "Tailored resumes and cover letters generated per role — contextually written, not templated.", accent: "#2f6bff" },
  { icon: LayoutGrid, title: "Application Tracker",            desc: "Kanban board auto-populated as the agent works. Zero manual entry required.", accent: "#ff6a2b" },
];

const LIFECYCLE = [
  { n: "01", label: "Scan",     desc: "8 sources" },
  { n: "02", label: "Filter",   desc: "Verified only" },
  { n: "03", label: "Verify",   desc: "Liveness check" },
  { n: "04", label: "Score",    desc: "6D · A–F" },
  { n: "05", label: "Research", desc: "12+ signals" },
  { n: "06", label: "Tailor",   desc: "Per-role docs" },
  { n: "07", label: "Track",    desc: "Auto Kanban" },
];

const ARCH_LAYERS = [
  { label: "Frontend",  tech: "Next.js · React · SSE streaming",       color: "#2f6bff" },
  { label: "API",       tech: "FastAPI · WebSockets · Auth",           color: "#8b6bff" },
  { label: "Queue",     tech: "Celery · Redis · Beat scheduler",       color: "#f59e0b" },
  { label: "AI",        tech: "Llama 3.3-70B · 3.1-8B via NVIDIA NIM", color: "#5ec6ff" },
  { label: "Ingestion", tech: "8 Sources · Playwright · requests",     color: "#34d399" },
  { label: "Storage",   tech: "Supabase · PostgreSQL · pgvector",      color: "#fb923c" },
];

const ARCH_POINTS = [
  { icon: Layers,    text: "Distributed Celery + Redis queue — async task orchestration at scale" },
  { icon: Cpu,       text: "Multi-model routing — Llama 3.3-70B for scoring & research, 3.1-8B for parsing & tailoring via NVIDIA NIM" },
  { icon: Activity,  text: "Real-time SSE streaming — 89 live events per session, zero polling" },
  { icon: Database,  text: "8-source ingestion with conservative liveness-verified filtering" },
  { icon: GitBranch, text: "Full-stack solo — Next.js · FastAPI · Supabase · Vercel · Redis" },
];

const SUPPORTING_STATS = [
  { val: "627",  label: "jobs scanned / mission" },
  { val: "8",    label: "job sources ingested" },
  { val: "35K+", label: "companies searchable" },
  { val: "70B",  label: "param scoring model" },
  { val: "89",   label: "live events / session" },
];

const TECH_BADGES = ["NVIDIA NIM", "Llama 3.3-70B", "Supabase", "Vercel", "Celery · Redis"];

const JOB_TICKER = [
  { co: "Google",    domain: "google.com",    role: "Senior ML Engineer",            ago: 2,  color: "#4285F4", fb: "G"   },
  { co: "Tesla",     domain: "tesla.com",     role: "AI Software Engineer",          ago: 5,  color: "#CC0000", fb: "T"   },
  { co: "IBM",       domain: "ibm.com",       role: "Data & AI Architect",           ago: 7,  color: "#1F70C1", fb: "IBM" },
  { co: "xAI",       domain: "x.ai",          role: "Research Engineer, Grok",       ago: 9,  color: "#aaaaaa", fb: "xAI" },
  { co: "Nvidia",    domain: "nvidia.com",    role: "Deep Learning Infra Engineer",  ago: 11, color: "#76B900", fb: "NV"  },
  { co: "Meta",      domain: "meta.com",      role: "Staff Software Engineer, AI",   ago: 13, color: "#0866FF", fb: "M"   },
  { co: "Microsoft", domain: "microsoft.com", role: "Principal AI Engineer",         ago: 16, color: "#00A4EF", fb: "MS"  },
  { co: "Anthropic", domain: "anthropic.com", role: "Member of Technical Staff",     ago: 18, color: "#CC785C", fb: "AN"  },
  { co: "Stripe",    domain: "stripe.com",    role: "Backend Eng, Payments AI",      ago: 21, color: "#635BFF", fb: "S"   },
  { co: "OpenAI",    domain: "openai.com",    role: "Applied AI Engineer",           ago: 24, color: "#10A37F", fb: "OAI" },
  { co: "Apple",     domain: "apple.com",     role: "ML Platform Engineer",          ago: 27, color: "#888888", fb: "A"   },
  { co: "Cohere",    domain: "cohere.com",    role: "Fullstack AI Engineer",         ago: 30, color: "#D4A017", fb: "CO"  },
];

/* keyframes */
const KF = `
@keyframes pulse-ring { 0% { transform: scale(1); opacity: .5; } 100% { transform: scale(2.2); opacity: 0; } }
@keyframes radar-sweep { from { transform: rotate(0); } to { transform: rotate(360deg); } }
@keyframes cursor-blink { 0%,100% { opacity: 1; } 50% { opacity: 0; } }
@keyframes hero-glow-pulse { 0%,100% { opacity: .04; } 50% { opacity: .09; } }
`;

/* ═══════════════════════════════════════════════════════════ */

export function LandingPage() {
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [events,       setEvents]       = useState<typeof AGENT_EVENTS>([]);
  const [running,      setRunning]      = useState(false);
  const [done,         setDone]         = useState(false);
  const [scanned,      setScanned]      = useState(0);
  const [activeSection, setActiveSection] = useState("top");

  const feedRef  = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /* ── hero parallax (perspective scale + slide on scroll) ── */
  const heroRef = useRef<HTMLElement>(null);
  const { scrollYProgress: heroProgress } = useScroll({
    target: heroRef,
    offset: ['start start', 'end start'],
  });
  const heroY       = useTransform(heroProgress, [0, 1], ['0%', '-7%']);
  const heroScale   = useTransform(heroProgress, [0, 1], [1, 0.96]);
  const heroOpacity = useTransform(heroProgress, [0, 0.75], [1, 0]);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  }

  function startDemo() {
    if (running) return;
    setEvents([]); setScanned(0); setDone(false); setRunning(true);
    let i = 0, count = 0;
    timerRef.current = setInterval(() => {
      if (i >= AGENT_EVENTS.length) {
        clearInterval(timerRef.current!);
        setRunning(false); setDone(true);
        return;
      }
      const ev = AGENT_EVENTS[i];
      setEvents((p) => [...p, ev]);
      if (ev.type === "scan") count = Math.min(count + Math.floor(Math.random() * 90 + 55), 627);
      setScanned(count);
      i++;
    }, 660);
  }

  function resetDemo() {
    if (timerRef.current) clearInterval(timerRef.current);
    setEvents([]); setScanned(0); setDone(false); setRunning(false);
  }

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);
  useEffect(() => { if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight; }, [events]);

  /* ── section tracker for indicator ── */
  useEffect(() => {
    const ids = ['top', 'demo', 'how', 'features', 'arch', 'stats', 'about'];
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => { if (e.isIntersecting) setActiveSection(e.target.id); });
      },
      { threshold: 0.35 },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const hasMatch    = events.some((e) => e.type === "match");
  const hasVerified = events.some((e) => e.type === "verify");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KF }} />

      <div className="landing-root min-h-screen bg-[var(--bg)] text-[var(--muted2)] antialiased overflow-x-hidden selection:bg-[var(--cyan)]/20 selection:text-[var(--cyan)]">

        {/* ═══ NAVBAR ═══ */}
        <nav className="fixed top-0 inset-x-0 z-50 border-b border-[var(--border)] frosted">
          <div className="max-w-6xl mx-auto px-5 flex items-center justify-between h-14">
            <button onClick={() => scrollTo("top")} className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-md bg-prismatic flex items-center justify-center font-display font-bold text-[13px] text-[#050506]">J</div>
              <span className="font-display font-bold text-sm tracking-tight text-[var(--text)]">
                JobReach<span className="text-prismatic"> AI</span>
              </span>
            </button>

            <div className="hidden md:flex items-center gap-7">
              {NAV_LINKS.map((l) => (
                <button key={l.href} onClick={() => scrollTo(l.href)}
                  className="text-[13px] text-[var(--muted2)] hover:text-[var(--text)] transition-colors">
                  {l.label}
                </button>
              ))}
            </div>


            <button className="md:hidden text-[var(--muted2)] hover:text-[var(--text)] transition-colors"
              onClick={() => setMenuOpen((o) => !o)}>
              {menuOpen ? <X style={{ width: 20, height: 20 }} /> : <Menu style={{ width: 20, height: 20 }} />}
            </button>
          </div>

          {menuOpen && (
            <div className="md:hidden bg-[var(--surface)] border-t border-[var(--border)] px-5 py-5 flex flex-col gap-5">
              {NAV_LINKS.map((l) => (
                <button key={l.href} onClick={() => scrollTo(l.href)}
                  className="text-sm text-[var(--muted2)] hover:text-[var(--text)] text-left transition-colors">
                  {l.label}
                </button>
              ))}
            </div>
          )}
        </nav>

        {/* ═══ HERO — full-viewport video + text overlay ═══ */}
        <section id="top" ref={heroRef}
          style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', background: 'var(--bg)' }}>

          {/* video fills entire section */}
          <HeroVideoCard />


          {/* bottom fade into next section */}
          <div style={{ pointerEvents: 'none', position: 'absolute', bottom: 0, left: 0, right: 0, height: '160px',
            background: 'linear-gradient(to bottom, transparent, var(--bg))', zIndex: 2 }} />

          {/* ── TEXT OVERLAY — upper left ── */}
          <div
            style={{ position: 'absolute', inset: 0, zIndex: 3,
              display: 'flex', alignItems: 'flex-start', paddingTop: '7rem' }}>
            <div style={{ width: '72%', minWidth: 480, maxWidth: 1000, paddingLeft: '3.5rem' }}>

              <motion.p
                className="font-[family-name:var(--font-mono)] text-xs text-[var(--cyan)] uppercase tracking-[0.18em] mb-5"
                {...anim({ initial: { opacity: 0, y: 14 }, enter: { opacity: 1, y: 0 } })}
                transition={{ duration: 0.55, delay: 0.15, ease: [0.76, 0, 0.24, 1] }}>
                Built solo by Mukesh · Full-stack + AI Engineer
              </motion.p>

              {/* headline — force "job search." onto its own line with a break before it */}
              <h1 className="font-display text-[2.6rem] sm:text-[3.6rem] lg:text-[4.6rem] font-bold leading-[1.06] tracking-[-0.03em] mb-6">
                <span className="block overflow-hidden">
                  <motion.span className="block text-[var(--text)]"
                    initial={{ y: '110%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }}
                    transition={{ duration: 0.72, delay: 0.22, ease: [0.76, 0, 0.24, 1] }}>
                    An autonomous AI agent
                  </motion.span>
                </span>
                <span className="block overflow-hidden">
                  <motion.span className="block text-[var(--text)]"
                    initial={{ y: '110%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }}
                    transition={{ duration: 0.72, delay: 0.32, ease: [0.76, 0, 0.24, 1] }}>
                    that runs your entire
                  </motion.span>
                </span>
                <span className="block overflow-hidden">
                  <motion.span className="block text-[var(--cyan)]"
                    initial={{ y: '110%', opacity: 0 }} animate={{ y: '0%', opacity: 1 }}
                    transition={{ duration: 0.72, delay: 0.42, ease: [0.76, 0, 0.24, 1] }}>
                    job search.
                  </motion.span>
                </span>
              </h1>

              <motion.p className="text-[16px] text-[var(--muted2)] leading-relaxed mb-8 max-w-[440px]"
                {...anim({ initial: { opacity: 0, y: 18 }, enter: { opacity: 1, y: 0 } })}
                transition={{ duration: 0.6, delay: 0.55, ease: [0.76, 0, 0.24, 1] }}>
                Not a chatbot you talk to — an agent that scans, scores, researches, and tailors, while you watch it work.
              </motion.p>

              <motion.div className="flex flex-wrap items-center gap-4"
                {...anim({ initial: { opacity: 0, y: 14 }, enter: { opacity: 1, y: 0 } })}
                transition={{ duration: 0.55, delay: 0.68, ease: [0.76, 0, 0.24, 1] }}>

                {/* Primary CTA — Huly-style pill with orange ray beneath */}
                <TiltCard intensity={8} glare className="inline-flex rounded-[var(--radius-pill)]">
                  <div style={{ position: 'relative', display: 'inline-flex' }}>
                    <a href={APP_HREF}
                      className="relative inline-flex items-center gap-2 px-6 py-3 rounded-[var(--radius-pill)] text-sm font-semibold text-white uppercase"
                      style={{
                        background: 'linear-gradient(160deg, rgba(40,40,44,1) 0%, rgba(20,20,24,1) 100%)',
                        border: '1px solid rgba(255,255,255,0.12)',
                        letterSpacing: '0.07em',
                        boxShadow: [
                          '0 1px 0 rgba(255,255,255,0.07) inset',          /* top sheen */
                          '0 6px 20px rgba(255,110,0,0.55)',                /* mid orange glow */
                          '0 12px 40px rgba(255,80,0,0.35)',               /* wide ambient */
                          '0 2px 8px rgba(255,150,30,0.7)',                /* tight bright core */
                        ].join(', '),
                      }}>
                      Open the live app <ArrowRight style={{ width: 15, height: 15 }} />
                    </a>
                  </div>
                </TiltCard>

                <button onClick={() => scrollTo("demo")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-pill)] border border-white/25 text-sm text-white/80 hover:border-white/50 hover:text-white transition-all"
                  style={{ backdropFilter: 'blur(8px)', background: 'rgba(255,255,255,0.05)' }}>
                  Watch it work
                </button>

              </motion.div>

            </div>
          </div>

        </section>

        {/* SVG curve divider (quadratic Bezier from transcript) */}
        <CurveDivider fill="var(--surface)" />

        {/* ═══ JOB TICKER ═══ */}
        <div className="relative w-full flex items-stretch" style={{ background: 'var(--surface)', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>

          {/* pinned LIVE label */}
          <div className="shrink-0 flex flex-col items-center justify-center gap-2 px-6 border-r border-[var(--border)]" style={{ background: 'var(--surface)', zIndex: 20, minWidth: 80 }}>
            <div className="relative flex items-center justify-center w-2.5 h-2.5">
              <div className="absolute w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping opacity-50" />
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <span className="font-[family-name:var(--font-mono)] text-[9px] uppercase tracking-[0.16em] text-[var(--muted)] whitespace-nowrap">Live</span>
          </div>

          {/* scrolling strip */}
          <div className="relative flex-1 overflow-hidden" style={{ padding: '20px 0' }}>
            {/* edge fades */}
            <div className="pointer-events-none absolute inset-y-0 left-0 w-24 z-10" style={{ background: 'linear-gradient(to right, var(--surface), transparent)' }} />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-24 z-10" style={{ background: 'linear-gradient(to left, var(--surface), transparent)' }} />

            <Marquee pauseOnHover repeat={3} className="[--gap:12px] [--duration:90s]">
              {JOB_TICKER.map((j) => (
                <div key={j.co + j.role}
                  className="inline-flex items-center gap-4 px-5 py-4 rounded-2xl border border-[var(--border-bright)] shrink-0 mx-2 transition-colors cursor-default hover:border-white/25"
                  style={{ background: 'rgba(255,255,255,0.04)', minWidth: 240, boxShadow: '0 2px 16px rgba(0,0,0,0.3)' }}>
                  <div className="w-12 h-12 rounded-xl shrink-0 overflow-hidden flex items-center justify-center"
                    style={{ background: j.color + '20', border: `1px solid ${j.color}40` }}>
                    <img src={`https://www.google.com/s2/favicons?domain=https://${j.domain}&sz=128`}
                      alt={j.co} width={48} height={48} className="w-8 h-8 object-contain"
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[15px] font-bold text-[var(--text)] leading-none">{j.co}</span>
                      <span className="text-[11px] text-[var(--muted)] font-[family-name:var(--font-mono)] shrink-0">· {j.ago}m ago</span>
                    </div>
                    <div className="text-[13px] text-[var(--muted2)] whitespace-nowrap">{j.role}</div>
                  </div>
                </div>
              ))}
            </Marquee>
          </div>

        </div>

        {/* ═══ LIVE DEMO ═══ */}
        <section id="demo" className="py-section px-5 bg-[var(--surface)] border-b border-[var(--border)]">
          <div className="max-w-6xl mx-auto">
            <div className="mb-12 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
              <FadeUp>
                <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--cyan)] uppercase tracking-[0.2em] mb-4">Live Demo</p>
                <TextReveal as="h2" text="Watch the agent work."
                  delay={0} stagger={0.03} duration={0.75}
                  className="font-display text-4xl md:text-5xl font-bold text-[var(--text)] leading-[1.02] tracking-[-0.02em]" />
                <p className="mt-4 text-[var(--muted2)] text-[17px] max-w-md leading-relaxed">
                  Most AI hides the work. JobReach makes the agent&apos;s labor visible — every step, in real time.
                </p>
              </FadeUp>
              <FadeUp delay={0.15} className="flex items-center gap-3 flex-shrink-0">
                {!running && !done && (
                  <button onClick={startDemo}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-pill)] bg-prismatic text-[#050506] font-semibold text-sm shadow-[var(--glow-blue)] hover:brightness-105 transition-all">
                    <Zap style={{ width: 16, height: 16 }} /> Run the agent
                  </button>
                )}
                {running && (
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-pill)] border border-[var(--cyan)]/25 text-[var(--cyan)] text-sm font-[family-name:var(--font-mono)]">
                    <div className="w-2 h-2 rounded-full bg-[var(--cyan)] animate-pulse" /> Agent running…
                  </div>
                )}
                {done && (
                  <div className="flex items-center gap-3">
                    <button onClick={resetDemo}
                      className="text-xs text-[var(--subtle)] hover:text-[var(--muted2)] font-[family-name:var(--font-mono)] underline underline-offset-2">
                      Run again
                    </button>
                    <Link href={APP_HREF}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-pill)] bg-prismatic text-[#050506] font-semibold text-sm shadow-[var(--glow-blue)] hover:brightness-105 transition-all">
                      Open the live app <ArrowRight style={{ width: 15, height: 15 }} />
                    </Link>
                  </div>
                )}
              </FadeUp>
            </div>

            <FadeUp delay={0.1} className="grid lg:grid-cols-[260px_1fr] gap-5">
              {/* orb + counters */}
              <div className="rounded-[var(--radius-xl)] bg-[var(--card)] p-6 flex flex-col gap-6 elevation-product">
                <div className="flex justify-center pt-2">
                  <div className="relative w-28 h-28">
                    {[0, 0.55, 1.1].map((d, i) => (
                      <div key={i} className="absolute inset-0 rounded-full border"
                        style={{ borderColor: running ? "rgba(94,198,255,0.22)" : "rgba(255,255,255,0.06)",
                          animation: running ? `pulse-ring 2.6s ease-out ${d}s infinite` : "none" }} />
                    ))}
                    <div className="absolute inset-0 rounded-full overflow-hidden"
                      style={{ animation: running ? "radar-sweep 3.5s linear infinite" : "none" }}>
                      <div className="absolute inset-0 rounded-full"
                        style={{ background: running ? "conic-gradient(from 0deg, transparent 260deg, rgba(94,198,255,0.14) 360deg)" : "transparent" }} />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full transition-all duration-700"
                        style={{ background: running || done ? "#5ec6ff" : "#2a2a30",
                          boxShadow: running ? "0 0 24px 6px rgba(94,198,255,0.55)" : done ? "0 0 14px 4px rgba(94,198,255,0.3)" : "none" }} />
                    </div>
                    <div className="absolute -bottom-6 inset-x-0 text-center text-[10px] font-[family-name:var(--font-mono)] tracking-widest"
                      style={{ color: running ? "#5ec6ff" : done ? "#34d399" : "#4a4a52" }}>
                      {running ? "SCANNING" : done ? "COMPLETE" : "READY"}
                    </div>
                  </div>
                </div>
                <div className="border-t border-[var(--border)] pt-5 space-y-4 mt-2">
                  {[
                    { label: "Scanned",   val: scanned ? scanned.toLocaleString() : "—", hi: false },
                    { label: "Verified",  val: hasVerified ? "60" : "—",                 hi: false },
                    { label: "Top match", val: hasMatch ? "B · 4.3/5" : "—",            hi: hasMatch },
                    { label: "Events",    val: String(events.length),                    hi: false },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-baseline">
                      <span className="text-xs text-[var(--muted)] font-[family-name:var(--font-mono)]">{row.label}</span>
                      <span className={`font-display font-semibold text-sm ${row.hi ? "text-emerald-400" : "text-[var(--text)]"}`}>{row.val}</span>
                    </div>
                  ))}
                </div>
                {hasMatch && (
                  <motion.div className="rounded-[var(--radius-lg)] border border-emerald-400/20 bg-emerald-400/[0.04] p-3.5"
                    {...anim({ initial: { opacity: 0, y: 8 }, enter: { opacity: 1, y: 0 } })}
                    transition={{ duration: 0.3 }}>
                    <div className="text-[10px] text-emerald-400 font-[family-name:var(--font-mono)] uppercase tracking-wider mb-1.5">Match found</div>
                    <div className="text-sm font-semibold text-[var(--text)] leading-snug">Agentic AI Engineer</div>
                    <div className="text-xs text-[var(--muted2)] mb-2">Eigen Labs</div>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-400 text-xs font-[family-name:var(--font-mono)] font-bold">B</span>
                      <span className="text-sm font-[family-name:var(--font-mono)] text-[var(--text)]">4.3 / 5</span>
                    </div>
                  </motion.div>
                )}
              </div>

              {/* event feed — AnimatePresence on items (from transcript) */}
              <div className="rounded-[var(--radius-xl)] bg-[var(--card)] overflow-hidden flex flex-col elevation-product">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-[var(--border)] bg-[var(--surface)] flex-shrink-0">
                  <Terminal className="text-[var(--muted)]" style={{ width: 14, height: 14 }} />
                  <span className="text-xs text-[var(--muted)] font-[family-name:var(--font-mono)]">agent · event stream</span>
                  {running && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[var(--cyan)] animate-pulse" />
                      <span className="text-[10px] text-[var(--cyan)] font-[family-name:var(--font-mono)] tracking-wider">LIVE</span>
                    </div>
                  )}
                  {done && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <CheckCircle className="text-emerald-400" style={{ width: 13, height: 13 }} />
                      <span className="text-[10px] text-emerald-400 font-[family-name:var(--font-mono)] tracking-wider">DONE · {events.length} events</span>
                    </div>
                  )}
                </div>
                <div ref={feedRef} className="feed-scroll flex-1 overflow-y-auto p-4 space-y-2 min-h-[360px] max-h-[440px]">
                  {events.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-16">
                      <Terminal className="text-[var(--subtle)]" style={{ width: 32, height: 32 }} />
                      <p className="text-sm text-[var(--muted)] font-[family-name:var(--font-mono)]">Press &quot;Run the agent&quot; to start the mission.</p>
                      <p className="text-xs text-[var(--subtle)]">No signup required · demo mode</p>
                    </div>
                  )}
                  {/* AnimatePresence on each event item (from transcript) */}
                  <AnimatePresence>
                    {events.map((ev, i) => {
                      const meta = EVENT_META[ev.type];
                      return (
                        <motion.div key={ev.id}
                          className="flex items-baseline gap-3 font-[family-name:var(--font-mono)] text-xs"
                          {...anim({
                            initial: { opacity: 0, y: 6 },
                            enter:   { opacity: 1, y: 0 },
                          })}
                          transition={{ duration: 0.25 }}>
                          <span className="text-[var(--subtle)] w-8 text-right flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 leading-normal"
                            style={{ color: meta.color, background: `${meta.color}16` }}>{meta.label}</span>
                          <span className="text-[var(--muted2)] leading-relaxed">{ev.text}</span>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>
                  {running && (
                    <div className="flex items-baseline gap-3 font-[family-name:var(--font-mono)] text-xs">
                      <span className="text-[var(--subtle)] w-8 text-right">{String(events.length + 1).padStart(2, "0")}</span>
                      <span className="text-[var(--cyan)] text-[10px]">▸</span>
                      <span className="text-[var(--muted)]" style={{ animation: "cursor-blink 1s step-end infinite" }}>█</span>
                    </div>
                  )}
                </div>
              </div>
            </FadeUp>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs text-[var(--muted)] font-[family-name:var(--font-mono)]">
                Most AI hides the work — JobReach makes the agent&apos;s labor visible.
              </p>
              <button onClick={() => scrollTo("demo")} className="text-xs text-[var(--muted)] hover:text-[var(--muted2)] transition-colors font-[family-name:var(--font-mono)] underline underline-offset-2">
                Explore the demo — no signup →
              </button>
            </div>
          </div>
        </section>

        {/* SVG curve (dark → light direction) */}
        <CurveDivider fill="var(--bg)" />

        {/* ═══ HOW IT WORKS ═══ */}
        <section id="how" className="py-section px-5">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-stretch gap-10 md:gap-16">

            {/* left — text + CTA */}
            <FadeUp className="flex flex-col justify-center flex-1 min-w-0 py-4">
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--cyan)] uppercase tracking-[0.2em] mb-5">How it works</p>
              <TextReveal as="h2" text="90% Job Search Automation"
                delay={0.05} stagger={0.03} duration={0.75}
                className="font-display text-4xl md:text-[2.8rem] font-bold text-[var(--text)] tracking-[-0.02em] leading-[1.08] mb-5" />
              <p className="text-[17px] text-[var(--muted2)] leading-relaxed mb-8 max-w-[440px]">
                JobReach scans live job boards, scores every role against your profile across six dimensions, rewrites your resume for each fit, fills the application, and logs it to your tracker — all without you lifting a finger.
              </p>
              <TiltCard intensity={8} glare className="inline-flex self-start rounded-[var(--radius-pill)]">
                <a href={APP_HREF}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--radius-pill)] text-sm font-semibold text-white uppercase"
                  style={{
                    background: 'linear-gradient(160deg, rgba(40,40,44,1) 0%, rgba(20,20,24,1) 100%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    letterSpacing: '0.07em',
                    boxShadow: [
                      '0 1px 0 rgba(255,255,255,0.07) inset',
                      '0 6px 20px rgba(255,110,0,0.55)',
                      '0 12px 40px rgba(255,80,0,0.35)',
                      '0 2px 8px rgba(255,150,30,0.7)',
                    ].join(', '),
                  }}>
                  Boost My Job Search <ArrowRight style={{ width: 15, height: 15 }} />
                </a>
              </TiltCard>
            </FadeUp>

            {/* right — video card */}
            <FadeUp delay={0.2} className="flex-[1.1] min-w-0 rounded-3xl overflow-hidden border border-[var(--border)]"
              style={{ boxShadow: '0 0 60px rgba(0,0,0,0.6)', minHeight: 360 }}>
              <video
                src="/automation-demo.mp4"
                autoPlay muted loop playsInline preload="none"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </FadeUp>

          </div>
        </section>

        {/* ═══ FEATURES — staggered fade-up cards ═══ */}
        <section id="features" className="py-section px-5 bg-[var(--surface)] border-y border-[var(--border)]">
          <div className="max-w-6xl mx-auto">
            <FadeUp className="mb-14">
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--cyan)] uppercase tracking-[0.2em] mb-4">Capabilities</p>
              <TextReveal as="h2" text="Five tools. One mission. No manual work."
                delay={0.05} stagger={0.035} duration={0.75}
                className="font-display text-4xl md:text-5xl font-bold text-[var(--text)] max-w-xl leading-[1.02] tracking-[-0.02em]" />
            </FadeUp>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <motion.div key={f.title}
                    className={`group cursor-default rounded-[var(--radius-xl)] border border-[var(--border)] bg-[var(--card)] p-7 elevation-hairline hover:translate-y-[-2px] transition-transform duration-200 ${i === 4 ? "md:col-span-2 lg:col-span-1" : ""}`}
                    initial={{ opacity: 0, y: 28 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: '-8% 0px' }}
                    transition={{ duration: 0.65, delay: i * 0.09, ease: [0.76, 0, 0.24, 1] }}>
                    <div className="w-14 h-14 rounded-[var(--radius-lg)] flex items-center justify-center mb-7 transition-transform duration-200 group-hover:scale-105"
                      style={{ background: `color-mix(in srgb, ${f.accent} 14%, transparent)`, border: `1px solid color-mix(in srgb, ${f.accent} 28%, transparent)` }}>
                      <Icon style={{ width: 24, height: 24, color: f.accent }} />
                    </div>
                    <h3 className="font-display text-lg font-bold text-[var(--text)] mb-3 leading-snug tracking-[-0.4px]">{f.title}</h3>
                    <p className="text-sm text-[var(--muted2)] leading-relaxed">{f.desc}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ═══ ARCHITECTURE — SlideIn left + right ═══ */}
        <section id="arch" className="py-section px-5">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_420px] gap-16 items-start">
            <SlideIn from="left">
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--cyan)] uppercase tracking-[0.2em] mb-4">Architecture</p>
              <TextReveal as="h2" text="This isn't a prompt wrapper."
                delay={0.05} stagger={0.035} duration={0.75}
                className="font-display text-4xl md:text-5xl font-bold text-[var(--text)] leading-[1.02] tracking-[-0.02em] mb-4" />
              <p className="text-[17px] text-[var(--muted2)] mb-10 leading-relaxed max-w-md">
                A distributed, multi-model agent system — the architecture is the product.
              </p>
              <div className="space-y-6">
                {ARCH_POINTS.map((pt, i) => {
                  const Icon = pt.icon;
                  return (
                    <motion.div key={pt.text}
                      className="flex items-start gap-4"
                      initial={{ opacity: 0, x: -28 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: '-8% 0px' }}
                      transition={{ duration: 0.6, delay: i * 0.08, ease: [0.76, 0, 0.24, 1] }}>
                      <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-white/[0.04] border border-[var(--border)] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="text-[var(--cyan)]" style={{ width: 15, height: 15 }} />
                      </div>
                      <p className="text-[15px] text-[var(--muted2)] leading-relaxed">{pt.text}</p>
                    </motion.div>
                  );
                })}
              </div>
            </SlideIn>

            <SlideIn from="right" delay={0.1}>
              <div className="rounded-[var(--radius-xl)] bg-[var(--card)] p-6 elevation-product">
                <div className="text-[10px] text-[var(--muted)] font-[family-name:var(--font-mono)] uppercase tracking-widest mb-5">System layers</div>
                <div className="space-y-1.5">
                  {ARCH_LAYERS.map((l, i, arr) => (
                    <motion.div key={l.label}
                      initial={{ opacity: 0, x: 20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true, margin: '-8% 0px' }}
                      transition={{ duration: 0.5, delay: 0.2 + i * 0.07, ease: [0.76, 0, 0.24, 1] }}>
                      <div className="flex items-center gap-3 py-2.5 px-3.5 rounded-[var(--radius-sm)] border"
                        style={{ borderColor: `${l.color}22`, background: `${l.color}09` }}>
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                        <div className="font-[family-name:var(--font-mono)] font-bold text-[11px] w-20 flex-shrink-0" style={{ color: l.color }}>{l.label}</div>
                        <div className="text-[var(--muted2)] text-[11px] font-[family-name:var(--font-mono)]">{l.tech}</div>
                      </div>
                      {i < arr.length - 1 && <div className="ml-5 w-px h-1.5 bg-[var(--border)]" />}
                    </motion.div>
                  ))}
                </div>
              </div>
            </SlideIn>
          </div>
        </section>

        {/* ═══ STATS ═══ */}
        <section id="stats" className="py-section px-5 bg-[var(--surface)] border-y border-[var(--border)]">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-stretch gap-10 md:gap-16">

            {/* left — text + CTA */}
            <FadeUp className="flex flex-col justify-center flex-1 min-w-0 py-4">
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--cyan)] uppercase tracking-[0.2em] mb-5">Quality first</p>
              <TextReveal as="h2" text="Your Own AI Career Expert"
                delay={0.05} stagger={0.03} duration={0.75}
                className="font-display text-4xl md:text-[2.8rem] font-bold text-[var(--text)] tracking-[-0.02em] leading-[1.08] mb-5" />
              <p className="text-[17px] text-[var(--muted2)] leading-relaxed mb-8 max-w-[440px]">
                Get a personalized job search plan, insights on which skills to sharpen, and how to outshine similar candidates. It&apos;s like having a top-tier career coach in your pocket.
              </p>
              <TiltCard intensity={8} glare className="inline-flex self-start rounded-[var(--radius-pill)]">
                <a href={APP_HREF}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--radius-pill)] text-sm font-semibold text-white uppercase"
                  style={{
                    background: 'linear-gradient(160deg, rgba(40,40,44,1) 0%, rgba(20,20,24,1) 100%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    letterSpacing: '0.07em',
                    boxShadow: [
                      '0 1px 0 rgba(255,255,255,0.07) inset',
                      '0 6px 20px rgba(255,110,0,0.55)',
                      '0 12px 40px rgba(255,80,0,0.35)',
                      '0 2px 8px rgba(255,150,30,0.7)',
                    ].join(', '),
                  }}>
                  Start Matching <ArrowRight style={{ width: 15, height: 15 }} />
                </a>
              </TiltCard>
            </FadeUp>

            {/* right — video */}
            <FadeUp delay={0.2} className="flex-[1.1] min-w-0 rounded-3xl overflow-hidden border border-[var(--border)]"
              style={{ boxShadow: '0 0 60px rgba(0,0,0,0.6)', minHeight: 360 }}>
              <video
                src="/career-expert.mp4"
                autoPlay muted loop playsInline preload="none"
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
              />
            </FadeUp>

          </div>
        </section>

        {/* ═══ ABOUT ═══ */}
        <section id="about" className="py-section px-5">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_320px] gap-14 items-start">
            <SlideIn from="left">
              <p className="font-[family-name:var(--font-mono)] text-[11px] text-[var(--cyan)] uppercase tracking-[0.2em] mb-4">About the builder</p>
              <TextReveal as="h2"
                text="I designed and shipped this entire distributed, multi-model agent system solo — frontend to infra."
                delay={0.05} stagger={0.022} duration={0.72}
                className="font-display text-3xl md:text-[2.5rem] font-bold text-[var(--text)] leading-[1.1] tracking-[-0.02em] mb-6" />
              <FadeUp delay={0.25}>
                <p className="text-[17px] text-[var(--muted2)] leading-relaxed mb-4 max-w-2xl">
                  I&apos;m Mukesh — a full-stack + AI engineer who builds end-to-end systems, not prototypes. JobReach is proof: a production-grade autonomous agent with a distributed queue, multi-model routing, real-time streaming, and a polished frontend — all shipped solo.
                </p>
                <p className="text-[17px] text-[var(--muted2)] leading-relaxed mb-10 max-w-2xl">
                  Here&apos;s what I can build for your team.
                </p>
                <div className="flex flex-wrap items-center gap-4">
                  <a href={EMAIL}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-[var(--radius-pill)] border border-[var(--border-bright)] text-sm text-[var(--text)] hover:border-white/25 hover:bg-white/[0.04] transition-all">
                    <Mail style={{ width: 16, height: 16 }} /> Get in touch
                  </a>
                  <a href={RESUME_URL} download
                    className="text-sm text-[var(--muted2)] hover:text-[var(--text)] transition-colors font-[family-name:var(--font-mono)] underline underline-offset-2">
                    Download resume
                  </a>
                  <a href={GITLAB_URL} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-[var(--muted2)] hover:text-[var(--text)] transition-colors font-[family-name:var(--font-mono)] underline underline-offset-2 flex items-center gap-1.5">
                    <GitLabIcon style={{ width: 14, height: 14 }} /> View on GitLab
                  </a>
                  <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-[var(--muted2)] hover:text-[var(--text)] transition-colors font-[family-name:var(--font-mono)] underline underline-offset-2 flex items-center gap-1.5">
                    <LinkedinIcon style={{ width: 14, height: 14 }} /> LinkedIn
                  </a>
                </div>
              </FadeUp>
            </SlideIn>

            <SlideIn from="right" delay={0.12}>
              <div className="relative">
                <div className="aspect-[3/4] rounded-[var(--radius-xl)] border border-[var(--border-bright)] bg-[var(--card)] overflow-hidden elevation-product">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/mukesh-photo.png" alt="Mukesh — Full-stack + AI Engineer" className="w-full h-full object-cover" />
                </div>
                <div className="absolute -bottom-3 -right-3 px-3 py-1.5 rounded-[var(--radius-sm)] bg-[var(--card)] border border-[var(--border-bright)] text-[11px] font-[family-name:var(--font-mono)] text-[var(--muted2)]">
                  Full-stack + AI Engineer
                </div>
              </div>
            </SlideIn>
          </div>
        </section>

        {/* ═══ FINAL CTA ═══ */}
        <section className="py-section px-5 bg-[var(--surface)] border-t border-[var(--border)] relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[560px] h-[320px] rounded-full bg-[var(--blue)]/[0.10] blur-[110px]" />
          </div>
          <FadeUp className="relative max-w-3xl mx-auto text-center">
            <TextReveal as="h2"
              text="See it do in minutes what takes a job seeker a weekend."
              delay={0.05} stagger={0.03} duration={0.75}
              className="font-display text-4xl md:text-[2.8rem] font-bold text-[var(--text)] mb-5 leading-[1.06] tracking-[-0.02em]" />
            <FadeUp delay={0.3}>
              <p className="text-[19px] text-[var(--muted2)] mb-10 leading-relaxed max-w-xl mx-auto">
                627 roles scanned. Top match graded and tailored. Zero manual work.
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <TiltCard intensity={8} glare className="inline-flex rounded-[var(--radius-pill)]">
                  <a href={APP_HREF}
                    className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--radius-pill)] text-sm font-semibold text-white uppercase"
                    style={{
                      background: 'linear-gradient(160deg, rgba(40,40,44,1) 0%, rgba(20,20,24,1) 100%)',
                      border: '1px solid rgba(255,255,255,0.12)',
                      letterSpacing: '0.07em',
                      boxShadow: [
                        '0 1px 0 rgba(255,255,255,0.07) inset',
                        '0 6px 20px rgba(255,110,0,0.55)',
                        '0 12px 40px rgba(255,80,0,0.35)',
                        '0 2px 8px rgba(255,150,30,0.7)',
                      ].join(', '),
                    }}>
                    Open the live app <ArrowRight style={{ width: 15, height: 15 }} />
                  </a>
                </TiltCard>
                <a href={EMAIL}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-[var(--radius-pill)] border border-[var(--border-bright)] text-sm text-[var(--text)] hover:border-white/25 hover:bg-white/[0.04] transition-all">
                  <Mail style={{ width: 16, height: 16 }} /> Get in touch
                </a>
              </div>
            </FadeUp>
          </FadeUp>
        </section>

        {/* ═══ FOOTER ═══ */}
        <motion.footer
          className="border-t border-[var(--border)] bg-[var(--surface)] py-10 px-5"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}>
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-7">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-prismatic flex items-center justify-center font-display font-bold text-[11px] text-[#050506]">J</div>
                <span className="font-display font-bold text-sm text-[var(--text)]">JobReach AI</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--subtle)] font-[family-name:var(--font-mono)]">
                <MapPin style={{ width: 12, height: 12 }} />
                Built in India · © 2026 Mukesh
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-5">
              <a href={EMAIL} className="text-xs text-[var(--muted)] hover:text-[var(--muted2)] transition-colors flex items-center gap-1.5 font-[family-name:var(--font-mono)]">
                <Mail style={{ width: 13, height: 13 }} /> Email
              </a>
              <a href={GITLAB_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--muted)] hover:text-[var(--muted2)] transition-colors flex items-center gap-1.5 font-[family-name:var(--font-mono)]">
                <GitLabIcon style={{ width: 13, height: 13 }} /> GitLab
              </a>
              <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer" className="text-xs text-[var(--muted)] hover:text-[var(--muted2)] transition-colors flex items-center gap-1.5 font-[family-name:var(--font-mono)]">
                <LinkedinIcon style={{ width: 13, height: 13 }} /> LinkedIn
              </a>
              <TiltCard intensity={8} glare className="inline-flex rounded-[var(--radius-pill)]">
                <a href={APP_HREF}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-[var(--radius-pill)] text-sm font-semibold text-white uppercase"
                  style={{
                    background: 'linear-gradient(160deg, rgba(40,40,44,1) 0%, rgba(20,20,24,1) 100%)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    letterSpacing: '0.07em',
                    boxShadow: [
                      '0 1px 0 rgba(255,255,255,0.07) inset',
                      '0 6px 20px rgba(255,110,0,0.55)',
                      '0 12px 40px rgba(255,80,0,0.35)',
                      '0 2px 8px rgba(255,150,30,0.7)',
                    ].join(', '),
                  }}>
                  Open the live app <ArrowRight style={{ width: 14, height: 14 }} />
                </a>
              </TiltCard>
            </div>
          </div>
        </motion.footer>

        {/* ═══ SECTION INDICATOR — floating pill (dynamic route label from transcript) ═══ */}
        <SectionIndicator label={SECTION_LABELS[activeSection] ?? activeSection} />

      </div>
    </>
  );
}

export default LandingPage;
