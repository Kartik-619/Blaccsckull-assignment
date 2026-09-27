const BRAND_TEAL = '#0D7C7C';
const BRAND_TEAL_DARK = '#0A5F5F';
const BRAND_TEAL_LIGHT = '#E6F4F4';

const plugin = require('tailwindcss/plugin');

/**
 * Android draws no shadow from `shadow-sm`: Tailwind's shadow utilities compile to
 * `boxShadow`, which NativeWind maps onto the iOS `shadow*` props only. RN's
 * Android shadow is the separate `elevation` prop, and NativeWind v4's preset
 * ships no class utility for it. This emits the missing `elevation-N` scale so a
 * card can carry both classes and let each platform pick up its own prop, instead
 * of branching on `Platform.OS` in the component.
 *
 * `matchUtilities` rather than `addUtilities`: `addUtilities` treats a bare key as
 * a raw selector and emits it *without* a leading dot, which silently produces a
 * rule nothing can match.
 */
const STEPS = [0, 1, 2, 3, 4, 5, 6, 8, 12, 16, 24];

const elevation = plugin(({ matchUtilities }) => {
  matchUtilities(
    { elevation: (value) => ({ elevation: value }) },
    { values: Object.fromEntries(STEPS.map((step) => [step, String(step)])) },
  );
});

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Single source of truth. `lib/colors.ts` re-exports the same literals
        // for the handful of places that need a value in JS rather than in a
        // className, and neither file may drift from the other.
        brand: {
          DEFAULT: BRAND_TEAL,
          dark: BRAND_TEAL_DARK,
          light: BRAND_TEAL_LIGHT,
        },
        // Trophy metals, named for the surfaces they are drawn on.
        medal: {
          gold: '#D4A017',
          silver: '#9CA3AF',
          bronze: '#B45309',
        },
        // The screen background. Named rather than reaching for gray-50 so the
        // page tint is a token in one place (AGENTS.md §6.1).
        background: '#F5F5F5',
      },
      borderRadius: {
        // AGENTS.md §6.2 asks for a 12px card radius; `xl` is 12px and `2xl`
        // is 16px, both of which appear in the design.
        card: '12px',
      },
    },
  },
  plugins: [elevation],
};
