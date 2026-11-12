"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { apiGet } from "../lib/api";
import styles from "./person-picker.module.css";

export type PersonOption = {
  id: string;
  displayName: string;
  kind?: string;
  email?: string | null;
  isMinor?: boolean;
};
type SearchResponse = { hits?: Array<{ person?: PersonOption }> };
type Props = {
  token: string;
  roles: readonly string[];
  label: string;
  value: string;
  onChange: (personId: string) => void;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  help?: string;
  selectedPerson?: PersonOption | null;
  options?: readonly PersonOption[];
  excludeIds?: readonly string[];
  adultsOnly?: boolean;
};

const searchRoles = ["PASTOR", "SECRETARIA", "PLATFORM_ADMIN"];

export function canSearchPersons(roles: readonly string[]): boolean {
  return roles.some((role) => searchRoles.includes(role));
}

export function filterPersonOptions(
  options: readonly PersonOption[],
  query: string,
  excludeIds: readonly string[] = [],
  adultsOnly = false,
): PersonOption[] {
  const normalized = (value: string) =>
    value
      .normalize("NFD")
      .replace(/\p{Diacritic}/gu, "")
      .toLocaleLowerCase("pt-BR");
  const term = normalized(query.trim());
  return options.filter(
    (person) =>
      !excludeIds.includes(person.id) &&
      !(adultsOnly && person.isMinor) &&
      normalized(person.displayName).includes(term),
  );
}

