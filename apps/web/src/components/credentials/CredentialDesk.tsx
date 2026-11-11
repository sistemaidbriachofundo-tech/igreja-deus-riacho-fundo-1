"use client";

import { useMemo, useRef, useState } from "react";
import { UIIcon } from "../AppShell";
import { PersonPortrait } from "../PersonPortrait";
import { Alert } from "../ui/Alert";
import { useActionConfirmation } from "../ui/ActionConfirmation";
import {
  downloadCredentialPdf,
  issueCredential,
  openCredential,
  openCredentialByMembership,
  revokeCredential,
  verifyCredentialQr,
} from "./credential-api";
import { CredentialViewer } from "./CredentialViewer";
import {
  credentialFailure,
  registrationLabel,
  rowStatus,
  type CredentialCard,
  type CredentialMembershipRow,
  type QrCheck,
} from "./credential-model";
import s from "./credentials.module.css";

export type CredentialDeskProps = {
  token: string | null;
  canManage: boolean;
  memberships: CredentialMembershipRow[];
  ownCard: CredentialCard | null;
  onReload?: () => Promise<void> | void;
  /** Cartão local só para conferência visual em desenvolvimento. Não grava nada. */
  previewCard?: CredentialCard | null;
  initialOpen?: boolean;
};

/**
 * Mesa integrável em view=cards.
 * A abertura usa GET /credentials/:id ou /credentials/by-membership/:membershipId.
 * Emissão e revogação continuam nos POST já auditados.
 */
