import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const ThemeToggle = () => {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className="w-10 h-10 rounded-full flex items-center justify-center transition-opacity opacity-50"
        aria-label="Toggle theme"
        disabled
      >
        <div className="w-5 h-5 rounded-full bg-grounded-charcoal/20" />
      </button>
    );
  }

  const isDark = theme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className="relative w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 focus:outline-none focus:ring-2 focus:ring-grounded-copper focus:ring-offset-2 focus:ring-offset-grounded-parchment dark:focus:ring-offset-grounded-charcoal"
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDark ? 'The Midday Sun' : 'The Night Fire'}
    >
      {/* African Sun Icon (Light Mode) */}
      {!isDark && (
        <svg
          className="w-6 h-6 text-grounded-copper transition-all duration-300"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Central circle */}
          <circle cx="12" cy="12" r="4" />
          {/* Radiating rays - inspired by African sun patterns */}
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="4" y1="12" x2="2" y2="12" />
          <line x1="22" y1="12" x2="20" y2="12" />
          <line x1="5.66" y1="5.66" x2="4.24" y2="4.24" />
          <line x1="19.76" y1="19.76" x2="18.34" y2="18.34" />
          <line x1="5.66" y1="18.34" x2="4.24" y2="19.76" />
          <line x1="19.76" y1="4.24" x2="18.34" y2="5.66" />
          {/* Additional decorative rays */}
          <line x1="8.49" y1="8.49" x2="7.07" y2="7.07" />
          <line x1="16.93" y1="16.93" x2="15.51" y2="15.51" />
          <line x1="8.49" y1="15.51" x2="7.07" y2="16.93" />
          <line x1="16.93" y1="7.07" x2="15.51" y2="8.49" />
        </svg>
      )}

      {/* Crescent Moon Icon (Dark Mode) */}
      {isDark && (
        <svg
          className="w-6 h-6 text-grounded-copper transition-all duration-300 glow-copper"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Crescent moon shape - inspired by African night sky */}
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          {/* Stars around the moon */}
          <circle cx="18" cy="6" r="0.5" fill="currentColor" />
          <circle cx="20" cy="8" r="0.5" fill="currentColor" />
          <circle cx="6" cy="18" r="0.5" fill="currentColor" />
          <circle cx="4" cy="20" r="0.5" fill="currentColor" />
        </svg>
      )}
    </button>
  );
};

export default ThemeToggle;
