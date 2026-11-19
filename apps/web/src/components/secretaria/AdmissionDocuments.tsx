"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiDelete, apiGet, apiGetBlob, apiPostForm, ApiRequestError } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import type { AdmissionDocumentMeta } from "../secretary-dossier";
import ui from "../ui/ui.module.css";
import s from "../hml-phase-one.module.css";

type Requirement = { id: string; label: string; required: boolean };
type Document = AdmissionDocumentMeta & { requirementId?: string | null };
type DocumentList = { documents: Document[]; requirements?: Requirement[] };

export function AdmissionDocuments({ token, admissionId, canUpload, onBusy }: {
  token: string; admissionId: string; canUpload: boolean; onBusy: (value: boolean) => void;
}) {
  const path = `/admissions/${encodeURIComponent(admissionId)}/documents`;
  const [data, setData] = useState<DocumentList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toRemove, setToRemove] = useState<Document | null>(null);
  const [revision, setRevision] = useState(0);
  const [requirementId, setRequirementId] = useState("");
  const requirements = data?.requirements ?? [];

  useEffect(() => {
    let active = true;
    void apiGet<DocumentList>(path, token).then(
      result => { if (active) setData(result); },
      error => { if (active) setError(dasError(error)); },
    );
    return () => { active = false; };
  }, [token, path, revision]);

  async function perform(action: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (error) {
      setError(error instanceof ApiRequestError && error.status === 413
        ? "O arquivo excede o limite de 5 MB." : dasError(error));
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }

  function upload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = new FormData(form);
    const file = body.get("file");
    if (!(file instanceof File) || !file.size || file.size > 5 * 1024 * 1024) {
      setError("Escolha um arquivo PDF, JPEG ou PNG de até 5 MB.");
      return;
    }
    if (!requirementId) body.delete("requirementId");
    void perform(async () => {
      await apiPostForm(path, token, body);
      form.reset();
      setRequirementId("");
      setNotice("Documento enviado.");
      setRevision(revision => revision + 1);
    });
  }

  function download(document: Document) {
    void perform(async () => {
      const blob = await apiGetBlob(`${path}/${encodeURIComponent(document.id)}`, token);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = document.displayName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    });
  }

  function remove(document: Document) {
    void perform(async () => {
      await apiDelete(`${path}/${encodeURIComponent(document.id)}`, token);
      setToRemove(null);
      setNotice("Documento removido.");
      setRevision(revision => revision + 1);
    });
  }

  return <section className={s.protocolDocuments} aria-label="Documentos de admissão" aria-busy={busy}>
    <h3>Documentos de admissão</h3>
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !error && <p role="status">Carregando documentos…</p>}
    {error && !data && <button type="button" className={ui.workspaceSecondary} onClick={() => {
      setError("");
      setRevision(revision => revision + 1);
    }}>Tentar novamente</button>}
    {data && <>
      {requirements.length > 0 && <ul className={s.protocolFiles} aria-label="Checklist de documentos">
        {requirements.map(requirement => <li key={requirement.id}>
          <strong>{requirement.label}</strong>
          <span>{data.documents.some(document => document.requirementId === requirement.id)
            ? "Recebido" : requirement.required ? "Obrigatório · pendente" : "Opcional"}</span>
        </li>)}
      </ul>}
      {!data.documents.length && <p>Nenhum arquivo anexado ao protocolo.</p>}
      {data.documents.length > 0 && <ul className={s.protocolFiles}>
        {data.documents.map(document => <li key={document.id}><span>{document.displayName}</span>
          <div className={s.protocolActions}>
            <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => download(document)}
              aria-label={`Baixar ${document.displayName}`}>Baixar</button>
            {canUpload && <button type="button" className={ui.workspaceQuiet} disabled={busy} onClick={() => setToRemove(document)}
              aria-label={`Remover ${document.displayName}`}>Remover</button>}
          </div>
        </li>)}
      </ul>}
      {toRemove && <div className={s.protocolActions}>
        <span>Remover {toRemove.displayName}?</span>
        <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => setToRemove(null)}>Manter</button>
        <button type="button" className={ui.workspacePrimary} disabled={busy} onClick={() => remove(toRemove)}>Confirmar remoção</button>
      </div>}
      {canUpload && <form className={s.form} onSubmit={upload}>
        {requirements.length > 0 && <label>Tipo de documento<select name="requirementId" value={requirementId} onChange={e => setRequirementId(e.target.value)} disabled={busy}>
          <option value="">Documento complementar</option>
          {requirements.map(requirement => <option key={requirement.id} value={requirement.id}>{requirement.label}</option>)}
        </select></label>}
        <label>Arquivo (PDF, JPEG ou PNG de até 5 MB)<input disabled={busy} name="file" type="file" required accept="application/pdf,image/jpeg,image/png" /></label>
        <div><button type="submit" className={ui.workspaceSecondary} disabled={busy}>{busy ? "Processando…" : "Enviar documento"}</button></div>
      </form>}
    </>}
  </section>;
}
