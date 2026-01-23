import { forwardRef, InputHTMLAttributes } from 'react';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, className = '', ...props }, ref) => {
    const baseClasses = 'w-full px-4 py-3 rounded-lg border transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-grounded-copper focus:ring-offset-2';
    
    const stateClasses = error
      ? 'border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-900/20'
      : 'border-grounded-charcoal/20 dark:border-grounded-parchment/20 bg-white dark:bg-grounded-charcoal/50 text-grounded-charcoal dark:text-grounded-parchment';

    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-semibold uppercase tracking-wide mb-2 text-grounded-charcoal dark:text-grounded-parchment">
            {label}
          </label>
        )}
        <input
          ref={ref}
          className={`${baseClasses} ${stateClasses} ${className}`}
          {...props}
        />
        {error && (
          <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {helperText && !error && (
          <p className="mt-2 text-sm text-grounded-charcoal/60 dark:text-grounded-parchment/60">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';
