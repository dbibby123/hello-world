/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        swtch: {
          green: '#00C896',
          dark: '#0A1628',
          navy: '#0F2244',
          blue: '#1E40AF',
          accent: '#10B981',
        }
      }
    },
  },
  plugins: [],
}
