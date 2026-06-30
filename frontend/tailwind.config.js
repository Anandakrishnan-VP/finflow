export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          base:    'rgb(var(--surface-base) / <alpha-value>)',
          raised:  'rgb(var(--surface-raised) / <alpha-value>)',
          sunken:  'rgb(var(--surface-sunken) / <alpha-value>)',
        },
        border: {
          hairline: 'rgb(var(--border-hairline) / <alpha-value>)',
          DEFAULT:  'rgb(var(--border-default) / <alpha-value>)',
        },
        ink: {
          primary:   'rgb(var(--ink-primary) / <alpha-value>)',
          secondary: 'rgb(var(--ink-secondary) / <alpha-value>)',
          muted:     'rgb(var(--ink-muted) / <alpha-value>)',
        },
        accent: {
          DEFAULT:    'rgb(var(--accent) / <alpha-value>)',
          hover:      'rgb(var(--accent-hover) / <alpha-value>)',
          fg:         'rgb(var(--accent-fg) / <alpha-value>)',
          subtle:     'rgb(var(--accent-subtle-bg) / <alpha-value>)',
        },
        risk: {
          high:      'rgb(var(--risk-high) / <alpha-value>)',
          'high-bg': 'rgb(var(--risk-high-bg) / <alpha-value>)',
          medium:      'rgb(var(--risk-medium) / <alpha-value>)',
          'medium-bg': 'rgb(var(--risk-medium-bg) / <alpha-value>)',
          low:      'rgb(var(--risk-low) / <alpha-value>)',
          'low-bg': 'rgb(var(--risk-low-bg) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Public Sans', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        sm: '4px',
        md: '6px',
        lg: '8px',
      },
    },
  },
  plugins: [],
};
