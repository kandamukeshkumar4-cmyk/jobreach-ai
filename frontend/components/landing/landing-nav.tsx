import Link from 'next/link';

export function LandingNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--border)] bg-[color-mix(in_srgb,var(--bg)_85%,transparent)] backdrop-blur-sm">
      <nav className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
        <Link
          href="/"
          className="text-[16px] font-extrabold tracking-[-0.6px] text-[var(--text)]"
        >
          JobReach<span className="text-[var(--cyan)]">.AI</span>
        </Link>

        <div className="flex items-center gap-2 sm:gap-4">
          <a
            href="#demo"
            className="hidden rounded-[7px] px-3 py-1.5 text-[14px] font-medium text-[var(--muted2)] transition-colors duration-150 hover:text-[var(--text)] sm:inline-flex"
          >
            Demo
          </a>
          <Link
            href="/login"
            className="rounded-[7px] px-3 py-1.5 text-[14px] font-medium text-[var(--muted2)] transition-colors duration-150 hover:text-[var(--text)]"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-[7px] bg-[var(--cyan)] px-4 py-1.5 text-[14px] font-semibold tracking-[-0.2px] text-[#07071a] transition-[filter] duration-150 hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
          >
            Start a Mission
          </Link>
        </div>
      </nav>
    </header>
  );
}

export default LandingNav;
