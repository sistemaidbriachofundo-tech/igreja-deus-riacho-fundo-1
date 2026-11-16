import type { ComponentPropsWithoutRef } from "react";
import { UIIcon } from "./UIIcon";
import s from "./ui.module.css";

type Props = Omit<ComponentPropsWithoutRef<"input">, "type" | "className"> & { className?: string };

export function WorkspaceSearch({ className = "", ...input }: Props) {
  return (
    <label className={`${s.workspaceSearch} ${className}`}>
      <UIIcon name="search" size={18} />
      <input autoComplete="off" {...input} type="search" />
    </label>
  );
}
