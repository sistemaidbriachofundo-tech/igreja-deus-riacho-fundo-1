"use client";

import { useEffect, useState } from "react";
import { apiGet } from "../../lib/api";
import { CredentialFaces } from "../credentials/CredentialCard";
import { downloadCredentialPdf, verifyCredentialQr } from "../credentials/credential-api";
import type { CredentialCard, QrCheck } from "../credentials/credential-model";
import { credentialFailure } from "../credentials/credential-model";
import s from "./my-credential.module.css";

type Status = "loading" | "ready" | "empty" | "error";
type Issuance = "ISSUED" | "REVOKED" | "NOT_ISSUED" | "NO_MEMBERSHIP" | "NO_PERSON";
type OwnCredential = { card: CredentialCard | null; issuance?: Issuance; membershipId?: string | null };

function emptyCopy(issuance?: Issuance): { title: string; detail: string } {
  if (issuance === "NOT_ISSUED") {
    return {
      title: "Sua matrícula está ativa e a carteirinha ainda não foi emitida.",
      detail: "A secretaria emite o documento. O cargo no sistema não entra na carteirinha e não substitui a matrícula.",
    };
  }
  if (issuance === "NO_MEMBERSHIP") {
    return {
      title: "Não há matrícula ativa vinculada a esta conta.",
      detail: "Sem matrícula, não há carteirinha para abrir.",
    };
  }
  if (issuance === "NO_PERSON") {
    return {
      title: "Esta conta ainda não está vinculada a uma pessoa da congregação.",
      detail: "A carteirinha só existe para a pessoa vinculada ao acesso.",
    };
  }
  return {
    title: "A carteirinha ainda não foi emitida.",
    detail: "Se você já é membro, procure a Secretaria para confirmar sua matrícula e solicitar a emissão. Seu cargo no sistema não emite automaticamente um documento.",
  };
}

export function MyCredentialSection({ token }: { token: string }) {
  const [card, setCard] = useState<CredentialCard | null>(null);
  const [phase, setPhase] = useState<Status>("loading");
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [verification, setVerification] = useState<QrCheck | null>(null);
  const [issuance, setIssuance] = useState<Issuance | undefined>();
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let live = true;
    setPhase("loading");
    setProblem("");
    void apiGet<OwnCredential>("/credentials/me", token, { fresh: true })
      .then(data => {
        if (!live) return;
        setCard(data.card);
        setIssuance(data.issuance);
        setPhase(data.card ? "ready" : "empty");
      })
      .catch(error => {
        if (!live) return;
        setCard(null);
        setProblem(credentialFailure(error).message);
        setPhase("error");
      });
    return () => { live = false; };
  }, [token, revision]);

  async function download() {
    if (!card || busy) return;
    setBusy(true);
    setProblem("");
    try { await downloadCredentialPdf(token, card.id); }
    catch (error) { setProblem(credentialFailure(error).message); }
    finally { setBusy(false); }
  }
  async function verify() {
    if (!card || busy) return;
    setBusy(true);
    setProblem("");
    try { setVerification(await verifyCredentialQr(card.qrPayload)); }
    catch (error) { setProblem(credentialFailure(error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className={s.section} id="minha-carteirinha" aria-labelledby="my-card-title">
      <header className={s.heading}>
        <div><span className={s.eyebrow}>Identificação pessoal</span>
          <h2 id="my-card-title">Minha carteirinha</h2>
          <p>Sua identificação como membro da Igreja de Deus Riacho Fundo I, independente da função que exerce no sistema.</p>
        </div>
        <span className={s.mark} aria-hidden="true">ID</span>
      </header>
      {phase === "loading" && <p className={s.message} role="status">Consultando sua carteirinha…</p>}
      {phase === "empty" && <div className={s.empty}>
        <strong>{emptyCopy(issuance).title}</strong>
        <p>{emptyCopy(issuance).detail}</p>
      </div>}
      {phase === "error" && <div className={s.empty} role="alert"><p>{problem}</p>
        <button type="button" onClick={() => setRevision(n => n + 1)}>Tentar novamente</button>
      </div>}
      {card && phase === "ready" && <div className={s.cardArea}>
        <CredentialFaces card={card} verification={verification} />
        <div className={s.actionRow}>
          <button type="button" className={s.primary} onClick={() => void download()} disabled={busy || card.status !== "ACTIVE"}>
            {busy ? "Preparando…" : "Baixar carteirinha em PDF"}
          </button>
          <button type="button" className={s.secondary} onClick={() => void verify()} disabled={busy}>Conferir QR Code</button>
        </div>
        {card.status !== "ACTIVE" && <p className={s.message}>Este documento não está ativo. Consulte a Secretaria.</p>}
        {problem && <p className={s.error} role="alert">{problem}</p>}
        <p className={s.disclaimer}>A carteirinha é pessoal. Permissões administrativas não substituem o vínculo de membresia. O QR não contém CPF, e-mail ou telefone.</p>
      </div>}
    </section>
  );
}
