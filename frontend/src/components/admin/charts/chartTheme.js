/**
 * Screen-theme tokens mirrored as literal hex, for recharts.
 *
 * Recharts takes SVG props (fill/stroke), not Tailwind classes, so these cannot
 * be class names. Literal hex rather than reading CSS variables at runtime,
 * because getComputedStyle returns the raw triplet ("244 58% 51%") which is not
 * a valid SVG paint, returns "" under jsdom in vitest (silently making marks
 * invisible), and buys nothing in a light-only build.
 *
 * SYNC CONTRACT: these must match --primary / --muted / --border /
 * --muted-foreground / --card / --foreground in src/index.css. If dark mode is
 * ever enabled, promote this module to a hook that switches on the `.dark` class
 * instead of editing the values here.
 */
export const chartTheme = {
  brand: "#4338CA", // --primary            indigo-700
  brandLight: "#6366F1", // --primary-500
  grid: "#F4F4F5", // --muted
  axis: "#71717A", // --muted-foreground
  border: "#E4E4E7", // --border
  surface: "#FFFFFF", // --card
  ink: "#18181B", // --foreground
};

/**
 * Categorical series palette — for data where each slice is a separate
 * CATEGORY, not a point on a scale.
 *
 * The palette this replaces was ["#ed7620","#f19340","#fad7ac","#3b82f6",
 * "#8b5cf6"] — a sequential orange ramp misused as categorical. Measured:
 * slices 1 and 2 were only 3° apart in hue at 1.25:1 contrast, i.e. not
 * distinguishable at a 30px arc width.
 *
 * This palette alternates DARK and LIGHT rather than only rotating hue, which
 * is what makes it survive both greyscale printing and colour blindness:
 *   - adjacent pairs: >=1.86:1 normal vision
 *   - adjacent pairs: >=2.63:1 under simulated deuteranopia (~6% of men)
 *     (a hue-only palette scored 1.00:1 here — blue-500 and violet-500 are
 *      literally the same colour to a deuteranope)
 *   - luminance is non-monotonic, so the order does not read as a scale
 *
 * Six entries, not five: CategoryPieChart is fed live category data, and the
 * `% length` wrap would otherwise make slice 6 identical to slice 1 while
 * sitting right next to it.
 */
export const chartSeries = [
  "#312E81", // indigo-900  (dark)
  "#F97316", // orange-500  (light)
  "#047C56", // emerald-700 (dark)
  "#60A5FA", // blue-400    (light)
  "#7E22CE", // purple-700  (dark)
  "#F472B6", // pink-400    (light)
];
