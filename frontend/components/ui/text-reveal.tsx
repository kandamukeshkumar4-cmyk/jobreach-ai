'use client';

import { useRef } from 'react';
import { motion, useInView } from 'framer-motion';
import { cn } from '@/lib/format';

interface TextRevealProps {
  text: string;
  className?: string;
  wordClassName?: string;
  delay?: number;
  stagger?: number;
  duration?: number;
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span' | 'div';
  once?: boolean;
  trigger?: boolean;
}

export function TextReveal({
  text,
  className,
  wordClassName,
  delay = 0,
  stagger = 0.02,
  duration = 0.7,
  as: Tag = 'p',
  once = true,
  trigger,
}: TextRevealProps) {
  const ref = useRef<HTMLElement>(null);
  const isInView = useInView(ref as React.RefObject<Element>, { once, margin: '-8% 0px' });
  const shouldAnimate = trigger !== undefined ? trigger : isInView;
  const words = text.split(' ');

  return (
    // @ts-expect-error polymorphic
    <Tag ref={ref} className={cn('flex flex-wrap', className)}>
      {words.map((word, i) => (
        <span key={i} className="overflow-hidden inline-block mr-[0.28em] last:mr-0">
          <motion.span
            className={cn('inline-block', wordClassName)}
            initial={{ y: '110%', opacity: 0 }}
            animate={shouldAnimate ? { y: '0%', opacity: 1 } : { y: '110%', opacity: 0 }}
            transition={{
              duration,
              delay: delay + i * stagger,
              ease: [0.76, 0, 0.24, 1],
            }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
