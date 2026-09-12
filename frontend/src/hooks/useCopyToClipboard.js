import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Copy text and report success for a moment afterwards.
 *
 * Replaces three divergent inline implementations: one used optional chaining on
 * `navigator.clipboard`, one did not (so it threw in insecure contexts), and one
 * reported success with a native `alert()`.
 *
 * @param resetAfter ms before `copied` flips back; 0 keeps it latched
 * @returns { copied, copy } — `copy` resolves to true on success
 */
export default function useCopyToClipboard(resetAfter = 2000) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  useEffect(
    () => () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    },
    []
  );

  const copy = useCallback(
    async (text) => {
      const value = String(text ?? "");
      if (!value) return false;

      try {
        // Absent on http:// origins and in older browsers, so it must be
        // feature-detected rather than assumed.
        if (!navigator.clipboard?.writeText) return false;
        await navigator.clipboard.writeText(value);
        setCopied(true);
        if (resetAfter > 0) {
          if (timerRef.current) window.clearTimeout(timerRef.current);
          timerRef.current = window.setTimeout(() => setCopied(false), resetAfter);
        }
        return true;
      } catch {
        // Denied permission, or a document that isn't focused.
        return false;
      }
    },
    [resetAfter]
  );

  return { copied, copy };
}
