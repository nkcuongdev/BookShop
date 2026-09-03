/**
 * Presentation metadata for audit entries.
 *
 * Labels come from the API so the two sides cannot drift; what lives here is
 * purely visual — which colour and icon a category wears in the table.
 */
export const CATEGORY_TONES = {
  CATALOG: "info",
  INVENTORY: "info",
  ORDER: "outline",
  REFUND: "warning",
  ACCOUNT: "destructive",
};

/** Actions that take something away, shown in a warning tone. */
export const RESTRICTIVE_ACTIONS = new Set([
  "REFUND_REJECT",
  "USER_STATUS_CHANGE",
]);

export const categoryTone = (category) => CATEGORY_TONES[category] || "outline";
