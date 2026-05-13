import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        background: '#0A0E1A',
        surface: {
          DEFAULT: '#0F1729',
          elevated: '#1A2440',
          hover: '#1E2A47',
        },
        primary: {
          DEFAULT: '#4F8EF7',
          hover: '#6BA0F9',
          foreground: '#FFFFFF',
        },
        accent: {
          DEFAULT: '#D4A574',
          hover: '#E0B589',
        },
        text: {
          primary: '#F5F2EC',
          secondary: '#A8B2C7',
          muted: '#6B7A99',
        },
        border: {
          DEFAULT: '#1E2A47',
          strong: '#2A3856',
        },
        success: '#10B981',
        warning: '#F59E0B',
        error: '#EF4444',
        info: '#3B82F6',
        overlay: 'rgba(10, 14, 26, 0.85)',
      },
      fontFamily: {
        display: ['var(--font-fraunces)', 'Georgia', 'serif'],
        sans: ['var(--font-geist-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'JetBrains Mono', 'monospace'],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '16px',
        xl: '24px',
        full: '9999px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(0, 0, 0, 0.2)',
        md: '0 4px 12px rgba(0, 0, 0, 0.3)',
        lg: '0 12px 32px rgba(0, 0, 0, 0.4)',
        'sm-dark': '0 1px 2px rgba(0, 0, 0, 0.2)',
        'md-dark': '0 4px 12px rgba(0, 0, 0, 0.3)',
        'lg-dark': '0 12px 32px rgba(0, 0, 0, 0.4)',
        'glow-primary': '0 0 24px rgba(79, 142, 247, 0.3)',
        'glow-accent': '0 0 24px rgba(212, 165, 116, 0.25)',
      },
      transitionTimingFunction: {
        'ease-out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'fade-up': 'fadeUp 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        'pulse-soft': 'pulseSoft 1.6s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        pulseSoft: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.6' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
