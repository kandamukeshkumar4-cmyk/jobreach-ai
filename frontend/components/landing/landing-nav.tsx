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

        <div className="hidden items-center gap-6 sm:flex">
          <a
            href="#demo"
            className="text-[14px] font-medium text-[var(--muted2)] transition-colors hover:text-[var(--text)]"
          >
            See it work
          </a>
          <a
            href="#how-it-works"
            className="text-[14px] font-medium text-[var(--muted2)] transition-colors hover:text-[var(--text)]"
          >
            How it works
          </a>
          <a
            href="#features"
            className="text-[14px] font-medium text-[var(--muted2)] transition-colors hover:text-[var(--text)]"
          >
            Features
          </a>
          <a
            href="#about"
            className="text-[14px] font-medium text-[var(--muted2)] transition-colors hover:text-[var(--text)]"
          >
            About
          </a>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-[7px] px-3 py-1.5 text-[14px] font-medium text-[var(--muted2)] transition-colors hover:text-[var(--text)]"
          >
            Log in
          </Link>
          <Link
            href="/signup"
            className="inline-flex items-center justify-center rounded-[7px] bg-[var(--cyan)] px-4 py-1.5 text-[14px] font-semibold tracking-[-0.2px] text-[#07071a] transition-[filter] hover:brightness-110 active:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cyan)]"
          >
            Open the live app
          </Link>
        </div>
      </nav>
    </header>
  );
}

export default LandingNav;
