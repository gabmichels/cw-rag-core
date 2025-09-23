import type { Config } from "tailwindcss";

const config: Config = {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
  		fontFamily: {
  			sans: ['Poppins', 'system-ui', 'sans-serif'],
  		},
  		backgroundImage: {
  			'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
  			'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
  			'dark-gradient': 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
  			'chat-gradient': 'linear-gradient(to bottom, #0f172a, #1e293b)',
  		},
  		animation: {
  			'fade-in': 'fadeIn 0.3s ease-in-out',
  			'slide-up': 'slideUp 0.3s ease-out',
  			'typing': 'typing 1s steps(20) infinite',
  			'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
  		},
  		keyframes: {
  			fadeIn: {
  				'0%': { opacity: '0', transform: 'translateY(10px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' },
  			},
  			slideUp: {
  				'0%': { opacity: '0', transform: 'translateY(20px)' },
  				'100%': { opacity: '1', transform: 'translateY(0)' },
  			},
  			typing: {
  				'0%, 50%': { opacity: '1' },
  				'51%, 100%': { opacity: '0.3' },
  			},
  			pulseSoft: {
  				'0%, 100%': { opacity: '0.4' },
  				'50%': { opacity: '0.8' },
  			},
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			}
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
};
export default config;