import { ReactNode } from 'react';

interface BadgeProps {
  children: ReactNode;
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'copper';
  size?: 'sm' | 'md';
  className?: string;
}

export function Badge({
  children,
  variant = 'default',
  size = 'md',
  className = '',
}: BadgeProps) {
  const baseClasses = 'inline-flex items-center gap-1.5 rounded-full font-semibold uppercase tracking-wide';
  
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-3 py-1 text-xs',
  };

  const variantClasses = {
    default: 'bg-grounded-charcoal/10 dark:bg-grounded-parchment/10 text-grounded-charcoal dark:text-grounded-parchment',
    success: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
    error: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
    warning: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
    info: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    copper: 'bg-grounded-copper/10 dark:bg-grounded-copper/20 text-grounded-copper border border-grounded-copper/20 dark:border-grounded-copper/30',
  };

  return (
    <span className={`${baseClasses} ${sizeClasses[size]} ${variantClasses[variant]} ${className}`}>
      {children}
    </span>
  );
}
