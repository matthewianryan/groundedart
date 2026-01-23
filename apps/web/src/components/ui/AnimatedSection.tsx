import { motion, HTMLMotionProps } from 'framer-motion';
import { ReactNode } from 'react';
import { fadeInUp, defaultTransition } from '../../utils/animations';

interface AnimatedSectionProps extends Omit<HTMLMotionProps<'section'>, 'children'> {
  children: ReactNode;
  animation?: 'fadeInUp' | 'fadeInDown' | 'scaleIn' | 'slideInLeft' | 'slideInRight';
  delay?: number;
}

export function AnimatedSection({
  children,
  animation = 'fadeInUp',
  delay = 0,
  className = '',
  ...props
}: AnimatedSectionProps) {
  const animationVariants = {
    fadeInUp,
    fadeInDown: {
      initial: { opacity: 0, y: -30 },
      animate: { opacity: 1, y: 0 },
      exit: { opacity: 0, y: -30 },
    },
    scaleIn: {
      initial: { opacity: 0, scale: 0.9 },
      animate: { opacity: 1, scale: 1 },
      exit: { opacity: 0, scale: 0.9 },
    },
    slideInLeft: {
      initial: { opacity: 0, x: -20 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: -20 },
    },
    slideInRight: {
      initial: { opacity: 0, x: 20 },
      animate: { opacity: 1, x: 0 },
      exit: { opacity: 0, x: 20 },
    },
  };

  const variant = animationVariants[animation];

  return (
    <motion.section
      initial="initial"
      animate="animate"
      exit="exit"
      variants={variant}
      transition={{
        ...defaultTransition,
        delay,
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.section>
  );
}
