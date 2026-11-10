import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import styles from "./ui.module.css";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  id?: string;
  suffix?: ReactNode;
};

function Field({
  label,
  hint,
  error,
  id,
  required,
  children,
}: FieldProps & { required?: boolean; children: (ids: { fieldId: string; describedBy?: string }) => ReactNode }) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={fieldId}>
        {label}
        {required ? <span className={styles.meta}> (obrigatório)</span> : null}
      </label>
      {children({ fieldId, describedBy })}
      {hint ? (
        <p id={hintId} className={styles.hint}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className={styles.fieldError} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputProps = FieldProps & Omit<InputHTMLAttributes<HTMLInputElement>, "id">;

export function Input({ label, hint, error, id, required, className, suffix, ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} id={id} required={required}>
      {({ fieldId, describedBy }) => {
        const control = (
          <input
            id={fieldId}
            className={[styles.control, className].filter(Boolean).join(" ")}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            {...rest}
          />
        );
        if (!suffix) return control;
        return (
          <div className={styles.controlRow}>
            {control}
            {suffix}
          </div>
        );
      }}
    </Field>
  );
}

type SelectProps = Omit<FieldProps, "suffix"> &
  SelectHTMLAttributes<HTMLSelectElement> & {
    options: readonly { value: string; label: string }[];
  };

export function Select({ label, hint, error, id, required, options, className, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} id={id} required={required}>
      {({ fieldId, describedBy }) => (
        <select
          id={fieldId}
          className={[styles.control, className].filter(Boolean).join(" ")}
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          {...rest}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}
