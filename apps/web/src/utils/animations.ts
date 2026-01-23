import { Variants } from 'framer-motion';

/**
 * Reusable animation variants matching the landing page timing and easing
 */

// Easing curves matching landing page
export const easing = {
  smooth: [0.25, 0.46, 0.45, 0.94] as const,
  bounce: [0.34, 1.56, 0.64, 1] as const,
  easeOut: [0.16, 1, 0.3, 1] as const,
};

// Common durations
export const duration = {
  fast: 0.3,
  normal: 0.5,
  slow: 0.8,
};

/**
 * Fade in from bottom
 */
export const fadeInUp: Variants = {
  initial: {
    opacity: 0,
    y: 30,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: 30,
  },
};

/**
 * Fade in from top
 */
export const fadeInDown: Variants = {
  initial: {
    opacity: 0,
    y: -30,
  },
  animate: {
    opacity: 1,
    y: 0,
  },
  exit: {
    opacity: 0,
    y: -30,
  },
};

/**
 * Scale in animation
 */
export const scaleIn: Variants = {
  initial: {
    opacity: 0,
    scale: 0.9,
  },
  animate: {
    opacity: 1,
    scale: 1,
  },
  exit: {
    opacity: 0,
    scale: 0.9,
  },
};

/**
 * Slide in from left
 */
export const slideInLeft: Variants = {
  initial: {
    opacity: 0,
    x: -20,
  },
  animate: {
    opacity: 1,
    x: 0,
  },
  exit: {
    opacity: 0,
    x: -20,
  },
};

/**
 * Slide in from right
 */
export const slideInRight: Variants = {
  initial: {
    opacity: 0,
    x: 20,
  },
  animate: {
    opacity: 1,
    x: 0,
  },
  exit: {
    opacity: 0,
    x: 20,
  },
};

/**
 * Stagger children animation
 */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
    },
  },
};

/**
 * Stagger item (used as child of staggerContainer)
 */
export const staggerItem: Variants = {
  initial: {
    opacity: 0,
    y: 20,
  },
  animate: {
    opacity: 1,
    y: 0,
    transition: {
      duration: duration.normal,
      ease: easing.smooth,
    },
  },
};

/**
 * Default transition config
 */
export const defaultTransition = {
  duration: duration.normal,
  ease: easing.smooth,
};

/**
 * Fast transition config
 */
export const fastTransition = {
  duration: duration.fast,
  ease: easing.easeOut,
};

/**
 * Slow transition config
 */
export const slowTransition = {
  duration: duration.slow,
  ease: easing.smooth,
};
