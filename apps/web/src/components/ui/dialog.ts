"use client";

import { useEffect, useRef, type RefObject } from "react";
import { listFocusable, nextFocusIndex } from "./focus";

export type DialogKeyAction =
  | { type: "close" }
  | { type: "focus"; index: number }
  | { type: "ignore" };

/** Escape fecha. Tab circula. Outras teclas não são capturadas. */
export function dialogKeyAction(
  key: string,
  shift: boolean,
  currentIndex: number,
  count: number,
): DialogKeyAction {
  if (key === "Escape") return { type: "close" };
  if (key !== "Tab") return { type: "ignore" };
  if (count <= 0) return { type: "focus", index: -1 };
  return { type: "focus", index: nextFocusIndex(currentIndex, count, shift) };
}

function inertOutside(dialog: HTMLElement): () => void {
  const root = document.body;
  const hidden: HTMLElement[] = [];

  function walk(node: HTMLElement) {
    for (const child of Array.from(node.children)) {
      if (!(child instanceof HTMLElement)) continue;
      if (child === dialog) continue;
      if (child.contains(dialog)) {
        walk(child);
        continue;
      }
      if (!child.hasAttribute("inert")) {
        child.setAttribute("inert", "");
        hidden.push(child);
      }
    }
  }

  walk(root);
  return () => {
    for (const element of hidden) element.removeAttribute("inert");
  };
}

export function useDialogLifecycle(
  open: boolean,
  onClose: () => void,
  dialogRef: RefObject<HTMLElement | null>,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (!dialog) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const release = inertOutside(dialog);
    dialog.focus();

    function onKey(event: KeyboardEvent) {
      if (!dialog) return;
      const items = listFocusable(dialog);
      const current = items.indexOf(document.activeElement as HTMLElement);
      const action = dialogKeyAction(event.key, event.shiftKey, current, items.length);
      if (action.type === "ignore") return;
      event.preventDefault();
      if (action.type === "close") {
        onCloseRef.current();
        return;
      }
      if (action.index < 0) {
        dialog.focus();
        return;
      }
      items[action.index]?.focus();
    }

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.body.style.overflow = previousOverflow;
      release();
      const restore = previous;
      requestAnimationFrame(() => {
        if (restore && document.contains(restore)) restore.focus();
      });
    };
  }, [open, dialogRef]);
}
