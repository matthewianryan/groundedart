import { motion, HTMLMotionProps } from 'framer-motion';
import { ReactNode } from 'react';

interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  children: ReactNode;
  variant?: 'light' | 'dark' | 'copper';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
  isLoading?: boolean;
}

export function Button({
  children,
  variant = 'light',
  size = 'md',
  fullWidth = false,
  isLoading = false,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  const baseClasses = 'btn-tactile relative font-bold uppercase tracking-wide transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-[#D97706] focus:ring-offset-2';
  
  const variantClasses = {
    light: 'btn-tactile-light',
    dark: 'btn-tactile-dark',
    copper: 'bg-grounded-copper text-white hover:bg-grounded-clay border border-grounded-copper/30 shadow-tactile-dark hover:border-grounded-copper/50',
  };

  const sizeClasses = {
    sm: 'px-4 py-2 text-xs',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  };

  const widthClass = fullWidth ? 'w-full' : '';
  const disabledClass = (disabled || isLoading) ? 'opacity-50 cursor-not-allowed' : '';

  return (
    <motion.button
      className={`${baseClasses} ${variantClasses[variant]} ${sizeClasses[size]} ${widthClass} ${disabledClass} ${className}`}
      disabled={disabled || isLoading}
      whileHover={!disabled && !isLoading ? { scale: 1.02, y: -2 } : {}}
      whileTap={!disabled && !isLoading ? { scale: 0.98 } : {}}
      {...props}
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          Loading...
        </span>
      ) : (
        children
      )}
    </motion.button>
  );
}
