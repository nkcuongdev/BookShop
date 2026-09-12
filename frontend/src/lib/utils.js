import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tailwind-merge classifies any unknown `shadow-*` value as a shadow COLOR, so
// out of the box `cn("shadow-primary-glow", "shadow-lg")` keeps both classes and
// the cascade silently drops the glow. Registering our custom shadows in the
// `shadow` group makes them conflict with shadow-sm/md/lg/xl as intended.
//
// Every custom name in tailwind.config.js boxShadow MUST be listed here. An
// omission does not error — the class just stops overriding, which is invisible
// until someone notices a missing shadow.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      shadow: [
        {
          shadow: [
            // elevation tiers
            "xs",
            "rest",
            "lift",
            "float",
            "modal",
            // primary (indigo) glow
            "primary-glow",
            "primary-glow-lg",
            "nav-up",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs) {
  return twMerge(clsx(inputs));
}
