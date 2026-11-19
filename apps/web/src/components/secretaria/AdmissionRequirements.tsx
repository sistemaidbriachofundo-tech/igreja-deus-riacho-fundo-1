"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost, ApiRequestError } from "../../lib/api";
import { dasError } from "../../lib/das-operations";
import { Modal } from "../ui/Modal";
import ui from "../ui/ui.module.css";
import s from "../hml-phase-one.module.css";

const modalities = {
  BATISMO: "Batismo",
  TRANSFERENCIA: "Transferência",
  RECONCILIACAO: "Reconciliação",
  ACLAMACAO: "Aclamação",
  OUTRO: "Outro",
};
type Modality = keyof typeof modalities;
type Requirement = { id: string; label: string; required: boolean; active: boolean; code: string };
const endpoint = "/admissions/document-requirements";

function codeFor(label: string) {
  return label.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40).replace(/^-+|-+$/g, "");
}

export function AdmissionRequirements({ token, onClose }: { token: string; onClose: () => void }) {
  const [modality, setModality] = useState<Modality>("BATISMO");
  const [rows, setRows] = useState<Requirement[] | null>(null);
  const [editing, setEditing] = useState<Requirement | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    void apiGet<{ requirements: Requirement[] }>(endpoint + "?modality=" + modality, token).then(
      data => { if (active) setRows(data.requirements); },
      error => { if (active) setError(dasError(error)); },
    );
    return () => { active = false; };
  }, [token, modality, revision]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const label = String(data.get("label") ?? "").trim();
    const code = codeFor(label);
    const required = data.has("required");
    if (!label || (!editing && !code)) {
      setError("Informe o nome do documento usando letras ou números.");
      return;
    }
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (editing) await apiPatch(endpoint + "/" + encodeURIComponent(editing.id), token, { label, required, active: data.has("active") });
      else await apiPost(endpoint, token, { modality, code, label, required });
      form.reset();
      setEditing(null);
      setNotice("Tipo de documento salvo para " + modalities[modality] + ".");
      setRevision(current => current + 1);
    } catch (error) {
      setError(error instanceof ApiRequestError && error.status === 409
        ? "Já existe um tipo de documento com esse nome. Edite o item da lista." : dasError(error));
    } finally {
      setBusy(false);
    }
  }

  return <Modal open appearance="workspace" size="wide" title="Documentos por modalidade" onClose={() => { if (!busy) onClose(); }}
    description="Escolha quais documentos a Secretaria deve receber. Somente os tipos ativos e obrigatórios bloqueiam o avanço da admissão.">
    <div className={s.protocolReview}>
      <label>Modalidade
        <select aria-label="Modalidade" value={modality} disabled={busy} onChange={event => {
          setEditing(null);
          setRows(null);
          setNotice("");
          setError("");
          setModality(event.target.value as Modality);
        }}>
          {Object.entries(modalities).map(([value, title]) => <option key={value} value={value}>{title}</option>)}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      {!rows && !error && <p role="status">Carregando os tipos de documento…</p>}
      {!rows && error && <div><button type="button" className={ui.workspaceSecondary} onClick={() => {
        setError("");
        setRevision(current => current + 1);
      }}>Tentar novamente</button></div>}
      {rows && <>
        {rows.length === 0 ? <p>Nenhum tipo configurado nesta modalidade.</p> : <ul className={s.protocolFiles}>
          {rows.map(row => <li key={row.id}>
            <span><strong>{row.label}</strong> · {row.active ? (row.required ? "Obrigatório" : "Opcional") : "Inativo"}</span>
            <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => { setError(""); setEditing(row); }}
              aria-label={"Editar " + row.label}>Editar</button>
          </li>)}
        </ul>}
        <form key={editing?.id ?? modality} className={s.form} onSubmit={save}>
          <h3>{editing ? "Editar tipo de documento" : "Adicionar tipo de documento"}</h3>
          <label>Nome do documento<input name="label" required maxLength={120} disabled={busy} defaultValue={editing?.label ?? ""} /></label>
          <label className={s.protocolCheck}><input name="required" type="checkbox" defaultChecked={editing?.required ?? false} disabled={busy} />Obrigatório para avançar</label>
          {editing && <label className={s.protocolCheck}><input name="active" type="checkbox" defaultChecked={editing.active} disabled={busy} />Ativo na modalidade</label>}
          <div className={s.protocolActions}>
            <button type="submit" className={ui.workspacePrimary} disabled={busy}>{busy ? "Salvando…" : "Salvar tipo de documento"}</button>
            {editing && <button type="button" className={ui.workspaceSecondary} disabled={busy} onClick={() => setEditing(null)}>Cancelar edição</button>}
          </div>
        </form>
      </>}
    </div>
  </Modal>;
}
