import { motion, HTMLMotionProps } from 'framer-motion';
import { ReactNode } from 'react';

interface PanelProps extends Omit<HTMLMotionProps<'div'>, 'children'> {
  children: ReactNode;
  title?: string;
  onClose?: () => void;
  variant?: 'light' | 'dark';
}

export function Panel({
  children,
  title,
  onClose,
  variant = 'light',
  className = '',
  ...props
}: PanelProps) {
  const baseClasses = variant === 'light' 
    ? 'card-light bg-grounded-parchment dark:bg-grounded-charcoal/90 backdrop-blur-sm'
    : 'card-dark';

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.3 }}
      className={`${baseClasses} ${className}`}
      {...props}
    >
      {title && (
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-grounded-charcoal/10 dark:border-grounded-parchment/10">
          <h2 className="text-xl md:text-2xl font-bold uppercase tracking-tight text-grounded-charcoal dark:text-grounded-parchment">
            {title}
          </h2>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-grounded-charcoal/5 dark:hover:bg-grounded-parchment/5 rounded transition-colors text-grounded-charcoal/60 dark:text-grounded-parchment/60 hover:text-grounded-copper"
              aria-label="Close panel"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      )}
      {children}
    </motion.div>
  );
}
