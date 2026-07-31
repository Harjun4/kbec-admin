/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./public/**/*.html", "./public/**/*.js", "./*.html", "./*.js"],
  safelist: [
    { pattern: /bg-(blue|emerald|orange|amber|rose|cyan|indigo|slate|purple)-(50|100|200|500|600)/ },
    { pattern: /text-(blue|emerald|orange|amber|rose|cyan|indigo|slate|purple)-(500|600|700)/ }
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
