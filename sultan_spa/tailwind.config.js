/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ["class"],
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				border: "#e2e8f0",
				input: "#e2e8f0",
				ring: "#1e40af",
				background: "#ffffff",
				foreground: "#000000",
				primary: {
					DEFAULT: "#1e40af",
					foreground: "#ffffff",
				},
				secondary: {
					DEFAULT: "#f1f5f9",
					foreground: "#000000",
				},
				destructive: {
					DEFAULT: "#ef4444",
					foreground: "#ffffff",
				},
				muted: {
					DEFAULT: "#f1f5f9",
					foreground: "#475569",
				},
				accent: {
					DEFAULT: "#f1f5f9",
					foreground: "#000000",
				},
				popover: {
					DEFAULT: "#ffffff",
					foreground: "#000000",
				},
				card: {
					DEFAULT: "#ffffff",
					foreground: "#000000",
				},
				ziditech: {
					50:  "#f0eeff",
					100: "#d8dfff",
					200: "#b0bcff",
					300: "#8090ff",
					400: "#4c28cc",
					500: "#4c28cc",
					600: "#4c28cc",
					700: "#4c28cc",
					800: "#4c28cc",
					900: "#4c28cc",
					950: "#4c28cc",
				},
			},
			borderRadius: {
				lg: "0.625rem",
				md: "0.5rem",
				sm: "0.4rem",
			},
			fontFamily: {
				inter: ["Inter", "sans-serif"],
				tajawal: ["Tajawal", "sans-serif"],
			},
		},
	},
	plugins: [require("tailwindcss-animate")],
};
