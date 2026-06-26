'use client';

import { useRef, MouseEvent, ReactNode } from 'react';
import { cn } from '@/lib/format';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  intensity?: number; // max tilt degrees, default 12
  glare?: boolean;
}

export function TiltCard({ children, className, intensity = 12, glare = true }: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const glareRef = useRef<HTMLDivElement>(null);

  const onMove = (e: MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const { left, top, width, height } = el.getBoundingClientRect();
    const x = (e.clientX - left) / width;   // 0→1
    const y = (e.clientY - top) / height;   // 0→1
    const rotX = (0.5 - y) * intensity;     // positive = tilt top toward viewer
    const rotY = (x - 0.5) * intensity;
    el.style.transform = `perspective(800px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02,1.02,1.02)`;
    if (glareRef.current) {
      glareRef.current.style.background =
        `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(255,255,255,0.18) 0%, transparent 65%)`;
    }
  };

  const onLeave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.transform = 'perspective(800px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    if (glareRef.current) glareRef.current.style.background = 'none';
  };

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn('relative', className)}
      style={{ transition: 'transform 0.1s ease', willChange: 'transform', transformStyle: 'preserve-3d' }}>
      {children}
      {glare && (
        <div ref={glareRef} className="absolute inset-0 rounded-[inherit] pointer-events-none z-10"
          style={{ transition: 'background 0.15s ease' }} />
      )}
    </div>
  );
}
