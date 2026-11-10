"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { UIIcon } from "../AppShell";
import { CredentialFaces } from "./CredentialCard";
import type { CredentialCard, QrCheck } from "./credential-model";
import s from "./credentials.module.css";

export function CredentialViewer({
  card,
  loading,
  error,
  verification,
  busy,
  canRevoke,
  onClose,
  onDownload,
  onPrint,
  onVerify,
  onRevoke,
}: {
  card: CredentialCard | null;
  loading: boolean;
  error: string;
  verification: QrCheck | null;
  busy: boolean;
  canRevoke: boolean;
  onClose: () => void;
  onDownload: () => void;
  onPrint: () => void;
  onVerify: () => void;
  onRevoke: () => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (typeof document === "undefined") return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previous?.focus();
    };
  }, []);

  const node = (
    <div className={`${s.viewer} idbrf-credential-viewer`} role="dialog" aria-modal="true" aria-labelledby={titleId} data-credential-open="true">
      <style>{"@media print{body>*:not(.idbrf-credential-viewer){display:none!important}}"}</style>
      <button type="button" className={`${s.backdrop} ${s.noPrint}`} aria-label="Fechar carteirinha" onClick={onClose} />
      <div className={s.sheet}>
        <header className={`${s.sheetHead} ${s.noPrint}`}>
          <div>
            <p className={s.kicker}>Carteirinha</p>
            <h2 id={titleId}>{card?.displayName ?? "Visualizar carteirinha"}</h2>
          </div>
          <button ref={closeRef} type="button" className={s.iconButton} onClick={onClose} aria-label="Fechar">
            <UIIcon name="close" size={18} />
          </button>
        </header>
        {loading ? <p className={s.loading} role="status">Abrindo a carteirinha…</p> : null}
        {error ? <p className={s.alert} role="alert">{error}</p> : null}
        {card?.status === "REVOKED" ? (
          <p className={s.revokedBanner} role="status">Revogada. O QR não confirma esta credencial.</p>
        ) : null}
        {card ? <CredentialFaces card={card} verification={verification} /> : null}
        <div className={`${s.actions} ${s.noPrint}`}>
          <button type="button" onClick={onDownload} disabled={busy || !card}>Baixar PDF</button>
          <button type="button" onClick={onPrint} disabled={!card}>Imprimir</button>
          <button type="button" onClick={onVerify} disabled={busy || !card}>Conferir QR</button>
          {canRevoke && card?.status === "ACTIVE" ? (
            <button type="button" className={s.danger} onClick={onRevoke} disabled={busy}>Revogar</button>
          ) : null}
        </div>
      </div>
    </div>
  );

  return mount(node);
}

function mount(node: ReactNode) {
  if (typeof document === "undefined") return node;
  return createPortal(node, document.body);
}
