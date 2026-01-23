/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Grounded Art - Tactile Maximalist Palette
        grounded: {
          copper: '#D97706', // Primary/Action - Zambian copper
          clay: '#92400E', // Accent - Red clay earth
          indigo: '#1E1B4B', // Secondary - Traditional dyed fabrics
          parchment: '#F5F5F4', // Light Background - Raw canvas/paper
          charcoal: '#1A1715', // Dark Background - Organic, warm dark grey
        },
        // Legacy colors (kept for backward compatibility)
        'rabo-blue': '#002F87',
        'rabo-dark': '#0A0A0A',
        'text-dark': '#222222',
        'earth-ochre': '#CA6702',
        'burnt-sienna': '#A23E48',
        'olive-green': '#606C38',
        terracotta: '#BC6C25',
        'warm-cream': '#FDF5E6',
        'earth-brown': '#8B4513',
        'forest-green': '#2D5016',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Georgia', 'Times New Roman', 'serif'],
        display: ['Georgia', 'Times New Roman', 'serif'], // For "Lore" and "Story" headings
      },
      boxShadow: {
        'tactile-light': 'inset 0 2px 4px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.05)',
        'tactile-dark': '0 0 8px rgba(217, 119, 6, 0.3), 0 0 16px rgba(217, 119, 6, 0.1)',
        'organic-light': '0 4px 12px rgba(0, 0, 0, 0.08), 0 2px 4px rgba(0, 0, 0, 0.04)',
        glassmorphism: '0 8px 32px rgba(0, 0, 0, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
