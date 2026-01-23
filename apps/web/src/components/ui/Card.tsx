import { motion, HTMLMotionProps } from 'framer-motion';
import { ReactNode } from 'react';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  variant?: 'light' | 'dark';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hover?: boolean;
}

export function Card({
  children,
  variant = 'light',
  padding = 'md',
  hover = false,
  className = '',
  ...props
}: CardProps) {
  const baseClasses = variant === 'light' ? 'card-light' : 'card-dark';
  
  const paddingClasses = {
    none: '',
    sm: 'p-4',
    md: 'p-6 md:p-8',
    lg: 'p-8 md:p-10',
  };

  const hoverProps = hover
    ? {
        whileHover: { scale: 1.02, y: -4 },
        transition: { duration: 0.2 },
      }
    : {};

  return (
    <motion.div
      className={`${baseClasses} ${paddingClasses[padding]} ${className}`}
      {...hoverProps}
      {...props}
    >
      {children}
    </motion.div>
  );
}
