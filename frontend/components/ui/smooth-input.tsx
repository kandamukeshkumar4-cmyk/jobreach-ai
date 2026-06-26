'use client';

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from 'framer-motion';
import React, {
  type ComponentPropsWithoutRef,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import { cn } from '@/lib/format';

// SSR-safe: evaluated only in browser
const PASSWORD_CHAR =
  typeof navigator !== 'undefined' && /firefox|fxios/i.test(navigator.userAgent)
    ? '●'
    : '•';

const DEFAULT_SPRING = { stiffness: 500, damping: 30, mass: 0.5 };

type SmoothInputType = 'text' | 'password' | 'email' | 'search' | 'url' | 'tel' | 'number';

export type SmoothInputProps = Omit<ComponentPropsWithoutRef<'input'>, 'type'> & {
  type?: SmoothInputType;
  wrapperClassName?: string;
  spring?: { stiffness: number; damping: number; mass: number };
};

function SmoothInputFn(
  {
    className,
    wrapperClassName,
    value,
    defaultValue,
    onChange,
    onBlur,
    onFocus,
    type = 'text',
    spring = DEFAULT_SPRING,
    ...props
  }: SmoothInputProps,
  forwardedRef: React.ForwardedRef<HTMLInputElement>,
) {
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue != null ? String(defaultValue) : '',
  );
  const caretX = useMotionValue(0);
  const caretOpacity = useMotionValue(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const prefersReducedMotion = useReducedMotion();

  useImperativeHandle(forwardedRef, () => inputRef.current as HTMLInputElement);

  const isControlled = value !== undefined;
  const inputValue = isControlled ? String(value) : internalValue;

  const springCaretX = useSpring(
    caretX,
    prefersReducedMotion ? { stiffness: 10000, damping: 100, mass: 0.1 } : spring,
  );

  const syncMeasureSpan = () => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return;
    const styles = window.getComputedStyle(input);
    const isPassword = input.type === 'password';
    let fontSize = styles.fontSize;
    if (
      PASSWORD_CHAR === '•' &&
      isPassword &&
      !/chrome|chromium|crios/i.test(navigator.userAgent)
    ) {
      fontSize = `${parseFloat(fontSize) + 6.25}px`;
    }
    measureSpan.style.font = `${styles.fontStyle} ${styles.fontWeight} ${fontSize} ${styles.fontFamily}`;
    measureSpan.style.letterSpacing = styles.letterSpacing;
    measureSpan.style.fontFeatureSettings = styles.fontFeatureSettings;
    measureSpan.style.fontVariationSettings = styles.fontVariationSettings;
  };

  const measurePrefixWidth = (text: string): number | null => {
    const input = inputRef.current;
    const measureSpan = measureRef.current;
    if (!input || !measureSpan) return null;
    syncMeasureSpan();
    measureSpan.textContent = text;
    const paddingLeft = parseFloat(window.getComputedStyle(input).paddingLeft) || 0;
    return text.length > 0 ? measureSpan.offsetWidth + paddingLeft : paddingLeft - 1;
  };

  const scrollCaretIntoView = (target: HTMLInputElement, absoluteWidth: number) => {
    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const maxScroll = Math.max(0, target.scrollWidth - target.clientWidth);
    const visibleRight = target.scrollLeft + target.clientWidth - paddingRight;
    const visibleLeft = target.scrollLeft + paddingLeft;
    if (absoluteWidth > visibleRight) {
      target.scrollLeft = Math.min(absoluteWidth - target.clientWidth + paddingRight, maxScroll);
      return;
    }
    if (absoluteWidth < visibleLeft) {
      target.scrollLeft = Math.max(0, absoluteWidth - paddingLeft);
    }
  };

  const getCaretIndex = (target: HTMLInputElement) => {
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? 0;
    if (selectionStart === selectionEnd) return selectionStart;
    return target.selectionDirection === 'backward' ? selectionStart : selectionEnd;
  };

  const updateCaretFromInput = (target: HTMLInputElement) => {
    const selectionStart = target.selectionStart ?? 0;
    const selectionEnd = target.selectionEnd ?? 0;
    const hasSelection = selectionStart !== selectionEnd;
    const caretIndex = getCaretIndex(target);
    const isPassword = target.type === 'password';
    const textBeforeCaret = isPassword
      ? PASSWORD_CHAR.repeat(caretIndex)
      : target.value.slice(0, caretIndex);
    const absoluteWidth = measurePrefixWidth(textBeforeCaret);
    if (absoluteWidth === null) return;
    scrollCaretIntoView(target, absoluteWidth);
    const styles = window.getComputedStyle(target);
    const paddingLeft = parseFloat(styles.paddingLeft) || 0;
    const paddingRight = parseFloat(styles.paddingRight) || 0;
    const caretPosition = absoluteWidth - target.scrollLeft;
    const minX = paddingLeft - 1;
    const maxX = target.clientWidth - paddingRight;
    const isCaretVisible = caretPosition >= minX && caretPosition <= maxX + 1;
    caretX.set(Math.min(caretPosition, maxX));
    if (!isCaretVisible || hasSelection) { caretOpacity.set(0); return; }
    caretOpacity.set(1);
  };

  const updateCaretRef = useRef(updateCaretFromInput);
  updateCaretRef.current = updateCaretFromInput;

  // Re-sync on value change
  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) updateCaretRef.current(input);
  }, [inputValue]);

  // Re-sync on type change
  useEffect(() => {
    const input = inputRef.current;
    if (input && document.activeElement === input) updateCaretRef.current(input);
  }, [type]);

  // Selection / resize / scroll listeners
  useEffect(() => {
    const input = inputRef.current;
    const container = containerRef.current;
    if (!input || !container) return;

    const updateIfFocused = () => {
      if (document.activeElement === input) updateCaretRef.current(input);
    };
    const handleSelectionChange = () => {
      if (document.activeElement !== input) return;
      requestAnimationFrame(() => {
        if (document.activeElement === input) updateCaretRef.current(input);
      });
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    document.fonts.addEventListener('loadingdone', updateIfFocused);
    void document.fonts.ready.then(updateIfFocused);
    input.addEventListener('scroll', updateIfFocused);
    const ro = new ResizeObserver(updateIfFocused);
    ro.observe(container);

    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
      document.fonts.removeEventListener('loadingdone', updateIfFocused);
      input.removeEventListener('scroll', updateIfFocused);
      ro.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn(
        // Huly §08 form field — border + glow focus handled by .huly-input on the inner input
        'relative grid grid-cols-1',
        wrapperClassName,
      )}
      style={{ caretColor: 'transparent' }}
    >
      <input
        {...props}
        ref={inputRef}
        type={type}
        className={cn(
          'col-start-1 col-end-2 row-start-1 row-end-2',
          'huly-input w-full px-3 py-2.5 text-sm',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        value={inputValue}
        onChange={(e) => {
          if (!isControlled) setInternalValue(e.target.value);
          onChange?.(e);
          requestAnimationFrame(() => updateCaretRef.current(e.target));
        }}
        onFocus={(e) => {
          updateCaretRef.current(e.target);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          caretOpacity.set(0);
          onBlur?.(e);
        }}
        onSelect={(e) => updateCaretRef.current(e.currentTarget)}
        onClick={(e) => updateCaretRef.current(e.currentTarget)}
        onKeyDown={(e) => {
          requestAnimationFrame(() => {
            if (inputRef.current) updateCaretRef.current(inputRef.current);
          });
          props.onKeyDown?.(e);
        }}
      />

      {/* invisible measure span — matches input font exactly */}
      <span
        ref={measureRef}
        aria-hidden
        className="pointer-events-none invisible absolute top-0 left-0 whitespace-pre"
      />

      {/* spring-animated caret — cyan color from Huly tokens */}
      <motion.div
        aria-hidden
        className="pointer-events-none col-start-1 col-end-2 row-start-1 row-end-2 self-center"
        style={{
          x: springCaretX,
          opacity: caretOpacity,
          width: 2,
          height: '0.9em',
          borderRadius: 1,
          background: 'var(--cyan)',
          boxShadow: '0 0 6px rgba(94,198,255,.7)',
          position: 'absolute',
          top: '50%',
          transform: 'translateY(-50%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

export const SmoothInput = forwardRef(SmoothInputFn);
export default SmoothInput;
