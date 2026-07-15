import type { Config } from 'tailwindcss'

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#f8fafc',
          card: '#ffffff',
          border: '#e2e8f0',
          hover: '#f1f5f9',
        },
        'dark-bg': {
          DEFAULT: '#0f172a',
          card: '#1e293b',
          border: '#334155',
          hover: '#334155',
        },
        sidebar: {
          DEFAULT: '#1e293b',
          active: '#334155',
          text: '#94a3b8',
        },
        accent: {
          green: '#16a34a',
          red: '#dc2626',
          yellow: '#d97706',
          blue: '#2563eb',
          neon: '#00ff88',
        },
        text: {
          primary: '#0f172a',
          muted: '#64748b',
          dim: '#cbd5e1',
        },
        'dark-text': {
          primary: '#f1f5f9',
          muted: '#94a3b8',
          dim: '#64748b',
        },
        regime: {
          alta: '#16a34a',
          baixa: '#dc2626',
          neutro: '#64748b',
          tranquilo: '#2563eb',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
} satisfies Config
