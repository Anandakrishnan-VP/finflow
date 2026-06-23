/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // M3 Tonal Palette Roles
        primary: 'var(--m3-primary)',
        onPrimary: 'var(--m3-on-primary)',
        primaryContainer: 'var(--m3-primary-container)',
        onPrimaryContainer: 'var(--m3-on-primary-container)',

        secondary: 'var(--m3-secondary)',
        onSecondary: 'var(--m3-on-secondary)',
        secondaryContainer: 'var(--m3-secondary-container)',
        onSecondaryContainer: 'var(--m3-on-secondary-container)',

        tertiary: 'var(--m3-tertiary)',
        onTertiary: 'var(--m3-on-tertiary)',
        tertiaryContainer: 'var(--m3-tertiary-container)',
        onTertiaryContainer: 'var(--m3-on-tertiary-container)',

        error: 'var(--m3-error)',
        onError: 'var(--m3-on-error)',
        errorContainer: 'var(--m3-error-container)',
        onErrorContainer: 'var(--m3-on-error-container)',

        background: 'var(--m3-background)',
        surface: 'var(--m3-surface)',
        surfaceDim: 'var(--m3-surface-dim)',
        surfaceBright: 'var(--m3-surface-bright)',

        surfaceContainerLowest: 'var(--m3-surface-container-lowest)',
        surfaceContainerLow: 'var(--m3-surface-container-low)',
        surfaceContainer: 'var(--m3-surface-container)',
        surfaceContainerHigh: 'var(--m3-surface-container-high)',
        surfaceContainerHighest: 'var(--m3-surface-container-highest)',

        onSurface: 'var(--m3-on-surface)',
        onSurfaceVariant: 'var(--m3-on-surface-variant)',
        outline: 'var(--m3-outline)',
        outlineVariant: 'var(--m3-outline-variant)',

        // Legacy compatibility mappings
        accent: {
          DEFAULT: 'var(--m3-primary)',
          hover: 'var(--m3-primary)',
          active: 'var(--m3-primary)',
          light: 'var(--m3-primary-container)',
          dark: 'var(--m3-on-primary-container)'
        },
        bgLight: 'var(--m3-background)',
        bgDark: 'var(--m3-background)',
        cardLight: 'var(--m3-surface-container-low)',
        cardDark: 'var(--m3-surface-container-low)',
        borderLight: 'var(--m3-outline-variant)',
        borderDark: 'var(--m3-outline-variant)',
        danger: 'var(--m3-error)',
        warning: 'var(--m3-secondary)'
      },
      borderRadius: {
        // M3 Shape Scale
        'm3-none': '0px',
        'm3-xs': '4px',
        'm3-s': '8px',
        'm3-m': '12px',
        'm3-l': '16px',
        'm3-xl': '28px',
        'm3-full': '9999px',
        // Legacy fallback support
        'enterprise': '16px',
        'btn': '12px'
      },
      fontFamily: {
        sans: ['Roboto', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
        serif: ['Instrument Serif', 'Georgia', 'serif']
      }
    },
  },
  plugins: [],
}
