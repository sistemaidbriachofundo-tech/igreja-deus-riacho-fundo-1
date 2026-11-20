"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, loadStoredToken } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { usePersonaAccess } from "./AppShell";
import { Alert, Button, Input, Loading, Modal, PageHeader, Select } from "./ui";
import s from "./pastoral-desk.module.css";
import ui from "./ui/ui.module.css";

type Scope = { id: string; label: string };
type SettingValue = string | number | boolean | string[] | null;
type Setting = {
  key: string;
  label: string;
  description?: string;
  area: string;
  type: "boolean" | "number" | "text" | "time" | "color" | "select" | "list";
  options?: string[];
  value: SettingValue;
};
type Change = Pick<Setting, "key" | "value">;
type Version = {
  id: string;
  authorName?: string;
  effectiveAt: string;
  status: string;
  changes: { key: string; previousValue: SettingValue; value: SettingValue }[];
};
type Catalog = { settings: Setting[]; scopes: Scope[]; scopeId?: string; draft?: { id: string; changes: Change[] } | null };
const endpoint = "/admin/system-rules";
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

function display(value: SettingValue): string {
  if (value === null || value === "") return "A definir";
  if (typeof value === "boolean") return value ? "Ativo" : "Desativado";
  if (Array.isArray(value)) return value.join(", ") || "Lista vazia";
  return String(value);
}

function searchText(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
}

