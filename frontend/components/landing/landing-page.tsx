'use client';

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  Menu, X, ArrowRight, Mail,
  Search, Star, FileText, LayoutGrid, Activity,
  Terminal, Layers, Cpu, GitBranch, Zap, Database,
  MapPin, CheckCircle,
} from "lucide-react";

/* ─── real contact links ─── */
const EMAIL = "mailto:kandadamukesh8@gmail.com";
const GITLAB_URL = "https://gitlab.com/mukeshkumar-kanda";
const LINKEDIN_URL = "https://www.linkedin.com/in/mukesh-gen-ai/";
const RESUME_URL = "/mukesh-resume.docx";
const APP_HREF = "/signup";

/* ─── brand icons not in this lucide build ─── */
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

/* ─── constants ─── */

const NAV_LINKS = [
  { label: "See it work", href: "demo" },
  { label: "How it works", href: "how" },
  { label: "Features", href: "features" },
  { label: "About", href: "about" },
];

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
  scan:     { color: "#38bdf8", label: "SCAN" },
  filter:   { color: "#facc15", label: "FILT" },
  verify:   { color: "#fb923c", label: "VRFY" },
  score:    { color: "#a78bfa", label: "SCOR" },
  match:    { color: "#34d399", label: "MTCH" },
  research: { color: "#22d3ee", label: "RSRC" },
  tailor:   { color: "#60a5fa", label: "TLOR" },
  track:    { color: "#4ade80", label: "TRAK" },
};

