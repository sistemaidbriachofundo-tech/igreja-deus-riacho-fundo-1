"use client";

import type { ReactNode } from "react";
import { PageHeader } from "../ui/PageHeader";
import styles from "./serving.module.css";

export function ServingFrame({
  title,
  lead,
  children,
  personal = false,
}: {
  title: string;
  lead: string;
  children: ReactNode;
  personal?: boolean;
}) {
  return (
    <div className={personal ? styles.personalPage : styles.page}>
      <PageHeader appearance="workspace" heading="h1" title={title} description={lead} />
      {children}
    </div>
  );
}