export function SystemRulesDesk() {
  const access = usePersonaAccess();
  const allowed = access.kind === "ready" && access.roles.includes("PLATFORM_ADMIN");
  const [scopeId, setScopeId] = useState("");
  const [catalog, setCatalog] = useState<Catalog>();
  const [versions, setVersions] = useState<Version[]>();
  const [filter, setFilter] = useState("");
  const [area, setArea] = useState("");
  const [editing, setEditing] = useState<Setting | null>(null);
  const [draftValue, setDraftValue] = useState("");
  const [effectiveAt, setEffectiveAt] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [history, setHistory] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const query = scopeId ? "?" + new URLSearchParams({ scopeId }) : "";

  useEffect(() => {
    const token = loadStoredToken();
    if (!allowed || !token) return;
    let live = true;
    setCatalog(undefined);
    setError("");
    void apiGet<Catalog>(endpoint + query, token).then(
      result => { if (live) setCatalog(result); },
      problem => { if (live) setError(dasError(problem)); },
    );
    return () => { live = false; };
  }, [allowed, query, revision]);

  useEffect(() => {
    const token = loadStoredToken();
    if (!allowed || !history || !token) return;
    let live = true;
    setVersions(undefined);
    void apiGet<{ versions: Version[] }>(endpoint + "/history" + query, token).then(
      result => { if (live) setVersions(result.versions); },
      problem => { if (live) setError(dasError(problem)); },
    );
    return () => { live = false; };
  }, [allowed, history, query, revision]);

  async function perform(request: (token: string) => Promise<unknown>, success: string, finish: () => void) {
    const token = loadStoredToken();
    if (!allowed || !token || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await request(token);
      finish();
      setNotice(success);
      setRevision(current => current + 1);
    } catch (problem) {
      setError(dasError(problem));
    } finally {
      setBusy(false);
    }
  }

  function start(setting: Setting) {
    const proposed = catalog?.draft?.changes.find(change => change.key === setting.key);
    const value = proposed ? proposed.value : setting.value;
    setError("");
    setDraftValue(value === null ? "" : Array.isArray(value) ? value.join("\n") : String(value));
    setEditing(setting);
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing || !catalog) return;
    const value: SettingValue = editing.type === "number" ? Number(draftValue)
      : editing.type === "boolean" ? draftValue === "true"
      : editing.type === "list" ? draftValue.split("\n").map(item => item.trim()).filter(Boolean)
      : draftValue.trim();
    if (editing.type === "number" && (!draftValue.trim() || !Number.isFinite(value))) {
      setError("Informe um número válido.");
      return;
    }
    const changes = (catalog.draft?.changes ?? []).filter(change => change.key !== editing.key);
    if (JSON.stringify(value) !== JSON.stringify(editing.value)) changes.push({ key: editing.key, value });
    void perform(token => apiPost(endpoint + "/draft", token, { scopeId: catalog.scopeId ?? scopeId, changes }),
      "Rascunho salvo para revisão.", () => setEditing(null));
  }

  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!catalog?.draft?.id || !effectiveAt) return;
    void perform(token => apiPost(endpoint + "/publish", token, { draftId: catalog.draft?.id, effectiveAt }),
      "Versão publicada com a data de vigência selecionada.", () => { setReview(false); setEffectiveAt(""); });
  }

  if (!allowed) return null;
  const settings = catalog?.settings ?? [];
  const areas = Array.from(new Set(settings.map(item => item.area)));
  const visible = settings.filter(item => (!area || item.area === area) &&
    searchText(item.area + " " + item.label + " " + (item.description ?? "")).includes(searchText(filter.trim())));
  const drafts = catalog?.draft?.changes ?? [];

  return <div className={s.desk}>
    <PageHeader title="Gestão do Sistema" description="Consulte as regras vigentes, prepare alterações e acompanhe as publicações."
      appearance="workspace" heading="h1" actions={<Button variant="secondary" onClick={() => { setError(""); setHistory(value => !value); }}>
        {history ? "Voltar às regras" : "Histórico de regras"}</Button>} />
    {!editing && !review && error && <Alert appearance="workspace" tone="danger" title={error} />}
    {notice && <Alert appearance="workspace" tone="success" title={notice} />}
    {!catalog && !error && <Loading label="Carregando regras do sistema" />}
    {catalog && <div className={`${ui.workspaceSurface} ${s.fields}`}>
      <Select label="Abrangência" value={scopeId} options={[{ value: "", label: "Congregação atual" }, ...catalog.scopes.map(scope => ({ value: scope.id, label: scope.label }))]}
        onChange={event => { setScopeId(event.target.value); setArea(""); }} />
      {!history && <>
        <Input type="search" label="Buscar regra" value={filter} onChange={event => setFilter(event.target.value)} />
        <Select label="Área" value={area} options={[{ value: "", label: "Todas as áreas" }, ...areas.map(item => ({ value: item, label: item }))]}
          onChange={event => setArea(event.target.value)} />
        <Button variant="secondary" type="button" disabled={!drafts.length || busy} onClick={() => { setError(""); setReview(true); }}>Revisar rascunho</Button>
      </>}
    </div>}
    {!history && catalog && (visible.length ? <ul className={s.entries} aria-label="Regras do sistema">
      {visible.map(item => <li key={item.key} className={`${ui.workspaceSurface} ${s.stat}`}>
        <div className={s.summaryHead}><div><small>{item.area}</small><h2>{item.label}</h2></div>
          <Button variant="secondary" onClick={() => start(item)}>Editar<span className={ui.srOnly}> {item.label}</span></Button>
        </div>
        {item.description && <span>{item.description}</span>}
        <span>Em vigor · {display(item.value)}</span>
        {drafts.find(change => change.key === item.key) && <strong>Alteração em rascunho</strong>}
      </li>)}
    </ul> : <p>Nenhuma regra encontrada.</p>)}
    {history && (versions ? versions.length ? <ul className={s.entries} aria-label="Versões publicadas">
      {versions.map(version => <li key={version.id} className={`${ui.workspaceSurface} ${s.stat}`}>
        <strong>{date.format(new Date(version.effectiveAt))} · {version.status}</strong>
        {version.authorName && <span>{version.authorName}</span>}
        {version.changes.map(({ key, previousValue, value }) => <span key={key}>{settings.find(item => item.key === key)?.label ?? key}: {display(previousValue)} → {display(value)}</span>)}
      </li>)}
    </ul> : <p>Nenhuma versão encontrada.</p> : !error && <Loading label="Carregando o histórico" />)}
    <Modal open={Boolean(editing)} title={editing?.label ?? "Editar regra"} appearance="workspace" onClose={() => !busy && setEditing(null)}>
      {editing && <form className={s.prayerForm} onSubmit={save}>
        <span>Em vigor · {display(editing.value)}</span>
        {editing.type === "boolean" || editing.type === "select" ? <Select label="Novo valor" value={draftValue}
          options={editing.type === "boolean" ? [{ value: "true", label: "Ativo" }, { value: "false", label: "Desativado" }]
            : (editing.options ?? []).map(option => ({ value: option, label: option }))}
          onChange={event => setDraftValue(event.target.value)} required />
          : editing.type === "list" ? <label>Novo valor (um item por linha)<textarea rows={5} value={draftValue}
            onChange={event => setDraftValue(event.target.value)} /></label>
          : <Input label="Novo valor" type={editing.type} value={draftValue} onChange={event => setDraftValue(event.target.value)} required />}
        {error && <Alert appearance="workspace" tone="danger" title={error} />}
        <Button type="submit" disabled={busy}>Salvar no rascunho</Button>
      </form>}
    </Modal>
    <Modal open={review} title="Revisar publicação" appearance="workspace" onClose={() => !busy && setReview(false)}>
      <form className={s.prayerForm} onSubmit={publish}>
        <ul>{drafts.map(change => {
          const stored = settings.find(item => item.key === change.key);
          return <li key={change.key}>{stored?.label ?? change.key} · {display(stored?.value ?? null)} → {display(change.value)}</li>;
        })}</ul>
        <Input label="Data de vigência" type="date" required value={effectiveAt} onChange={event => setEffectiveAt(event.target.value)} />
        {error && <Alert appearance="workspace" tone="danger" title={error} />}
        <Button type="submit" disabled={!drafts.length || busy}>Publicar versão</Button>
      </form>
    </Modal>
  </div>;
}