export function CredentialDesk({
  token,
  canManage,
  memberships,
  ownCard,
  onReload,
  previewCard = null,
  initialOpen = false,
}: CredentialDeskProps) {
  const { confirm, confirmation } = useActionConfirmation();
  const readVersion = useRef(0);
  const [selectedRow, setSelectedRow] = useState<CredentialMembershipRow | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | "ACTIVE" | "PENDING">("ALL");
  const [notice, setNotice] = useState("");
  const [banner, setBanner] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(initialOpen && Boolean(previewCard));
  const [loading, setLoading] = useState(false);
  const [card, setCard] = useState<CredentialCard | null>(initialOpen ? previewCard : null);
  const [viewerError, setViewerError] = useState("");
  const [verification, setVerification] = useState<QrCheck | null>(null);

  const rows = useMemo(() => {
    if (canManage) return memberships;
    if (ownCard) {
      return [{
        membershipId: ownCard.membershipId,
        personId: ownCard.personId,
        displayName: ownCard.displayName,
        membershipStatus: "ACTIVE",
        activeCredentialId: ownCard.status === "ACTIVE" ? ownCard.id : null,
      } satisfies CredentialMembershipRow];
    }
    return memberships;
  }, [canManage, memberships, ownCard]);

  const visible = rows.filter((row) => {
    const status = row.activeCredentialId ? "ACTIVE" : "PENDING";
    if (filter === "ACTIVE" && status !== "ACTIVE") return false;
    if (filter === "PENDING" && status !== "PENDING") return false;
    const haystack = [row.displayName, row.membershipId, row.personId].join(" ").toLocaleLowerCase("pt-BR");
    return haystack.includes(query.trim().toLocaleLowerCase("pt-BR"));
  });

  function resetViewer() {
    setVerification(null);
    setViewerError("");
  }

  function closeViewer() {
    if (busy) return;
    readVersion.current += 1;
    setLoading(false);
    setSelectedRow(null);
    setOpen(false);
  }

  async function show(row: CredentialMembershipRow) {
    if (busy) return;
    const version = ++readVersion.current;
    setSelectedRow(row);
    setNotice("");
    setOpen(true);
    resetViewer();
    if (previewCard && !token) {
      setCard(previewCard);
      setLoading(false);
      return;
    }
    if (!token) {
      setCard(null);
      setLoading(false);
      setSelectedRow(null);
      setViewerError("Entre na sua conta para abrir a carteirinha.");
      return;
    }
    setLoading(true);
    setCard(null);
    try {
      const loaded = row.activeCredentialId
        ? await openCredential(token, row.activeCredentialId)
        : await openCredentialByMembership(token, row.membershipId);
      if (version === readVersion.current) setCard(loaded);
    } catch (error) {
      if (version !== readVersion.current) return;
      const failure = credentialFailure(error);
      if (failure.status && failure.status < 500 && failure.status !== 429) setSelectedRow(null);
      setViewerError(failure.message);
    } finally {
      if (version === readVersion.current) setLoading(false);
    }
  }

  async function issue(membershipId: string) {
    if (!token) {
      setBanner("Entre com sua conta para emitir a carteirinha.");
      return;
    }
    setBusy(true);
    setBanner("");
    setNotice("");
    try {
      const issued = await issueCredential(token, membershipId);
      setCard(issued);
      setOpen(true);
      resetViewer();
      setNotice("Carteirinha emitida.");
      await onReload?.();
    } catch (error) {
      const failure = credentialFailure(error);
      if (failure.status === 409 && /^Já existe/.test(failure.message)) {
        try {
          const existing = await openCredentialByMembership(token, membershipId);
          setCard(existing);
          setOpen(true);
          resetViewer();
          setNotice("Carteirinha ativa encontrada.");
          await onReload?.();
          return;
        } catch {
          // A lista pode ter mudado de novo depois do conflito.
        }
      }
      setBanner(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(credentialId: string, displayName: string) {
    if (busy) return;
    const reportError = open ? setViewerError : setBanner;
    if (!token) {
      reportError("Entre com sua conta para revogar a carteirinha.");
      return;
    }
    const accepted = await confirm({
      title: "Revogar carteirinha?",
      subject: displayName,
      description: "A carteirinha perderá a validade. O QR passará a indicar que ela foi revogada.",
      action: "Revogar carteirinha",
      cancel: "Manter ativa",
      tone: "danger",
    });
    if (!accepted) return;

    setBusy(true);
    setBanner("");
    setNotice("");
    resetViewer();
    try {
      const revoked = await revokeCredential(token, credentialId);
      setCard({ ...revoked, status: "REVOKED" });
      setOpen(true);
      try {
        const detail = await openCredential(token, revoked.id);
        setCard(detail);
        setVerification(await verifyCredentialQr(detail.qrPayload));
      } catch {
        setViewerError("A carteirinha foi revogada. Use Conferir QR para consultar a validação novamente.");
      }
      await onReload?.();
    } catch (error) {
      reportError(credentialFailure(error).message);
    } finally {
      setBusy(false);
    }
  }

  async function download() {
    if (!token || !card) {
      setViewerError("Entre com sua conta para baixar o PDF.");
      return;
    }
    setBusy(true);
    setNotice("");
    setViewerError("");
    try {
      await downloadCredentialPdf(token, card.id);
      setNotice("Download do PDF iniciado.");
    } catch (error) {
      setViewerError(credentialFailure(error).message);
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    if (!card) return;
    if (previewCard && !token) {
      setViewerError("Entre com sua conta para conferir o QR.");
      return;
    }
    setBusy(true);
    setViewerError("");
    try {
      setVerification(await verifyCredentialQr(card.qrPayload));
    } catch (error) {
      setViewerError(credentialFailure(error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={s.desk} aria-labelledby="credential-desk-title">
      <header className={s.deskHead}>
        <div>
          <h2 id="credential-desk-title">Carteirinhas da congregação</h2>
        </div>
      </header>
      {!open && (notice || banner || busy) && (
        <div className={s.feedback}>
          {notice && <Alert appearance="workspace" tone="success" title={notice} onDismiss={() => setNotice("")} />}
          {banner && <Alert appearance="workspace" tone="danger" title="Não foi possível concluir a ação">{banner}</Alert>}
          {busy && <Alert appearance="workspace" tone="info" title="Salvando alteração…" />}
        </div>
      )}

      <div className={s.controls}>
        <label className={s.search}>
          <UIIcon name="search" size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por nome ou matrícula"
            aria-label="Pesquisar carteirinhas"
          />
        </label>
        <div className={s.filters} role="group" aria-label="Filtrar carteirinhas">
          {([
            ["ALL", "Todas"],
            ["ACTIVE", "Ativas"],
            ["PENDING", "Pendentes"],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              className={filter === id ? s.filterOn : s.filter}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className={s.list}>
        {visible.map((row) => (
          <article key={row.membershipId} className={s.row}>
            <button type="button" className={s.rowMain} disabled={!row.activeCredentialId} onClick={() => void show(row)}>
              <PersonPortrait name={row.displayName} size="medium" />
              <span>
                <strong>{row.displayName}</strong>
                <small>Matrícula {registrationLabel(row.membershipId)}</small>
              </span>
              <span className={row.activeCredentialId ? s.badgeOn : s.badgeOff}>{rowStatus(row.activeCredentialId)}</span>
            </button>
            <div className={s.rowActions}>
              {row.activeCredentialId && <button type="button" onClick={() => void show(row)}>Visualizar</button>}
              {canManage ? (
                <button
                  type="button"
                  className={row.activeCredentialId ? s.quiet : undefined}
                  disabled={busy}
                  onClick={() => void (row.activeCredentialId ? revoke(row.activeCredentialId, row.displayName) : issue(row.membershipId))}
                >
                  {row.activeCredentialId ? "Revogar" : "Emitir"}
                </button>
              ) : null}
            </div>
          </article>
        ))}
        {visible.length === 0 ? (
          <p className={s.empty}>
            {rows.length === 0
              ? "Nenhuma carteirinha disponível para este perfil."
              : "Nenhuma carteirinha corresponde à pesquisa."}
          </p>
        ) : null}
      </div>

      {open ? (
        <CredentialViewer
          card={card}
          loading={loading}
          error={viewerError}
          notice={notice}
          onRetry={selectedRow ? () => void show(selectedRow) : undefined}
          verification={verification}
          busy={busy}
          canRevoke={canManage}
          onClose={closeViewer}
          onDownload={() => void download()}
          onPrint={() => window.print()}
          onVerify={() => void verify()}
          onRevoke={() => { if (card) void revoke(card.id, card.displayName); }}
        />
      ) : null}
      {confirmation}
    </section>
  );
}