const FEATURES = [
  { icon: Search,     title: "Mission Scanning & Matching",    desc: "8+ job sources scanned per mission. Every result graded, not just listed." },
  { icon: Star,       title: "6-Dimension Scoring Engine",      desc: "Skills, Culture, Growth, Location, Comp, and Fit — weighted and graded A–F per role." },
  { icon: Activity,   title: "Company Research & Intelligence", desc: "12+ signals per company: funding stage, team size, tech stack, news sentiment." },
  { icon: FileText,   title: "Document Studio",                 desc: "Tailored resumes and cover letters generated per role — contextually written, not templated." },
  { icon: LayoutGrid, title: "Application Tracker",             desc: "Kanban board auto-populated as the agent works. Zero manual entry required." },
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
  { label: "Frontend",  tech: "Next.js · React · SSE streaming",           color: "#60a5fa" },
  { label: "API",       tech: "FastAPI · WebSockets · Auth",                color: "#a78bfa" },
  { label: "Queue",     tech: "Celery · Redis · Beat scheduler",            color: "#f59e0b" },
  { label: "AI",        tech: "Llama 3.3-70B · 3.1-8B via NVIDIA NIM",     color: "#22d3ee" },
  { label: "Ingestion", tech: "8 Sources · Playwright · requests",          color: "#34d399" },
  { label: "Storage",   tech: "Supabase · PostgreSQL · pgvector",           color: "#fb923c" },
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

/* ─── keyframes (injected once) ─── */
const KF = `
@keyframes pulse-ring {
  0%   { transform: scale(1);   opacity: 0.5; }
  100% { transform: scale(2.2); opacity: 0;   }
}
@keyframes radar-sweep {
  from { transform: rotate(0deg);   }
  to   { transform: rotate(360deg); }
}
@keyframes fade-slide-up {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0);   }
}
@keyframes cursor-blink {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0; }
}
@keyframes hero-glow-pulse {
  0%, 100% { opacity: 0.04; }
  50%       { opacity: 0.08; }
}
`;

/* ─── component ─── */
export function LandingPage() {
  const [menuOpen,     setMenuOpen]     = useState(false);
  const [events,       setEvents]       = useState<typeof AGENT_EVENTS>([]);
  const [running,      setRunning]      = useState(false);
  const [done,         setDone]         = useState(false);
  const [scanned,      setScanned]      = useState(0);
  const [heroEventIdx, setHeroEventIdx] = useState(0);
  const feedRef   = useRef<HTMLDivElement>(null);
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const heroTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const HERO_LINES = [
    "Scanning 8 sources · 627 verified",
    "Scoring Eigen Labs match…",
    "B · 4.3/5 across 6 dimensions",
    "Resume tailored · cover letter ready",
    "Application tracked ✓ · mission done",
  ];

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    setMenuOpen(false);
  }

  function startDemo() {
    if (running) return;
    setEvents([]);
    setScanned(0);
    setDone(false);
    setRunning(true);
    let i = 0;
    let count = 0;
    timerRef.current = setInterval(() => {
      if (i >= AGENT_EVENTS.length) {
        clearInterval(timerRef.current!);
        setRunning(false);
        setDone(true);
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
    setEvents([]);
    setScanned(0);
    setDone(false);
    setRunning(false);
  }

  useEffect(() => {
    heroTimer.current = setInterval(() => {
      setHeroEventIdx((i) => (i + 1) % HERO_LINES.length);
    }, 2200);
    return () => {
      if (heroTimer.current) clearInterval(heroTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [events]);

  const hasMatch    = events.some((e) => e.type === "match");
  const hasVerified = events.some((e) => e.type === "verify");

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KF }} />

      <div className="landing-root min-h-screen bg-[#07090f] text-[#dde4f0] antialiased overflow-x-hidden selection:bg-cyan-400/20 selection:text-cyan-300">

        {/* ─── NAVBAR ─── */}
        <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#07090f]/90 backdrop-blur-md">
          <div className="max-w-6xl mx-auto px-5 flex items-center justify-between h-14">

            <button onClick={() => scrollTo("top")} className="flex items-center gap-2 group">
              <div className="w-7 h-7 rounded-md bg-cyan-400/10 border border-cyan-400/25 flex items-center justify-center">
                <Zap className="text-cyan-400" style={{ width: 14, height: 14 }} />
              </div>
              <span className="font-display font-bold text-sm tracking-tight text-[#dde4f0]">
                JobReach<span className="text-cyan-400"> AI</span>
              </span>
            </button>

            <div className="hidden md:flex items-center gap-7">
              {NAV_LINKS.map((l) => (
                <button key={l.href} onClick={() => scrollTo(l.href)}
                  className="text-sm text-[#6b7a99] hover:text-[#dde4f0] transition-colors">
                  {l.label}
                </button>
              ))}
            </div>

            <Link href={APP_HREF}
              className="hidden md:inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-cyan-400 text-[#07090f] text-sm font-semibold hover:bg-cyan-300 transition-all hover:shadow-[0_0_16px_rgba(34,211,238,0.35)]">
              Open the live app <ArrowRight style={{ width: 14, height: 14 }} />
            </Link>

            <button className="md:hidden text-[#6b7a99] hover:text-[#dde4f0] transition-colors"
              onClick={() => setMenuOpen((o) => !o)}>
              {menuOpen ? <X style={{ width: 20, height: 20 }} /> : <Menu style={{ width: 20, height: 20 }} />}
            </button>
          </div>

          {menuOpen && (
            <div className="md:hidden bg-[#0c1220] border-t border-white/[0.06] px-5 py-5 flex flex-col gap-5">
              {NAV_LINKS.map((l) => (
                <button key={l.href} onClick={() => scrollTo(l.href)}
                  className="text-sm text-[#6b7a99] hover:text-[#dde4f0] text-left transition-colors">
                  {l.label}
                </button>
              ))}
              <Link href={APP_HREF}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-md bg-cyan-400 text-[#07090f] text-sm font-semibold w-fit hover:bg-cyan-300 transition-colors">
                Open the live app <ArrowRight style={{ width: 14, height: 14 }} />
              </Link>
            </div>
          )}
        </nav>

        {/* ─── HERO ─── */}
        <section id="top" className="relative pt-28 pb-20 md:pt-36 md:pb-28 px-5 overflow-hidden">
          {/* ambient glows */}
          <div className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[500px] rounded-full bg-cyan-400/[0.05] blur-[120px]"
            style={{ animation: "hero-glow-pulse 6s ease-in-out infinite" }} />
          <div className="pointer-events-none absolute top-32 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-indigo-500/[0.07] blur-[80px]" />

          <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1fr_480px] gap-14 lg:gap-10 items-center">
            {/* copy */}
            <div>
              <p className="font-mono text-xs text-[#6b7a99] uppercase tracking-[0.18em] mb-6">
                Built solo by Mukesh · Full-stack + AI Engineer
              </p>
              <h1 className="font-display text-[2.6rem] md:text-5xl lg:text-[3.4rem] font-extrabold leading-[1.05] tracking-tight text-[#f0f6ff] mb-5">
                An autonomous AI agent that runs your entire job search.
              </h1>
              <p className="text-[1.05rem] text-[#8a96b0] leading-relaxed mb-9 max-w-[480px]">
                Not a chatbot you talk to — an agent that scans, scores, researches, and tailors, while you watch it work.
              </p>

              <div className="flex flex-wrap gap-3 mb-10">
                <Link href={APP_HREF}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-400 text-[#07090f] font-semibold text-sm hover:bg-cyan-300 transition-all hover:shadow-[0_0_24px_rgba(34,211,238,0.4)]">
                  Open the live app <ArrowRight style={{ width: 16, height: 16 }} />
                </Link>
                <button onClick={() => scrollTo("demo")}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/10 text-sm text-[#8a96b0] hover:border-white/[0.18] hover:text-[#dde4f0] transition-all">
                  Watch it work
                </button>
              </div>

              {/* social proof */}
              <div className="flex flex-wrap gap-2 mb-3">
                {TECH_BADGES.map((b) => (
                  <span key={b} className="px-2.5 py-1 rounded-md bg-white/[0.04] border border-white/[0.07] text-xs text-[#6b7a99] font-mono">
                    {b}
                  </span>
                ))}
              </div>
              <p className="text-xs text-[#3d4f69] font-mono">
                Matches graded A–F across 6 dimensions · top match 4.3/5
              </p>
            </div>

            {/* hero terminal teaser */}
            <div className="relative">
              <div className="rounded-2xl border border-white/[0.07] bg-[#0b1422] overflow-hidden shadow-[0_32px_80px_rgba(0,0,0,0.6)]">
                {/* titlebar */}
                <div className="flex items-center gap-1.5 px-4 py-3 bg-[#08111e] border-b border-white/[0.06]">
                  <div className="w-3 h-3 rounded-full bg-[#ff5f57]" />
                  <div className="w-3 h-3 rounded-full bg-[#febc2e]" />
                  <div className="w-3 h-3 rounded-full bg-[#28c840]" />
                  <span className="ml-3 text-xs text-[#3d4f69] font-mono flex-1">jobreach · mission-runner · live</span>
                  <div className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[10px] text-emerald-400 font-mono tracking-wider">ACTIVE</span>
                  </div>
                </div>

                {/* orb + numbers */}
                <div className="p-6 flex items-center gap-8">
                  <div className="relative w-24 h-24 flex-shrink-0">
                    {[0, 0.5, 1.0].map((d, i) => (
                      <div key={i} className="absolute inset-0 rounded-full border border-cyan-400/20"
                        style={{ animation: `pulse-ring 2.6s ease-out ${d}s infinite` }} />
                    ))}
                    <div className="absolute inset-0 rounded-full overflow-hidden"
                      style={{ animation: "radar-sweep 3.5s linear infinite" }}>
                      <div className="absolute inset-0 rounded-full"
                        style={{ background: "conic-gradient(from 0deg, transparent 260deg, rgba(34,211,238,0.18) 360deg)" }} />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-2.5 h-2.5 rounded-full bg-cyan-400"
                        style={{ boxShadow: "0 0 16px 4px rgba(34,211,238,0.65)" }} />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <div className="font-display text-3xl font-bold text-[#f0f6ff] leading-none">627</div>
                      <div className="text-[11px] text-[#3d4f69] font-mono mt-0.5">roles scanned</div>
                    </div>
                    <div>
                      <div className="font-display text-xl font-bold text-emerald-400 leading-none">B · 4.3/5</div>
                      <div className="text-[11px] text-[#3d4f69] font-mono mt-0.5">top match grade</div>
                    </div>
                  </div>
                </div>

                {/* cycling event line */}
                <div className="border-t border-white/[0.05] px-5 py-3 min-h-[80px]">
                  <div className="text-[10px] text-[#3d4f69] font-mono uppercase tracking-widest mb-2">agent · live feed</div>
                  {[
                    { t: "match",  m: "Agentic AI Eng @ Eigen Labs · B · 4.3/5" },
                    { t: "tailor", m: "Resume tailored · cover letter written" },
                    { t: "track",  m: "Application logged · mission complete ✓" },
                    { t: "scan",   m: "Scanning 8 sources · 627 verified…" },
                  ].map((ev, i) => {
                    const meta = EVENT_META[ev.t];
                    const active = i === heroEventIdx % 4;
                    return (
                      <div key={i} className={`flex items-baseline gap-2 font-mono text-xs py-0.5 transition-opacity duration-500 ${active ? "opacity-100" : "opacity-0 absolute"}`}
                        style={{ position: active ? "relative" : "absolute" }}>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0"
                          style={{ color: meta.color, background: `${meta.color}18` }}>
                          {meta.label}
                        </span>
                        <span className="text-[#6b7a99]">{ev.m}</span>
                      </div>
                    );
                  })}
                  <div className="flex items-center gap-1 mt-1 font-mono text-xs text-[#3d4f69]">
                    <span>▸</span>
                    <span style={{ animation: "cursor-blink 1s step-end infinite" }}>█</span>
                  </div>
                </div>
              </div>

              {/* glow beneath */}
              <div className="pointer-events-none absolute -bottom-8 left-1/2 -translate-x-1/2 w-2/3 h-16 bg-cyan-400/10 blur-2xl rounded-full" />
            </div>
          </div>
        </section>

        {/* ─── LIVE DEMO ─── */}
        <section id="demo" className="py-24 px-5 bg-[#0a0e1a] border-y border-white/[0.05]">
          <div className="max-w-6xl mx-auto">
            <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-5">
              <div>
                <p className="font-mono text-xs text-cyan-400/70 uppercase tracking-[0.18em] mb-2">Live Demo</p>
                <h2 className="font-display text-3xl md:text-[2.4rem] font-bold text-[#f0f6ff] leading-tight">
                  Watch the agent work.
                </h2>
                <p className="mt-2 text-[#6b7a99] text-sm max-w-md leading-relaxed">
                  Most AI hides the work. JobReach makes the agent&apos;s labor visible — every step, in real time.
                </p>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                {!running && !done && (
                  <button onClick={startDemo}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-400 text-[#07090f] font-semibold text-sm hover:bg-cyan-300 transition-all hover:shadow-[0_0_24px_rgba(34,211,238,0.4)]">
                    <Zap style={{ width: 16, height: 16 }} /> Run the agent
                  </button>
                )}
                {running && (
                  <div className="flex items-center gap-2 px-5 py-2.5 rounded-lg border border-cyan-400/25 text-cyan-400 text-sm font-mono">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                    Agent running…
                  </div>
                )}
                {done && (
                  <div className="flex items-center gap-3">
                    <button onClick={resetDemo}
                      className="text-xs text-[#4a5568] hover:text-[#6b7a99] transition-colors font-mono underline underline-offset-2">
                      Run again
                    </button>
                    <Link href={APP_HREF}
                      className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-400 text-[#07090f] font-semibold text-sm hover:bg-cyan-300 transition-all hover:shadow-[0_0_24px_rgba(34,211,238,0.4)]">
                      Open the live app <ArrowRight style={{ width: 15, height: 15 }} />
                    </Link>
                  </div>
                )}
              </div>
            </div>

            <div className="grid lg:grid-cols-[260px_1fr] gap-4">
              {/* left panel: orb + counters */}
              <div className="rounded-xl border border-white/[0.07] bg-[#0c1220] p-6 flex flex-col gap-6">
                <div className="flex justify-center pt-2">
                  <div className="relative w-28 h-28">
                    {[0, 0.55, 1.1].map((d, i) => (
                      <div key={i} className="absolute inset-0 rounded-full border"
                        style={{
                          borderColor: running ? "rgba(34,211,238,0.22)" : "rgba(255,255,255,0.04)",
                          animation: running ? `pulse-ring 2.6s ease-out ${d}s infinite` : "none",
                        }} />
                    ))}
                    <div className="absolute inset-0 rounded-full overflow-hidden"
                      style={{ animation: running ? "radar-sweep 3.5s linear infinite" : "none" }}>
                      <div className="absolute inset-0 rounded-full"
                        style={{ background: running ? "conic-gradient(from 0deg, transparent 260deg, rgba(34,211,238,0.14) 360deg)" : "transparent" }} />
                    </div>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-3 h-3 rounded-full transition-all duration-700"
                        style={{
                          background: running || done ? "#22d3ee" : "#1a2d40",
                          boxShadow: running
                            ? "0 0 24px 6px rgba(34,211,238,0.55)"
                            : done
                            ? "0 0 14px 4px rgba(34,211,238,0.3)"
                            : "none",
                        }} />
                    </div>
                    <div className="absolute -bottom-6 inset-x-0 text-center text-[10px] font-mono tracking-widest"
                      style={{ color: running ? "#22d3ee" : done ? "#34d399" : "#2d3f58" }}>
                      {running ? "SCANNING" : done ? "COMPLETE" : "READY"}
                    </div>
                  </div>
                </div>

                <div className="border-t border-white/[0.05] pt-5 space-y-4 mt-2">
                  {[
                    { label: "Scanned",  val: scanned ? scanned.toLocaleString() : "—", hi: false },
                    { label: "Verified", val: hasVerified ? "60" : "—",                  hi: false },
                    { label: "Top match",val: hasMatch ? "B · 4.3/5" : "—",              hi: hasMatch },
                    { label: "Events",   val: String(events.length),                      hi: false },
                  ].map((row) => (
                    <div key={row.label} className="flex justify-between items-baseline">
                      <span className="text-xs text-[#3d4f69] font-mono">{row.label}</span>
                      <span className={`font-display font-semibold text-sm ${row.hi ? "text-emerald-400" : "text-[#dde4f0]"}`}>
                        {row.val}
                      </span>
                    </div>
                  ))}
                </div>

                {hasMatch && (
                  <div className="rounded-lg border border-emerald-400/20 bg-emerald-400/[0.04] p-3.5"
                    style={{ animation: "fade-slide-up 0.3s ease-out" }}>
                    <div className="text-[10px] text-emerald-400 font-mono uppercase tracking-wider mb-1.5">Match found</div>
                    <div className="text-sm font-semibold text-[#f0f6ff] leading-snug">Agentic AI Engineer</div>
                    <div className="text-xs text-[#6b7a99] mb-2">Eigen Labs</div>
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 rounded bg-emerald-400/20 text-emerald-400 text-xs font-mono font-bold">B</span>
                      <span className="text-sm font-mono text-[#dde4f0]">4.3 / 5</span>
                    </div>
                  </div>
                )}
              </div>

              {/* right panel: event feed */}
              <div className="rounded-xl border border-white/[0.07] bg-[#0c1220] overflow-hidden flex flex-col">
                <div className="flex items-center gap-2 px-5 py-3 border-b border-white/[0.06] bg-[#08111e] flex-shrink-0">
                  <Terminal className="text-[#3d4f69]" style={{ width: 14, height: 14 }} />
                  <span className="text-xs text-[#3d4f69] font-mono">agent · event stream</span>
                  {running && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                      <span className="text-[10px] text-cyan-400 font-mono tracking-wider">LIVE</span>
                    </div>
                  )}
                  {done && (
                    <div className="ml-auto flex items-center gap-1.5">
                      <CheckCircle className="text-emerald-400" style={{ width: 13, height: 13 }} />
                      <span className="text-[10px] text-emerald-400 font-mono tracking-wider">DONE · {events.length} events</span>
                    </div>
                  )}
                </div>

                <div ref={feedRef}
                  className="flex-1 overflow-y-auto p-4 space-y-2 min-h-[360px] max-h-[440px]"
                  style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.05) transparent" }}>
                  {events.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center gap-3 text-center py-16">
                      <Terminal className="text-[#1e2d42]" style={{ width: 32, height: 32 }} />
                      <p className="text-sm text-[#3d4f69] font-mono">Press &quot;Run the agent&quot; to start the mission.</p>
                      <p className="text-xs text-[#252f40]">No signup required · demo mode</p>
                    </div>
                  )}
                  {events.map((ev, i) => {
                    const meta = EVENT_META[ev.type];
                    return (
                      <div key={ev.id} className="flex items-baseline gap-3 font-mono text-xs"
                        style={{ animation: "fade-slide-up 0.22s ease-out" }}>
                        <span className="text-[#1e2d42] w-8 text-right flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold flex-shrink-0 leading-normal"
                          style={{ color: meta.color, background: `${meta.color}16` }}>
                          {meta.label}
                        </span>
                        <span className="text-[#8a96b0] leading-relaxed">{ev.text}</span>
                      </div>
                    );
                  })}
                  {running && (
                    <div className="flex items-baseline gap-3 font-mono text-xs">
                      <span className="text-[#1e2d42] w-8 text-right">{String(events.length + 1).padStart(2, "0")}</span>
                      <span className="text-cyan-400 text-[10px]">▸</span>
                      <span className="text-[#3d4f69]" style={{ animation: "cursor-blink 1s step-end infinite" }}>█</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <p className="text-xs text-[#3d4f69] font-mono">
                Most AI hides the work — JobReach makes the agent&apos;s labor visible.
              </p>
              <button onClick={() => scrollTo("demo")} className="text-xs text-[#3d4f69] hover:text-[#6b7a99] transition-colors font-mono underline underline-offset-2">
                Explore the demo — no signup →
              </button>
            </div>
          </div>
        </section>

        {/* ─── HOW IT WORKS ─── */}
        <section id="how" className="py-24 px-5">
          <div className="max-w-6xl mx-auto">
            <div className="mb-14 text-center">
              <p className="font-mono text-xs text-[#6b7a99] uppercase tracking-[0.18em] mb-3">How it works</p>
              <h2 className="font-display text-3xl md:text-4xl font-bold text-[#f0f6ff]">
                From brief to application in minutes.
              </h2>
              <p className="mt-3 text-[#6b7a99] text-sm max-w-md mx-auto">
                A single coherent loop — no human in the pipeline between scanning and submitting.
              </p>
            </div>

            {/* lifecycle flow */}
            <div className="relative">
              {/* connector line */}
              <div className="hidden md:block absolute top-[30px] left-[6.5%] right-[6.5%] h-px"
                style={{ background: "linear-gradient(to right, transparent, rgba(255,255,255,0.07) 10%, rgba(255,255,255,0.07) 90%, transparent)" }} />

              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-y-8 gap-x-3">
                {LIFECYCLE.map((step, i) => {
                  const hue = 180 + i * 14;
                  return (
                    <div key={step.label} className="flex flex-col items-center text-center gap-3">
                      <div className="relative z-10 w-[60px] h-[60px] rounded-full border border-white/[0.07] bg-[#0c1220] flex flex-col items-center justify-center gap-0.5 hover:border-cyan-400/20 transition-colors">
                        <span className="text-[10px] text-[#3d4f69] font-mono">{step.n}</span>
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: `hsl(${hue}, 75%, 62%)` }} />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-[#dde4f0]">{step.label}</div>
                        <div className="text-[11px] text-[#3d4f69] mt-0.5">{step.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* ─── FEATURES ─── */}
        <section id="features" className="py-24 px-5 bg-[#0a0e1a] border-y border-white/[0.05]">
          <div className="max-w-6xl mx-auto">
            <div className="mb-12">
              <p className="font-mono text-xs text-[#6b7a99] uppercase tracking-[0.18em] mb-3">Capabilities</p>
              <h2 className="font-display text-3xl md:text-[2.4rem] font-bold text-[#f0f6ff] max-w-lg leading-tight">
                Five tools. One mission. No manual work.
              </h2>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {FEATURES.map((f, i) => {
                const Icon = f.icon;
                return (
                  <div key={f.title}
                    className={`rounded-xl border border-white/[0.07] bg-[#0c1220] p-6 hover:border-white/[0.13] hover:bg-[#0e1627] transition-all group cursor-default ${i === 4 ? "md:col-span-2 lg:col-span-1" : ""}`}>
                    <div className="w-9 h-9 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center mb-5 group-hover:border-cyan-400/25 group-hover:bg-cyan-400/[0.06] transition-all">
                      <Icon className="text-[#6b7a99] group-hover:text-cyan-400 transition-colors" style={{ width: 17, height: 17 }} />
                    </div>
                    <h3 className="font-display font-semibold text-[#f0f6ff] mb-2 leading-snug">{f.title}</h3>
                    <p className="text-sm text-[#6b7a99] leading-relaxed">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ─── UNDER THE HOOD ─── */}
        <section id="arch" className="py-24 px-5">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_420px] gap-14 items-start">
            <div>
              <p className="font-mono text-xs text-[#6b7a99] uppercase tracking-[0.18em] mb-3">Architecture</p>
              <h2 className="font-display text-3xl md:text-[2.4rem] font-bold text-[#f0f6ff] leading-tight mb-3">
                This isn&apos;t a prompt wrapper.
              </h2>
              <p className="text-[#6b7a99] mb-10 leading-relaxed max-w-md">
                A distributed, multi-model agent system — the architecture is the product.
              </p>
              <div className="space-y-6">
                {ARCH_POINTS.map((pt) => {
                  const Icon = pt.icon;
                  return (
                    <div key={pt.text} className="flex items-start gap-4">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-white/[0.07] flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="text-[#6b7a99]" style={{ width: 15, height: 15 }} />
                      </div>
                      <p className="text-sm text-[#8a96b0] leading-relaxed">{pt.text}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* arch diagram */}
            <div className="rounded-xl border border-white/[0.07] bg-[#0c1220] p-6">
              <div className="text-[10px] text-[#3d4f69] font-mono uppercase tracking-widest mb-5">System layers</div>
              <div className="space-y-1.5">
                {ARCH_LAYERS.map((l, i, arr) => (
                  <div key={l.label}>
                    <div className="flex items-center gap-3 py-2.5 px-3.5 rounded-lg border transition-colors hover:opacity-90"
                      style={{ borderColor: `${l.color}22`, background: `${l.color}09` }}>
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }} />
                      <div className="font-mono font-bold text-[11px] w-20 flex-shrink-0" style={{ color: l.color }}>
                        {l.label}
                      </div>
                      <div className="text-[#6b7a99] text-[11px] font-mono">{l.tech}</div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="ml-5 w-px h-1.5 bg-white/[0.05]" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ─── STATS ─── */}
        <section id="stats" className="py-24 px-5 bg-[#0a0e1a] border-y border-white/[0.05]">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <p className="font-mono text-xs text-[#6b7a99] uppercase tracking-[0.18em] mb-8">Quality first</p>
              <div className="inline-flex flex-col items-center gap-3">
                <div className="font-display font-extrabold leading-none tracking-tight text-[#f0f6ff]"
                  style={{ fontSize: "clamp(5rem, 14vw, 9rem)" }}>
                  4.3<span className="text-[#3d4f69]" style={{ fontSize: "clamp(2.5rem, 6vw, 4.5rem)" }}>/5</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-md bg-emerald-400/10 border border-emerald-400/20 text-emerald-400 font-mono font-bold text-sm">
                    Grade B
                  </span>
                </div>
                <p className="text-[#6b7a99] text-sm max-w-xs text-center leading-relaxed">
                  Top match graded across 6 weighted dimensions — Skills, Culture, Growth, Location, Comp, Fit
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 rounded-xl overflow-hidden border border-white/[0.06]"
              style={{ gap: "1px", background: "rgba(255,255,255,0.05)" }}>
              {SUPPORTING_STATS.map((s) => (
                <div key={s.val} className="bg-[#0c1220] px-5 py-7 text-center">
                  <div className="font-display text-2xl font-bold text-[#f0f6ff] mb-1.5">{s.val}</div>
                  <div className="text-[11px] text-[#3d4f69] font-mono leading-snug">{s.label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ─── ABOUT ─── */}
        <section id="about" className="py-24 px-5">
          <div className="max-w-6xl mx-auto grid lg:grid-cols-[1fr_320px] gap-14 items-start">
            <div>
              <p className="font-mono text-xs text-[#6b7a99] uppercase tracking-[0.18em] mb-4">About the builder</p>
              <h2 className="font-display text-3xl md:text-[2.4rem] font-bold text-[#f0f6ff] leading-tight mb-6">
                I designed and shipped this entire distributed, multi-model agent system solo — frontend to infra.
              </h2>
              <p className="text-[#8a96b0] leading-relaxed mb-4 max-w-2xl">
                I&apos;m Mukesh — a full-stack + AI engineer who builds end-to-end systems, not prototypes. JobReach is proof: a production-grade autonomous agent with a distributed queue, multi-model routing, real-time streaming, and a polished frontend — all shipped solo.
              </p>
              <p className="text-[#8a96b0] leading-relaxed mb-10 max-w-2xl">
                Here&apos;s what I can build for your team.
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <a href={EMAIL}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-white/10 text-sm text-[#dde4f0] hover:border-white/[0.2] hover:bg-white/[0.04] transition-all">
                  <Mail style={{ width: 16, height: 16 }} /> Get in touch
                </a>
                <a href={RESUME_URL} download
                  className="text-sm text-[#3d4f69] hover:text-[#6b7a99] transition-colors font-mono underline underline-offset-2">
                  Download resume
                </a>
                <a href={GITLAB_URL} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-[#3d4f69] hover:text-[#6b7a99] transition-colors font-mono underline underline-offset-2 flex items-center gap-1.5">
                  <GitLabIcon style={{ width: 14, height: 14 }} /> View on GitLab
                </a>
                <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                  className="text-sm text-[#3d4f69] hover:text-[#6b7a99] transition-colors font-mono underline underline-offset-2 flex items-center gap-1.5">
                  <LinkedinIcon style={{ width: 14, height: 14 }} /> LinkedIn
                </a>
              </div>
            </div>

            {/* photo card */}
            <div className="relative">
              <div className="aspect-[3/4] rounded-2xl border border-white/[0.07] bg-[#0c1220] overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/mukesh-photo.png" alt="Mukesh — Full-stack + AI Engineer" className="w-full h-full object-cover" />
              </div>
              <div className="absolute -bottom-3 -right-3 px-3 py-1.5 rounded-lg bg-[#0c1220] border border-white/[0.07] text-[11px] font-mono text-[#6b7a99]">
                Full-stack + AI Engineer
              </div>
            </div>
          </div>
        </section>

        {/* ─── FINAL CTA ─── */}
        <section className="py-24 px-5 bg-[#0a0e1a] border-t border-white/[0.05] relative overflow-hidden">
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="w-[500px] h-[300px] rounded-full bg-cyan-400/[0.04] blur-[100px]" />
          </div>
          <div className="relative max-w-3xl mx-auto text-center">
            <h2 className="font-display text-3xl md:text-[2.4rem] font-bold text-[#f0f6ff] mb-4 leading-tight">
              See it do in minutes what takes a job seeker a weekend.
            </h2>
            <p className="text-[#6b7a99] mb-10 text-lg leading-relaxed max-w-xl mx-auto">
              627 roles scanned. Top match graded and tailored. Zero manual work.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <Link href={APP_HREF}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-cyan-400 text-[#07090f] font-semibold text-sm hover:bg-cyan-300 transition-all hover:shadow-[0_0_32px_rgba(34,211,238,0.45)]">
                Open the live app <ArrowRight style={{ width: 16, height: 16 }} />
              </Link>
              <a href={EMAIL}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg border border-white/10 text-sm text-[#dde4f0] hover:border-white/[0.2] hover:bg-white/[0.04] transition-all">
                <Mail style={{ width: 16, height: 16 }} /> Get in touch
              </a>
            </div>
          </div>
        </section>

        {/* ─── FOOTER ─── */}
        <footer className="border-t border-white/[0.05] py-10 px-5">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-7">
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Zap className="text-cyan-400" style={{ width: 15, height: 15 }} />
                <span className="font-display font-bold text-sm text-[#dde4f0]">JobReach AI</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-[#2d3f58] font-mono">
                <MapPin style={{ width: 12, height: 12 }} />
                Built in India · © 2026 Mukesh
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5">
              <Link href={APP_HREF}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-cyan-400 text-[#07090f] text-xs font-semibold hover:bg-cyan-300 transition-colors">
                Open the live app <ArrowRight style={{ width: 12, height: 12 }} />
              </Link>
              <a href={EMAIL}
                className="text-xs text-[#3d4f69] hover:text-[#6b7a99] transition-colors flex items-center gap-1.5 font-mono">
                <Mail style={{ width: 13, height: 13 }} /> Email
              </a>
              <a href={GITLAB_URL} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#3d4f69] hover:text-[#6b7a99] transition-colors flex items-center gap-1.5 font-mono">
                <GitLabIcon style={{ width: 13, height: 13 }} /> GitLab
              </a>
              <a href={LINKEDIN_URL} target="_blank" rel="noopener noreferrer"
                className="text-xs text-[#3d4f69] hover:text-[#6b7a99] transition-colors flex items-center gap-1.5 font-mono">
                <LinkedinIcon style={{ width: 13, height: 13 }} /> LinkedIn
              </a>
              <a href={EMAIL}
                className="text-xs text-[#3d4f69] hover:text-[#6b7a99] transition-colors font-mono">
                Get in touch
              </a>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}

export default LandingPage;
