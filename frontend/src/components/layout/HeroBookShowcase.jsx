import { useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import "@/components/layout/HeroBookShowcase.css";

/**
 * The hero's visual centrepiece: five books as real CSS 3D solids on a shelf
 * that tilts toward the pointer.
 *
 * The books are FIXED ARTWORK, not catalogue data:
 *
 *  - Nothing is fetched, so the shelf is identical on first paint and can never
 *    shift, flash a placeholder, or empty out when the API is slow or down.
 *  - The covers are drawn in CSS — gradient stock, a printed emblem, a foil
 *    rule, paper grain — so they read as designed objects rather than as five
 *    arbitrary product photos at five crops and colour temperatures.
 *  - Nothing links anywhere. A decorative shelf that navigates would send a
 *    visitor to a product they did not choose; the hero's real calls to action
 *    live in the copy beside it.
 *
 * The geometry and all the cover artwork live in HeroBookShowcase.css, ported
 * from the approved prototype. This file supplies the content and the pointer
 * tracking; it deliberately sets no geometry of its own, so the shipped hero
 * cannot drift from the design that was signed off.
 */

/**
 * Slot classes map to the CSS: `hs-book--c` is the centre (largest, nearest,
 * least turned), stepping out to `hs-book--far-l` / `hs-book--far-r`.
 */
const SHELF = [
  {
    id: "cay-cam-ngot",
    slot: "hs-book--far-l",
    motif: "hs-cover--arcs",
    kicker: "Văn học",
    title: "Cây Cam Ngọt Của Tôi",
    spineText: "Cây Cam Ngọt",
    author: "J. M. de Vasconcelos",
    cover: "linear-gradient(150deg,#8B5CF6,#6D28D9)",
    spine: "linear-gradient(180deg,#6D28D9,#4C1D95)",
    float: { "--fd": "9.2s", "--fdel": "-3.4s" },
    glyph: "tree",
  },
  {
    id: "tuoi-tre",
    slot: "hs-book--l",
    motif: "hs-cover--rings",
    kicker: "Kỹ năng",
    title: "Tuổi Trẻ Đáng Giá Bao Nhiêu",
    spineText: "Tuổi Trẻ Đáng Giá",
    author: "Rosie Nguyễn",
    cover: "linear-gradient(150deg,#FB923C,#EA580C 64%,#C2410C)",
    spine: "linear-gradient(180deg,#EA580C,#9A3412)",
    float: { "--fd": "8.4s", "--fdel": "-1.2s" },
    glyph: "compass",
  },
  {
    id: "nha-gia-kim",
    slot: "hs-book--c",
    motif: "hs-cover--rays",
    kicker: "Bán chạy nhất",
    title: "Nhà Giả Kim",
    spineText: "Nhà Giả Kim",
    author: "Paulo Coelho",
    cover: "linear-gradient(150deg,#818CF8,#4F46E5 54%,#4338CA)",
    spine: "linear-gradient(180deg,#4338CA,#312E81)",
    float: { "--fd": "7s" },
    glyph: "sun",
  },
  {
    id: "dac-nhan-tam",
    slot: "hs-book--r",
    motif: "hs-cover--weave",
    kicker: "Kinh doanh",
    title: "Đắc Nhân Tâm",
    spineText: "Đắc Nhân Tâm",
    author: "Dale Carnegie",
    cover: "linear-gradient(150deg,#2DD4BF,#0D9488 60%,#0F766E)",
    spine: "linear-gradient(180deg,#0F766E,#134E4A)",
    float: { "--fd": "9.1s", "--fdel": "-2.6s" },
    glyph: "people",
  },
  {
    id: "muon-kiep",
    slot: "hs-book--far-r",
    motif: "hs-cover--dots",
    kicker: "Tâm linh",
    title: "Muôn Kiếp Nhân Sinh",
    spineText: "Muôn Kiếp",
    author: "Nguyên Phong",
    cover: "linear-gradient(150deg,#FB7185,#E11D48)",
    spine: "linear-gradient(180deg,#E11D48,#9F1239)",
    float: { "--fd": "10.1s", "--fdel": "-5.1s" },
    glyph: "lotus",
  },
];

/**
 * Emblems, chosen for what each book is about — a sprout for the orange tree, a
 * compass for finding your direction — rather than as generic decoration.
 */
const GLYPH = {
  tree: (
    <>
      <path d="M12 21v-7" />
      <path d="M12 14c0-3 2-5 5-5 0 3-2 5-5 5z" />
      <path d="M12 14c0-3-2-5-5-5 0 3 2 5 5 5z" />
      <circle cx="12" cy="6" r="2.6" />
    </>
  ),
  compass: (
    <>
      <circle cx="12" cy="12" r="8.4" />
      <path d="M15.3 8.7l-2 5.3-5.3 2 2-5.3z" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="9.6" r="3.6" />
      <path d="M12 2.6v1.8M12 14.8v1.4M4.6 9.6H3M21 9.6h-1.6M6.8 4.4L5.7 3.3M18.3 3.3l-1.1 1.1" />
      <path d="M3 19.4c2.6 0 3.2-1.7 5.2-1.7s2.6 1.7 5.2 1.7 3-1.7 5-1.7" />
      <path d="M3 22c2.6 0 3.2-1.4 5.2-1.4s2.6 1.4 5.2 1.4 3-1.4 5-1.4" />
    </>
  ),
  people: (
    <>
      <circle cx="8.4" cy="8" r="2.7" />
      <circle cx="16" cy="8" r="2.7" />
      <path d="M3.6 19.2c0-2.7 2.1-4.5 4.8-4.5s4.8 1.8 4.8 4.5" />
      <path d="M14.2 15.1c.6-.3 1.2-.4 1.8-.4 2.7 0 4.4 1.8 4.4 4.5" />
    </>
  ),
  lotus: (
    <>
      <path d="M12 20.4c-4.6 0-8.4-2.6-8.4-5.6 1.7 0 3 .5 4 1.2" />
      <path d="M12 20.4c4.6 0 8.4-2.6 8.4-5.6-1.7 0-3 .5-4 1.2" />
      <path d="M12 20.4c-2.8-1.9-4.3-4.4-4.3-7 0-2.5 1.6-4.9 4.3-6.8 2.7 1.9 4.3 4.3 4.3 6.8 0 2.6-1.5 5.1-4.3 7z" />
    </>
  ),
};

/** One book: cover, spine, page block, top edge — a solid, not a rectangle. */
function ShelfBook({ book }) {
  return (
    <div className={cn("hs-book", book.slot)}>
      <div className="hs-float" style={book.float}>
        <div className={cn("hs-cover", book.motif)} style={{ "--cover-bg": book.cover }}>
          <span className="hs-cover-mark">{book.kicker}</span>

          <span className="hs-cover-art">
            <span className="hs-motif" />
            <svg
              className="hs-cover-glyph"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {GLYPH[book.glyph]}
            </svg>
          </span>

          <span className="hs-cover-body">
            <span className="hs-cover-rule" />
            <span className="hs-cover-title">{book.title}</span>
            <span className="hs-cover-author">{book.author}</span>
          </span>

          <span className="hs-cover-grain" />
        </div>

        <div className="hs-spine" style={{ "--spine-bg": book.spine }}>
          <span className="hs-spine-text">{book.spineText}</span>
        </div>
        <div className="hs-pages" />
        <div className="hs-top-edge" />
        <div className="hs-reflection" style={{ "--cover-bg": book.cover }} />
      </div>
    </div>
  );
}

/**
 * @param className positioning from the caller; the shelf owns its own layout
 */
export default function HeroBookShowcase({ className }) {
  const stageRef = useRef(null);
  const rigRef = useRef(null);
  const frame = useRef(null);

  /** Shallow on purpose: past ~9° the perspective distortion reads as a
      funhouse mirror rather than as a shelf you are leaning toward. */
  const MAX_Y = 9;
  const MAX_X = 6;

  const reset = useCallback(() => {
    const stage = stageRef.current;
    const rig = rigRef.current;
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
      frame.current = null;
    }
    if (!stage || !rig) return;
    stage.classList.remove("hs-tracking");
    rig.style.setProperty("--ry", "0deg");
    rig.style.setProperty("--rx", "0deg");
    stage
      .querySelectorAll(".hs-cover")
      .forEach((c) => c.style.setProperty("--sheen-x", "0"));
  }, []);

  const onPointerMove = useCallback((event) => {
    // Coarse pointers have no hover: on touch the "tilt" would only fire mid-tap
    // and read as a glitch.
    if (event.pointerType !== "mouse") return;
    // Guarded: matchMedia is absent in jsdom and in some embedded webviews, and
    // an unguarded call here throws inside a pointer handler — which takes the
    // whole hero down rather than just skipping the tilt.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return;

    const stage = stageRef.current;
    const rig = rigRef.current;
    if (!stage || !rig) return;

    const rect = stage.getBoundingClientRect();
    const px = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width) * 2 - 1));
    const py = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height) * 2 - 1));

    // Dropping the transition while tracking is what makes the tilt feel
    // attached to the cursor rather than lagging behind it.
    stage.classList.add("hs-tracking");
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      rig.style.setProperty("--ry", `${(px * MAX_Y).toFixed(2)}deg`);
      rig.style.setProperty("--rx", `${(-py * MAX_X).toFixed(2)}deg`);
      // The specular sweep tracks the same axis, so the highlight moves as if
      // lit from where the cursor is.
      const sheen = (px * 42).toFixed(1);
      stage
        .querySelectorAll(".hs-cover")
        .forEach((c) => c.style.setProperty("--sheen-x", sheen));
    });
  }, []);

  // A pending rAF after unmount would write to a detached node.
  useEffect(() => () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
  }, []);

  return (
    <div className={cn("hs-showcase", className)} aria-hidden>
      <div
        ref={stageRef}
        className="hs-stage"
        onPointerMove={onPointerMove}
        onPointerLeave={reset}
      >
        <div ref={rigRef} className="hs-rig">
          {SHELF.map((book) => (
            <ShelfBook key={book.id} book={book} />
          ))}
        </div>
        <span className="hs-shelf-line" />
      </div>
    </div>
  );
}