export function PersonPicker({
  token,
  roles,
  label,
  value,
  onChange,
  placeholder,
  required = false,
  disabled,
  help,
  selectedPerson,
  options,
  excludeIds = [],
  adultsOnly = false,
}: Props) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [selection, setSelection] = useState<PersonOption | null>(null);
  const [results, setResults] = useState<PersonOption[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">(
    "idle",
  );
  const [expanded, setExpanded] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [attempt, setAttempt] = useState(0);
  const canSearch = canSearchPersons(roles);
  const term = query.trim();
  const selectedName =
    selection?.id === value
      ? selection.displayName
      : selectedPerson?.id === value
        ? selectedPerson.displayName
        : "Pessoa selecionada";
  const source = options ?? results;
  const hits = filterPersonOptions(
    source,
    options ? term : "",
    excludeIds,
    adultsOnly,
  ).slice(0, 8);
  const listVisible = expanded && !value && term.length >= 2 && hits.length > 0;
  const ready = options !== undefined || status === "ready";

  useEffect(() => {
    if (!value && selection) {
      setSelection(null);
      setQuery("");
    }
  }, [value, selection]);

  useEffect(() => {
    if (listVisible && activeIndex >= 0) {
      resultsRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex, listVisible]);

  useEffect(() => {
    inputRef.current?.setCustomValidity(
      !value && (required || term.length > 0)
        ? "Escolha uma pessoa nos resultados da busca."
        : "",
    );
  }, [required, term, value]);

  useEffect(() => {
    if (!canSearch || options !== undefined || term.length < 2 || value) {
      setResults([]);
      setStatus("idle");
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setStatus("loading");
      void apiGet<SearchResponse>(
        `/persons/search?q=${encodeURIComponent(term)}&limit=8`,
        token,
      )
        .then((payload) => {
          if (cancelled) return;
          if (!Array.isArray(payload.hits))
            throw new Error("Invalid search response");
          setResults(
            payload.hits.flatMap((hit) =>
              hit.person?.id && hit.person.displayName ? [hit.person] : [],
            ),
          );
          setStatus("ready");
          setActiveIndex(-1);
        })
        .catch(() => {
          if (!cancelled) {
            setResults([]);
            setStatus("error");
          }
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [canSearch, token, term, value, attempt, options]);

  if (!canSearch && options === undefined) {
    return (
      <label className={styles.manual}>
        {label}
        <input
          required={required}
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={120}
          placeholder={placeholder ?? "Código do cadastro"}
        />
        <small>
          {help ?? "Use a referência de cadastro fornecida pela Secretaria."}
        </small>
      </label>
    );
  }

  function select(person: PersonOption) {
    setSelection(person);
    setQuery(person.displayName);
    setExpanded(false);
    setActiveIndex(-1);
    onChange(person.id);
    inputRef.current?.focus();
  }

  function clear() {
    setSelection(null);
    setQuery("");
    setResults([]);
    setExpanded(false);
    setActiveIndex(-1);
    onChange("");
    inputRef.current?.focus();
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape" && listVisible) {
      event.preventDefault();
      event.stopPropagation();
      setExpanded(false);
      return;
    }
    if (
      (event.key === "ArrowDown" || event.key === "ArrowUp") &&
      hits.length > 0 &&
      !value
    ) {
      event.preventDefault();
      setExpanded(true);
      setActiveIndex((index) =>
        event.key === "ArrowDown"
          ? (index + 1) % hits.length
          : index <= 0
            ? hits.length - 1
            : index - 1,
      );
    }
    if (
      event.key === "Enter" &&
      listVisible &&
      activeIndex >= 0 &&
      hits[activeIndex]
    ) {
      event.preventDefault();
      select(hits[activeIndex]);
    }
  }

  return (
    <div
      className={styles.picker}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setExpanded(false);
      }}
    >
      <label className={styles.searchLabel} htmlFor={inputId}>
        {label}
      </label>
      <div className={styles.control}>
        <input
          ref={inputRef}
          id={inputId}
          role="combobox"
          required={required}
          aria-required={required}
          aria-autocomplete="list"
          aria-expanded={listVisible}
          aria-controls={listVisible ? `${inputId}-results` : undefined}
          aria-activedescendant={
            listVisible && activeIndex >= 0 && activeIndex < hits.length
              ? `${inputId}-option-${activeIndex}`
              : undefined
          }
          aria-describedby={`${inputId}-help`}
          autoComplete="off"
          disabled={disabled}
          placeholder={placeholder ?? "Buscar pelo nome"}
          value={value ? selectedName : query}
          onFocus={() => setExpanded(true)}
          onKeyDown={onKey}
          onChange={(event) => {
            setSelection(null);
            setQuery(event.target.value);
            setResults([]);
            setStatus("idle");
            setActiveIndex(-1);
            setExpanded(true);
            if (value) onChange("");
          }}
        />
        {value && (
          <button
            type="button"
            disabled={disabled}
            className={styles.clear}
            aria-label={`Limpar seleção de ${label}`}
            onClick={clear}
          >
            Limpar
          </button>
        )}
      </div>
      {value ? (
        <p className={styles.selected} role="status">
          Selecionado: <strong>{selectedName}</strong>
        </p>
      ) : null}
      {!value && term.length >= 2 && status === "loading" && (
        <p className={styles.helper} role="status">
          Buscando pessoas…
        </p>
      )}
      {!value && term.length >= 2 && status === "error" && (
        <div className={styles.error} role="alert">
          <span>Não foi possível buscar pessoas.</span>
          <button
            type="button"
            onClick={() => {
              setAttempt((value) => value + 1);
              setExpanded(true);
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      {!value && term.length >= 2 && ready && hits.length === 0 && (
        <p className={styles.helper} role="status">
          Nenhuma pessoa encontrada. Tente outro nome.
        </p>
      )}
      {listVisible && (
        <div
          ref={resultsRef}
          className={styles.results}
          id={`${inputId}-results`}
          role="listbox"
          aria-label={`Resultados para ${label}`}
        >
          {hits.map((person, index) => (
            <button
              type="button"
              role="option"
              key={person.id}
              id={`${inputId}-option-${index}`}
              aria-selected={activeIndex === index}
              tabIndex={-1}
              className={styles.option}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => select(person)}
            >
              <span>{person.displayName}</span>
              <small>
                {person.email ??
                  (person.isMinor
                    ? "Menor de idade"
                    : person.kind === "VISITOR"
                      ? "Visitante"
                      : "Pessoa cadastrada")}
              </small>
            </button>
          ))}
        </div>
      )}
      <small className={styles.helper} id={`${inputId}-help`}>
        {help ?? "Digite pelo menos duas letras e escolha uma pessoa na lista."}
      </small>
    </div>
  );
}
