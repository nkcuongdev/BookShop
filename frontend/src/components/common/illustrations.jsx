/**
 * Inline SVG illustrations for empty and error states.
 *
 * Every one of the five empty/error surfaces in the app was a lucide icon in a
 * coloured box, which reads as "a control is missing" rather than "there is
 * nothing here yet".
 *
 * Hand-drawn rather than pulled from a pack: no new dependency, and using
 * `currentColor` plus token classes means they follow the theme automatically
 * instead of shipping baked-in hex.
 *
 * Conventions for all of these:
 *  - 160x120 viewBox, scaled by the caller
 *  - strokes use `currentColor` so the parent's text colour drives the line art
 *  - fills use `className` on the shape, so tokens (primary-100 etc.) apply
 *  - aria-hidden: they are decorative, the heading carries the meaning
 */

const SVG_PROPS = {
  viewBox: "0 0 160 120",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": "true",
};

/** Empty cart — a basket with nothing in it. */
export function EmptyCartIllustration({ className }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <ellipse cx="80" cy="106" rx="46" ry="6" className="fill-current opacity-[0.07]" />
      <path
        d="M38 44h84l-8 44a10 10 0 0 1-10 8H56a10 10 0 0 1-10-8L38 44Z"
        className="fill-primary-50"
      />
      <path
        d="M38 44h84l-8 44a10 10 0 0 1-10 8H56a10 10 0 0 1-10-8L38 44Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M60 44 70 22M100 44 90 22"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <path
        d="M64 62v20M80 62v20M96 62v20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="opacity-30"
      />
    </svg>
  );
}

/** No search results — a book with a magnifier. */
export function NoResultsIllustration({ className }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <ellipse cx="80" cy="106" rx="46" ry="6" className="fill-current opacity-[0.07]" />
      <rect x="42" y="26" width="52" height="66" rx="5" className="fill-primary-50" />
      <rect
        x="42"
        y="26"
        width="52"
        height="66"
        rx="5"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M52 42h32M52 54h32M52 66h20"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="opacity-30"
      />
      <circle cx="104" cy="70" r="18" className="fill-card" />
      <circle cx="104" cy="70" r="18" stroke="currentColor" strokeWidth="2.5" />
      <path
        d="m117 83 9 9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Nothing on the shelf — three books, one tipped over. */
export function EmptyShelfIllustration({ className }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <ellipse cx="80" cy="106" rx="46" ry="6" className="fill-current opacity-[0.07]" />
      <path
        d="M28 96h104"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="46" y="46" width="16" height="50" rx="2" className="fill-primary-50" />
      <rect
        x="46"
        y="46"
        width="16"
        height="50"
        rx="2"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <rect x="68" y="34" width="16" height="62" rx="2" className="fill-primary-100" />
      <rect
        x="68"
        y="34"
        width="16"
        height="62"
        rx="2"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <rect
        x="92"
        y="76"
        width="44"
        height="16"
        rx="2"
        transform="rotate(-6 92 76)"
        className="fill-primary-50"
      />
      <rect
        x="92"
        y="76"
        width="44"
        height="16"
        rx="2"
        transform="rotate(-6 92 76)"
        stroke="currentColor"
        strokeWidth="2.5"
      />
    </svg>
  );
}

/** Something broke — a page with a torn corner. */
export function ErrorIllustration({ className }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <ellipse cx="80" cy="106" rx="46" ry="6" className="fill-current opacity-[0.07]" />
      <path
        d="M50 20h40l22 22v54a4 4 0 0 1-4 4H54a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4Z"
        className="fill-danger-muted"
      />
      <path
        d="M50 20h40l22 22v54a4 4 0 0 1-4 4H54a4 4 0 0 1-4-4V24a4 4 0 0 1 4-4Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M90 20v18a4 4 0 0 0 4 4h18"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="M81 56v18"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="81" cy="84" r="2.5" fill="currentColor" />
    </svg>
  );
}

/** Lost — a signpost with nothing on it. */
export function NotFoundIllustration({ className }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <ellipse cx="80" cy="106" rx="46" ry="6" className="fill-current opacity-[0.07]" />
      <path
        d="M80 100V26"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <rect x="36" y="34" width="52" height="20" rx="3" className="fill-primary-50" />
      <rect
        x="36"
        y="34"
        width="52"
        height="20"
        rx="3"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <rect x="80" y="62" width="46" height="20" rx="3" className="fill-primary-100" />
      <rect
        x="80"
        y="62"
        width="46"
        height="20"
        rx="3"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M48 44h16M92 72h14"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="opacity-30"
      />
    </svg>
  );
}

/** No reviews yet — speech bubble with a star. */
export function NoReviewsIllustration({ className }) {
  return (
    <svg {...SVG_PROPS} className={className}>
      <ellipse cx="80" cy="106" rx="46" ry="6" className="fill-current opacity-[0.07]" />
      <path
        d="M36 30h88a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H74l-18 16V82H36a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6Z"
        className="fill-primary-50"
      />
      <path
        d="M36 30h88a6 6 0 0 1 6 6v40a6 6 0 0 1-6 6H74l-18 16V82H36a6 6 0 0 1-6-6V36a6 6 0 0 1 6-6Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <path
        d="m80 44 4.6 9.3 10.4 1.5-7.5 7.3 1.8 10.3L80 67.6l-9.3 4.8 1.8-10.3-7.5-7.3 10.4-1.5L80 44Z"
        className="fill-warning"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
