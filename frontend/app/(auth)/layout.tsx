import Link from 'next/link'
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div
      className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12"
      style={{
        backgroundImage:
          'radial-gradient(60% 50% at 50% 32%, rgba(47,107,255,.18) 0%, rgba(139,107,255,.10) 38%, transparent 70%)',
      }}
    >
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-[var(--radius-md)] bg-prismatic flex items-center justify-center shadow-[var(--glow-blue)]">
          <span className="text-[#050506] text-sm font-bold">JR</span>
        </div>
        <span className="font-display font-bold text-2xl tracking-[-1.5px] text-[var(--text)]">JobReach</span>
      </Link>

      <div className="w-full max-w-[400px]">{children}</div>

      <p className="mt-8 text-xs text-[var(--muted)] tracking-[-0.2px]">
        AI-powered job search, end to end.
      </p>
    </div>
  )
}
