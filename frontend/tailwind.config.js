/** @type {import('tailwindcss').Config} */
export default {
  // No darkMode strategy: the app ships light-only and there are no `dark:`
  // variants left in source. Re-add "class" if a dark theme returns.
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    container: {
      center: true,
      padding: "1rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          50: "hsl(var(--primary-50))",
          100: "hsl(var(--primary-100))",
          200: "hsl(var(--primary-200))",
          300: "hsl(var(--primary-300))",
          400: "hsl(var(--primary-400))",
          500: "hsl(var(--primary-500))",
          600: "hsl(var(--primary-600))",
          700: "hsl(var(--primary-700))",
          800: "hsl(var(--primary-800))",
          900: "hsl(var(--primary-900))",
        },
        // Orange brand accent. Deliberately NOT named `accent` — that key is
        // shadcn's neutral hover surface and is consumed by Radix primitives.
        brand: {
          DEFAULT: "hsl(var(--brand-accent))",
          foreground: "hsl(var(--brand-accent-foreground))",
          muted: "hsl(var(--brand-accent-muted))",
          strong: "hsl(var(--brand-accent-strong))",
          vivid: "hsl(var(--brand-accent-vivid))",
        },
        // Deep chrome for large dark surfaces (footer, announcement bar). Kept
        // OUT of the primary ramp on purpose: primary-800/900 are brand-saturated
        // and clash with the warm stone neutrals when used as a full-width slab.
        deep: {
          DEFAULT: "hsl(var(--deep))",
          soft: "hsl(var(--deep-soft))",
          raised: "hsl(var(--deep-raised))",
          foreground: "hsl(var(--deep-foreground))",
        },
        // Ramp keys intentionally removed: secondary-N was body-text ink, not a
        // brand scale. Use text-foreground / text-muted-foreground instead.
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          muted: "hsl(var(--success-muted))",
          strong: "hsl(var(--success-strong))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          muted: "hsl(var(--warning-muted))",
          strong: "hsl(var(--warning-strong))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
          muted: "hsl(var(--danger-muted))",
          strong: "hsl(var(--danger-strong))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          muted: "hsl(var(--info-muted))",
          strong: "hsl(var(--info-strong))",
        },
      },
      boxShadow: {
        // ── Elevation scale ────────────────────────────────────────────────
        // Five named tiers instead of free-floating sm/md/lg/xl. Previously
        // `shadow-md` served three unrelated roles (card hover, resting chrome,
        // tooltip surface) while `shadow-lg` had no defined slot at all.
        //
        // Tinted with a desaturated indigo rather than Tailwind's default
        // rgb(0 0 0): a pure-grey shadow is one reason the UI read as flat.
        // Alpha stays low so surfaces never look purple.
        //
        // ALL of these must be registered with tailwind-merge in
        // src/lib/utils.js — verified in phase 1 that twMerge classifies any
        // unknown `shadow-*` as a shadow COLOR, so an unregistered tier silently
        // loses to `shadow-lg` in the cascade instead of overriding it.
        xs: "0 1px 2px 0 hsl(244 30% 20% / 0.04)",
        rest: "0 1px 3px 0 hsl(244 30% 20% / 0.05), 0 1px 2px -1px hsl(244 30% 20% / 0.04)",
        lift: "0 8px 24px -6px hsl(244 30% 20% / 0.10), 0 2px 6px -2px hsl(244 30% 20% / 0.06)",
        float:
          "0 12px 32px -8px hsl(244 30% 20% / 0.14), 0 4px 10px -3px hsl(244 30% 20% / 0.08)",
        modal: "0 24px 64px -12px hsl(244 30% 20% / 0.24)",

        // Primary glow follows --primary (indigo). Named `primary-glow` rather
        // than `brand`: `brand` is the ORANGE accent colour key above, so
        // `shadow-brand` read as an orange glow and was applied to indigo
        // buttons, logos and pills — an indigo surface with an orange halo.
        "primary-glow": "0 4px 14px -2px hsl(var(--primary) / 0.28)",
        "primary-glow-lg": "0 10px 28px -4px hsl(var(--primary) / 0.32)",
        "nav-up": "0 -4px 20px hsl(244 30% 20% / 0.05)",
      },
      // Semantic type scale. Line-height and letter-spacing travel WITH the size
      // so every heading gets correct tracking automatically — previously only
      // 4 of 22 large headings had `tracking-tight`, which is why display type
      // looked loose and generic.
      //
      // Body sizes keep Tailwind's names (text-sm/base/lg) so the ~500 existing
      // usages stay valid; these tokens are additive, for headings only.
      // Line heights are looser than a typical English-only scale on purpose.
      // Vietnamese stacks diacritics BELOW the baseline (ạ, ặ, ụ, ệ) and ABOVE
      // it at the same time (ầ, ế), so the 1.05 that reads fine for Latin text
      // clips descenders and makes wrapped display lines collide.
      fontSize: {
        "display-lg": ["3.5rem", { lineHeight: "1.18", letterSpacing: "-0.03em" }],
        display: ["2.5rem", { lineHeight: "1.2", letterSpacing: "-0.025em" }],
        h1: ["1.875rem", { lineHeight: "1.3", letterSpacing: "-0.02em" }],
        h2: ["1.5rem", { lineHeight: "1.35", letterSpacing: "-0.015em" }],
        h3: ["1.125rem", { lineHeight: "1.45", letterSpacing: "-0.01em" }],
      },
      // Motion tokens. Previously 107 of 108 transitions specified no easing and
      // 82% specified no duration, so almost everything used the browser default
      // (150ms, ease) — technically fine but it reads as abrupt.
      transitionDuration: {
        fast: "150ms",
        base: "220ms",
        slow: "320ms",
      },
      transitionTimingFunction: {
        // Decelerating curve: quick to start, settles gently. The standard
        // "premium" feel; avoid ease-in-out which looks sluggish at both ends.
        "out-soft": "cubic-bezier(0.22, 1, 0.36, 1)",
      },
      borderRadius: {
        // Fully derived from --radius (0.75rem) so the whole scale moves
        // together. Previously `xl` kept Tailwind's default 0.75rem, which made
        // it render IDENTICALLY to `lg` — 53% of radius utilities in the app
        // were the same value spelled two ways.
        //
        // The tiers are semantic: inner chrome < interactive surface < container.
        sm: "calc(var(--radius) - 4px)", //  8px — chips, tiny controls
        md: "calc(var(--radius) - 2px)", // 10px
        lg: "var(--radius)", // 12px — inner chrome, buttons, inputs
        xl: "calc(var(--radius) + 4px)", // 16px — cards, panels
        "2xl": "calc(var(--radius) + 8px)", // 20px — containing surfaces
        "3xl": "calc(var(--radius) + 16px)", // 28px — hero-scale surfaces
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        display: ["Plus Jakarta Sans", "system-ui", "sans-serif"],
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "bounce-subtle": {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-4px)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "bounce-subtle": "bounce-subtle 0.4s ease-out",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
