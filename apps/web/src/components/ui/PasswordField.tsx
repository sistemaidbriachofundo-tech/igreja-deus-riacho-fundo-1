"use client";

import { useState, type InputHTMLAttributes } from "react";
import styles from "./ui.module.css";
import { Input } from "./Input";

type PasswordFieldProps = {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "id">;

/** Substitui o controle de 32 px. O botão fica ao lado do campo, com alvo de 44 px. */
export function PasswordField({ label, hint, error, id, ...rest }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);

  return (
    <Input
      id={id}
      label={label}
      hint={hint}
      error={error}
      type={visible ? "text" : "password"}
      suffix={
        <button
          type="button"
          className={styles.target}
          aria-pressed={visible}
          aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
          onClick={() => setVisible((value) => !value)}
        >
          {visible ? "Ocultar" : "Mostrar"}
        </button>
      }
      {...rest}
    />
  );
}
