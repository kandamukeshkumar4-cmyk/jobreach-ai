'use client';

import React from 'react';
import { cn } from '@/lib/format';

export type LiquidGlassCardProps = React.HTMLAttributes<HTMLDivElement>;

export function LiquidGlassCard({ className, children, ...props }: LiquidGlassCardProps) {
  return (
    <div
      className={cn(
        'group relative overflow-hidden rounded-[var(--radius-xl)]',
        'transition-[border-color,box-shadow] duration-200',
        className,
      )}
      style={{
        // Apple glass: very slightly lighter than the void behind it
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.10)',
        boxShadow: [
          '0 8px 32px rgba(0,0,0,0.5)',           // depth
          'inset 0 1.5px 0 rgba(255,255,255,0.14)', // top specular — the key glass line
          'inset 0 -1px 0 rgba(0,0,0,0.30)',        // bottom inner shadow
          'inset 1px 0 0 rgba(255,255,255,0.06)',   // left edge catch-light
          'inset -1px 0 0 rgba(255,255,255,0.03)',  // right edge faint
        ].join(','),
      }}
      {...props}
    >
      {children}

      {/* hover: shimmer sweep */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            'linear-gradient(105deg, rgba(255,255,255,0.04) 0%, transparent 50%, rgba(255,255,255,0.02) 100%)',
        }}
      />
    </div>
  );
}

export default LiquidGlassCard;
