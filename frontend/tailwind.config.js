/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#15283f',
        cream: '#f8f7f4',
        mist: '#edf4f5',
        sage: '#9fc8c7',
        blush: '#efe5df',
      },
      fontFamily: {
        serif: ['Cormorant Garamond', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 18px 55px rgba(21,40,63,.10)',
      },
    },
  },
  plugins: [],
}
