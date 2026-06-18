import Link from 'next/link'
import type { ReactNode } from 'react'

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-12">
      <Link href="/" className="mb-8 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-[var(--cyan)] flex items-center justify-center">
          <span className="text-[#07071a] text-sm font-bold">JR</span>
        </div>
        <span className="font-bold text-2xl tracking-[-1.5px] text-white">JobReach</span>
      </Link>

      <div className="w-full max-w-[400px]">{children}</div>

      <p className="mt-8 text-xs text-[var(--muted)] tracking-[-0.2px]">
        AI-powered job search, end to end.
      </p>
    </div>
  )
}
