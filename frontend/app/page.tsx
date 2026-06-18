'use client';

import { LandingNav } from '@/components/landing/landing-nav';
import { Hero } from '@/components/landing/hero';
import { Comparison } from '@/components/landing/comparison';
import { DemoSection } from '@/components/landing/demo-section';
import { FeatureGrid } from '@/components/landing/feature-grid';
import { CtaFooter } from '@/components/landing/cta-footer';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <LandingNav />
      <Hero />
      <Comparison />
      <DemoSection />
      <FeatureGrid />
      <CtaFooter />
    </main>
  );
}
