/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{tsx,ts,js,jsx}', './src/**/*.{tsx,ts,js,jsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#FFB067',
        mint: '#86D3A5',
        background: '#FFFDF9',
        surface: '#FFFFFF',
        danger: '#FF6B6B',
        warn: '#FFD93D',
        text: '#4A4A4A',
        muted: '#9CA3AF'
      },
      borderRadius: {
        '3xl': '24px',
        '2xl': '16px'
      }
    }
  },
  plugins: []
};
