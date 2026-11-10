"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import styles from "./ui.module.css";
import { nextTabIndex } from "./tabs";

export type TabItem = {
  id: string;
  label: string;
  panel: ReactNode;
};

export function Tabs({ label, tabs }: { label: string; tabs: readonly TabItem[] }) {
  const [current, setCurrent] = useState(0);
  const baseId = useId();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);

  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    const next = nextTabIndex(current, tabs.length, event.key);
    if (next === null) return;
    event.preventDefault();
    setCurrent(next);
    buttons.current[next]?.focus();
  }

  return (
    <div className={styles.tabs}>
      <div role="tablist" aria-label={label} className={styles.tabList} onKeyDown={onKey}>
        {tabs.map((tab, index) => {
          const selected = index === current;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                buttons.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              className={styles.tab}
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => setCurrent(index)}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab, index) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${baseId}-panel-${tab.id}`}
          aria-labelledby={`${baseId}-tab-${tab.id}`}
          hidden={index !== current}
          tabIndex={0}
          className={styles.tabPanel}
        >
          {tab.panel}
        </div>
      ))}
    </div>
  );
}
