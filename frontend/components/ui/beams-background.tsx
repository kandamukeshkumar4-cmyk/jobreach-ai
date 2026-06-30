'use client';

import { motion } from 'framer-motion';
import { useEffect, useRef } from 'react';

interface Beam {
  x: number;
  y: number;
  width: number;
  length: number;
  angle: number;
  speed: number;
  opacity: number;
  hue: number;
  pulse: number;
  pulseSpeed: number;
}

function createBeam(width: number, height: number): Beam {
  return {
    x: Math.random() * width * 1.5 - width * 0.25,
    y: Math.random() * height * 1.5 - height * 0.25,
    width: 30 + Math.random() * 60,
    length: height * 2.5,
    angle: -35 + Math.random() * 10,
    speed: 0.6 + Math.random() * 1.2,
    opacity: 0.12 + Math.random() * 0.16,
    hue: 190 + Math.random() * 70,
    pulse: Math.random() * Math.PI * 2,
    pulseSpeed: 0.02 + Math.random() * 0.03,
  };
}

export function BeamsBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const beamsRef = useRef<Beam[]>([]);
  const rafRef = useRef<number>(0);
  const activeRef = useRef<boolean>(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const BEAM_COUNT = 15;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.scale(dpr, dpr);
      beamsRef.current = Array.from({ length: BEAM_COUNT }, () =>
        createBeam(window.innerWidth, window.innerHeight),
      );
    };

    resize();
    window.addEventListener('resize', resize);

    function resetBeam(beam: Beam, index: number) {
      const spacing = window.innerWidth / 3;
      const col = index % 3;
      beam.y = window.innerHeight + 100;
      beam.x = col * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5;
      beam.width = 100 + Math.random() * 100;
      beam.speed = 0.5 + Math.random() * 0.4;
      beam.hue = 190 + (index * 70) / BEAM_COUNT;
      beam.opacity = 0.2 + Math.random() * 0.1;
    }

    function draw(beam: Beam) {
      if (!ctx) return;
      ctx.save();
      ctx.translate(beam.x, beam.y);
      ctx.rotate((beam.angle * Math.PI) / 180);
      const alpha = beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2);
      const g = ctx.createLinearGradient(0, 0, 0, beam.length);
      g.addColorStop(0,   `hsla(${beam.hue},85%,65%,0)`);
      g.addColorStop(0.1, `hsla(${beam.hue},85%,65%,${alpha * 0.5})`);
      g.addColorStop(0.4, `hsla(${beam.hue},85%,65%,${alpha})`);
      g.addColorStop(0.6, `hsla(${beam.hue},85%,65%,${alpha})`);
      g.addColorStop(0.9, `hsla(${beam.hue},85%,65%,${alpha * 0.5})`);
      g.addColorStop(1,   `hsla(${beam.hue},85%,65%,0)`);
      ctx.fillStyle = g;
      ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
      ctx.restore();
    }

    function animate() {
      if (!ctx || !activeRef.current) {
        rafRef.current = requestAnimationFrame(animate);
        return;
      }
      ctx.clearRect(0, 0, canvas!.width, canvas!.height);
      beamsRef.current.forEach((beam, i) => {
        beam.y -= beam.speed;
        beam.pulse += beam.pulseSpeed;
        if (beam.y + beam.length < -100) resetBeam(beam, i);
        draw(beam);
      });
      rafRef.current = requestAnimationFrame(animate);
    }

    const observer = new IntersectionObserver(
      ([entry]) => { activeRef.current = entry.isIntersecting; },
      { threshold: 0 }
    );
    observer.observe(canvas);

    animate();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
    };
  }, []);

  return (
    <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden>
      <canvas ref={canvasRef} className="absolute inset-0" style={{ filter: 'blur(20px)' }} />
      <motion.div
        className="absolute inset-0"
        animate={{ opacity: [0.05, 0.15, 0.05] }}
        transition={{ duration: 10, ease: 'easeInOut', repeat: Infinity }}
      />
    </div>
  );
}

export default BeamsBackground;
