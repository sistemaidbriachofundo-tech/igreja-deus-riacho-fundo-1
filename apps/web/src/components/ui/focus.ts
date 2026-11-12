const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

export function listFocusable(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (element) => {
      if (element.tabIndex < 0 || element.matches(":disabled")) return false;
      if (element.closest("[hidden], [inert]")) return false;
      if (element.getClientRects().length === 0) return false;
      if (element.getAttribute("aria-hidden") === "true") return false;
      return true;
    },
  );
}

/**
 * Próximo índice dentro de um ciclo de Tab.
 * current < 0 significa que o foco ainda está fora da lista.
 */
export function nextFocusIndex(
  current: number,
  count: number,
  shift: boolean,
): number {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  const delta = shift ? -1 : 1;
  return (current + delta + count) % count;
}
