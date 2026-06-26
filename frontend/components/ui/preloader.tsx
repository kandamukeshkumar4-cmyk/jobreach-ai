'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const WORDS = ['Scanning', 'Scoring', 'Tailoring', 'Matching', 'JobReach AI'];

interface PreloaderProps {
  onComplete: () => void;
}

export function Preloader({ onComplete }: PreloaderProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < WORDS.length - 1) {
      const t = setTimeout(() => setIndex(i => i + 1), 280);
      return () => clearTimeout(t);
    } else {
      const t = setTimeout(onComplete, 500);
      return () => clearTimeout(t);
    }
  }, [index, onComplete]);

  return (
    <motion.div
      className="fixed inset-0 z-[9999] bg-[var(--bg)] flex flex-col items-center justify-center"
      exit={{ y: '-100%' }}
      transition={{ duration: 0.9, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* progress bar */}
      <motion.div
        className="absolute bottom-0 left-0 h-[2px] bg-[var(--cyan)]"
        initial={{ width: '0%' }}
        animate={{ width: `${((index + 1) / WORDS.length) * 100}%` }}
        transition={{ duration: 0.25, ease: 'easeOut' }}
      />

      <div className="overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            className="text-5xl md:text-7xl font-display font-black text-[var(--text)] tracking-[-3px] leading-none"
            initial={{ y: '100%' }}
            animate={{ y: '0%' }}
            exit={{ y: '-100%' }}
            transition={{ duration: 0.3, ease: [0.76, 0, 0.24, 1] }}
          >
            {WORDS[index] === 'JobReach AI' ? (
              <>
                <span className="text-prismatic">JobReach</span>
                <span className="text-[var(--text)]"> AI</span>
              </>
            ) : (
              <span className="text-[var(--muted2)]">{WORDS[index]}</span>
            )}
          </motion.p>
        </AnimatePresence>
      </div>

      <motion.p
        className="absolute bottom-8 font-mono text-[10px] text-[var(--muted)] uppercase tracking-[0.25em]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        Autonomous job search agent
      </motion.p>
    </motion.div>
  );
}
