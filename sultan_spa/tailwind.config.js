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
					50:  "#eef5ff",
					100: "#d3e3fd",
					200: "#a8c7fa",
					300: "#7cacf8",
					400: "#3a76fc",
					500: "#1e59db",
					600: "#1a53d3",
					700: "#1545b2",
					800: "#10368c",
					900: "#0c2866",
					950: "#081a44",
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
