'use client';

import { LandingNav } from '@/components/landing/landing-nav';
import { Hero } from '@/components/landing/hero';
import { DemoSection } from '@/components/landing/demo-section';
import { HowItWorks } from '@/components/landing/how-it-works';
import { FeatureGrid } from '@/components/landing/feature-grid';
import { Architecture } from '@/components/landing/architecture';
import { StatsSection } from '@/components/landing/stats-section';
import { AboutBuilder } from '@/components/landing/about-builder';
import { CtaFooter } from '@/components/landing/cta-footer';

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <LandingNav />
      <Hero />
      <DemoSection />
      <HowItWorks />
      <FeatureGrid />
      <Architecture />
      <StatsSection />
      <AboutBuilder />
      <CtaFooter />
    </main>
  );
}
