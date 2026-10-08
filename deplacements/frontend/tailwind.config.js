/** Palette tirée du logo de la Chambre : terre cuite et bleu zellige. */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fdf4ef',
          100: '#fae4d6',
          200: '#f4c6ab',
          300: '#eba077',
          400: '#e07448',
          500: '#c75a2c',
          600: '#a94621',
          700: '#8c381d',
          800: '#72301d',
          900: '#5e2a1b',
        },
        zellige: {
          50: '#eef8f9',
          100: '#d4edf0',
          500: '#1f7f8c',
          600: '#176a76',
          700: '#145662',
        },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
  plugins: [],
};
