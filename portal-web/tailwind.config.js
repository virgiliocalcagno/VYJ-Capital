/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          light: '#2563eb',
          DEFAULT: '#1d4ed8',
          dark: '#1e40af',
          accent: '#3b82f6'
        },
        secondary: {
          light: '#64748b',
          DEFAULT: '#475569',
          dark: '#334155'
        },
        status: {
          active: '#10b981',
          mora: '#ef4444',
          pending: '#f59e0b'
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Outfit', 'sans-serif']
      },
      borderRadius: {
        'xl': '1rem',
        '2xl': '1.5rem',
      },
    },
  },
  plugins: [],
}
