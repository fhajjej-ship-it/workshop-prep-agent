'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';

type AnimatedDetailsProps = {
  children: ReactNode;
  summary: ReactNode;
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
};

export default function AnimatedDetails({
  children, summary, className, open, onOpenChange, defaultOpen = false,
}: AnimatedDetailsProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const requestedOpen = open ?? uncontrolledOpen;
  // Keep native content visible until a closing animation has finished.
  const [visibleOpen, setVisibleOpen] = useState(requestedOpen);
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<Animation | null>(null);
  const targetOpenRef = useRef(requestedOpen);
  const targetHeightRef = useRef(0);

  const cancelAnimation = useCallback(() => {
    const animation = animationRef.current;
    animationRef.current = null;
    if (animation) {
      animation.onfinish = null;
      animation.cancel();
    }
  }, []);

  const settle = useCallback((nextOpen: boolean) => {
    const details = detailsRef.current;
    cancelAnimation();
    if (!details) return;
    details.open = nextOpen;
    details.style.removeProperty('height');
    details.style.removeProperty('overflow');
    setVisibleOpen(nextOpen);
  }, [cancelAnimation]);

  const measureHeight = useCallback((expanded: boolean) => {
    const details = detailsRef.current;
    const heading = summaryRef.current;
    const content = contentRef.current;
    if (!details || !heading || !content) return 0;
    const style = getComputedStyle(details);
    const headingStyle = getComputedStyle(heading);
    const pixels = (value: string) => Number.parseFloat(value) || 0;
    return heading.getBoundingClientRect().height
      + pixels(headingStyle.marginTop) + pixels(headingStyle.marginBottom)
      + pixels(style.paddingTop) + pixels(style.paddingBottom)
      + pixels(style.borderTopWidth) + pixels(style.borderBottomWidth)
      + (expanded ? content.getBoundingClientRect().height : 0);
  }, []);

  const animateTo = useCallback((nextOpen: boolean) => {
    const details = detailsRef.current;
    if (!details) return;
    targetOpenRef.current = nextOpen;
    if (!animationRef.current && details.open === nextOpen) return;
    const from = details.getBoundingClientRect().height;
    cancelAnimation();
    details.open = true;
    setVisibleOpen(true);
    const to = measureHeight(nextOpen);
    targetHeightRef.current = to;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches
      || typeof details.animate !== 'function' || Math.abs(from - to) < 1) {
      settle(nextOpen);
      return;
    }
    details.style.height = `${from}px`;
    details.style.overflow = 'hidden';
    const animation = details.animate(
      [{ height: `${from}px` }, { height: `${to}px` }],
      { duration: 350, easing: 'cubic-bezier(.22, 1, .36, 1)', fill: 'both' },
    );
    animationRef.current = animation;
    animation.onfinish = () => {
      if (animationRef.current === animation) settle(nextOpen);
    };
  }, [cancelAnimation, measureHeight, settle]);

  useLayoutEffect(() => { animateTo(requestedOpen); }, [requestedOpen, animateTo]);

  useEffect(() => {
    // Observe intrinsic content, not the animated details height, to avoid a resize loop.
    const observer = new ResizeObserver(() => {
      if (animationRef.current
        && Math.abs(measureHeight(targetOpenRef.current) - targetHeightRef.current) >= 1) {
        animateTo(targetOpenRef.current);
      }
    });
    if (contentRef.current) observer.observe(contentRef.current);
    if (summaryRef.current) observer.observe(summaryRef.current);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onMotionChange = () => {
      if (reducedMotion.matches && animationRef.current) settle(targetOpenRef.current);
    };
    reducedMotion.addEventListener('change', onMotionChange);
    return () => {
      observer.disconnect();
      reducedMotion.removeEventListener('change', onMotionChange);
      cancelAnimation();
    };
  }, [animateTo, cancelAnimation, measureHeight, settle]);

  const onSummaryClick = (event: MouseEvent<HTMLElement>) => {
    // Let links or controls inside a summary keep their own native interaction.
    if (event.target instanceof Element
      && event.target.closest('a, button, input, select, textarea')) return;
    event.preventDefault();
    const nextOpen = !requestedOpen;
    if (open === undefined) setUncontrolledOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };

  return <details ref={detailsRef} className={className} open={visibleOpen}>
    <summary ref={summaryRef} onClick={onSummaryClick}>{summary}</summary>
    <div ref={contentRef} className="details-content" style={{ display: 'flow-root' }}>{children}</div>
  </details>;
}
