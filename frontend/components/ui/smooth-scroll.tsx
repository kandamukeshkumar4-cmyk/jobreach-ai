'use client';

import { createContext, useContext, useEffect } from 'react';
import Lenis from 'lenis';
import { useMotionValue, type MotionValue } from 'framer-motion';

interface SmoothScrollCtx {
  scrollY: MotionValue<number>;
  progress: MotionValue<number>;
  velocity: MotionValue<number>;
}

const Ctx = createContext<SmoothScrollCtx | null>(null);

export function useSmoothScroll() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useSmoothScroll must be inside SmoothScroll');
  return ctx;
}

export function SmoothScroll({ children }: { children: React.ReactNode }) {
  const scrollY  = useMotionValue(0);
  const progress = useMotionValue(0);
  const velocity = useMotionValue(0);

  useEffect(() => {
    const lenis = new Lenis({ autoRaf: true });
    lenis.on('scroll', ({ scroll, progress: prog, velocity: vel }: { scroll: number; progress: number; velocity: number }) => {
      scrollY.set(scroll);
      progress.set(prog);
      velocity.set(vel);
    });
    return () => lenis.destroy();
  }, [scrollY, progress, velocity]);

  return (
    <Ctx.Provider value={{ scrollY, progress, velocity }}>
      {children}
    </Ctx.Provider>
  );
}
