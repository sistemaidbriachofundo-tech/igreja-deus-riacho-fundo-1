"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { UIIcon } from "./UIIcon";
import s from "./ui.module.css";

export function FilterDisclosure({
  children, search, count = 0, mobileOnly = false, closeOnSubmit = false,
}: {
  children: ReactNode;
  search?: ReactNode;
  count?: number;
  mobileOnly?: boolean;
  closeOnSubmit?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);

  function closeAfterSubmit() {
    if (!trigger.current?.getClientRects().length) return;
    setOpen(false);
    trigger.current.focus();
  }

  return <div className={s.filterDisclosure} data-mobile-only={mobileOnly} onSubmit={closeOnSubmit ? closeAfterSubmit : undefined}>
    <div className={s.filterRail}>
      {search}
      <button ref={trigger} type="button" className={s.workspaceSecondary} aria-label={count > 0 ? `Filtros, ${count} ${count === 1 ? "selecionado" : "selecionados"}` : undefined} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}>
        <UIIcon name="filter" size={17} /> Filtros
        {count > 0 && <span className={s.filterCount} aria-hidden="true">{count}</span>}
      </button>
    </div>
    <div id={id} className={s.filterContent} data-open={open}>{children}</div>
  </div>;
}
