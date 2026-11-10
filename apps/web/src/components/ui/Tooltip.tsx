"use client";

import { cloneElement, useEffect, useId, useRef, type ReactElement } from "react";
import styles from "./ui.module.css";

type TriggerProps = {
  className?: string;
  "aria-describedby"?: string;
};

export function Tooltip({ content, children }: { content: string; children: ReactElement<TriggerProps> }) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const describedBy = [children.props["aria-describedby"], id].filter(Boolean).join(" ");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      const root = rootRef.current;
      if (!root || !root.contains(document.activeElement)) return;
      event.preventDefault();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  return (
    <span ref={rootRef} className={styles.tooltip}>
      {cloneElement(children, { "aria-describedby": describedBy })}
      <span id={id} role="tooltip" className={styles.tooltipBubble}>
        {content}
      </span>
    </span>
  );
}
