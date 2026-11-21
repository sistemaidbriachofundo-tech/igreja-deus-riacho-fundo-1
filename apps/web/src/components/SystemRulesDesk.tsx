"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, loadStoredToken } from "../lib/api";
import { ruleState } from "../lib/system-rules-state";
import { churchLocalToISO, dasError } from "../lib/das-operations";
import { usePersonaAccess } from "./AppShell";
import { Alert, Button, Input, Loading, PageHeader, Select } from "./ui";
import s from "./pastoral-desk.module.css";
import ui from "./ui/ui.module.css";

type Setting = {
  key: string; title: string; description: string; valueType: string; scopeKind: string; devValue: unknown;
  editable?: boolean; behavior?: "active" | "locked" | "documentary"; behaviorNote?: string;
};
type Revision = {
  id: string; key: string; lifecycle: string; value: unknown; scopeId: string | null;
  updatedAt: string; createdAt: string; effectiveFrom: string | null; effectiveUntil: string | null;
};
type Effective = { value: unknown; source: "DEV" | "PUBLISHED" };
const path = "/system-settings";
const scopeLabels: Record<string, string> = {
  PLATFORM: "Plataforma", CHURCH: "Congregação", MINISTRY: "Ministério", MODULE: "Módulo", GROUP: "Grupo", TRACK: "Trilha",
};
const lifecycleLabels: Record<string, string> = { DRAFT: "Rascunho", IN_REVIEW: "Em revisão", PUBLISHED: "Publicada" };
const formats = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const searchable = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");

function display(value: unknown) {
  if (value == null || value === "") return "A definir";
  if (typeof value === "boolean") return value ? "Ativo" : "Desativado";
  return typeof value === "object" ? JSON.stringify(value) : String(value);
}

export function SystemRulesDesk() {
  const access = usePersonaAccess();
  const allowed = access.kind === "ready" && access.roles.includes("PLATFORM_ADMIN");
  const [settings, setSettings] = useState<Setting[]>();
  const [selected, setSelected] = useState<Setting>();
  const [effective, setEffective] = useState<Effective>();
  const [history, setHistory] = useState<Revision[]>();
  const [filter, setFilter] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [draftValue, setDraftValue] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveUntil, setEffectiveUntil] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const needsScope = Boolean(selected && !["CHURCH", "PLATFORM"].includes(selected.scopeKind));
  const revision = history?.find(item => item.id === revisionId && item.scopeId === (scopeId || null));

  useEffect(() => {
    const token = loadStoredToken();
    if (!allowed || !token) return;
    let live = true;
    void apiGet<{ items: Setting[] }>(path + "/catalog", token).then(
      data => { if (live) setSettings(data.items); },
      problem => { if (live) setError(dasError(problem)); },
    );
    return () => { live = false; };
  }, [allowed]);

  useEffect(() => {
    const token = loadStoredToken();
    if (!allowed || !selected || !token) return;
    let live = true;
    setHistory(undefined);
    setEffective(undefined);
    const key = encodeURIComponent(selected.key);
    const query = new URLSearchParams({ key: selected.key, scopeKind: selected.scopeKind, ...(scopeId ? { scopeId } : {}) });
    void Promise.all([
      apiGet<{ revisions: Revision[] }>(path + "/" + key + "/history", token, { fresh: true }),
      apiGet<Effective>(path + "/effective?" + query, token, { fresh: true }),
    ]).then(([versions, value]) => {
      if (live) { setHistory(versions.revisions); setEffective(value); }
    }, problem => { if (live) setError(dasError(problem)); });
    return () => { live = false; };
  }, [allowed, selected, scopeId, reload]);

  function select(item: Setting) {
    setSelected(item);
    setScopeId("");
    setRevisionId("");
    setDraftValue(typeof item.devValue === "string" ? item.devValue : JSON.stringify(item.devValue) ?? "");
    setError("");
    setNotice("");
  }

  async function perform(route: string, body: unknown, success: string) {
    const token = loadStoredToken();
    if (!allowed || !token || busy) return;
    setError("");
    setNotice("");
    setBusy(true);
    try {
      const result = await apiPost<Revision>(path + route, token, body);
      setRevisionId(result.id);
      setNotice(success);
      setReload(value => value + 1);
    } catch (problem) { setError(dasError(problem)); }
    finally { setBusy(false); }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected?.editable || (needsScope && !scopeId.trim())) return;
    let value: unknown = draftValue.trim();
    try {
      if (selected.valueType === "boolean") value = draftValue === "true";
      else if (selected.valueType === "number") {
        if (!draftValue.trim() || !Number.isFinite(Number(draftValue))) throw new Error("number");
        value = Number(draftValue);
      } else if (!["string", "time"].includes(selected.valueType)) value = JSON.parse(draftValue);
    } catch { setError("Confira o formato do novo valor."); return; }
    void perform("/drafts", { key: selected.key, scopeKind: selected.scopeKind, scopeId: scopeId || null, value }, "Rascunho salvo.");
  }

  function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!revision || revision.lifecycle !== "IN_REVIEW") return;
    const from = churchLocalToISO(effectiveFrom);
    const until = effectiveUntil ? churchLocalToISO(effectiveUntil) : null;
    if (!from || (effectiveUntil && (!until || until <= from))) {
      setError("Confira o início e o fim da vigência.");
      return;
    }
    void perform("/revisions/" + encodeURIComponent(revision.id) + "/publish", {
      effectiveFrom: from, effectiveUntil: until, expectedUpdatedAt: revision.updatedAt,
    }, "Regra publicada.");
  }

  if (!allowed) return null;
  const visible = settings?.filter(item => searchable(item.title + " " + item.description + " " + item.key).includes(searchable(filter.trim())));
  return <div className={s.desk}>
    <PageHeader title="Gestão do Sistema" description="Consulte, revise e publique regras da igreja." appearance="workspace" heading="h1" />
    {error && <Alert appearance="workspace" tone="danger" title={error} />}
    {notice && <Alert appearance="workspace" tone="success" title={notice} />}
    {!settings && !error && <Loading label="Carregando regras" />}
    {settings && <Input label="Buscar regra" type="search" value={filter} onChange={event => setFilter(event.target.value)} />}
    {selected && <section className={`${ui.workspaceSurface} ${s.stat}`} aria-label="Revisão de regra">
      <h2>{selected.title}</h2>
      <p>{selected.description}</p>
      <p>{scopeLabels[selected.scopeKind] ?? selected.scopeKind} · {ruleState(selected)} · {effective ? display(effective.value) : "Consultando…"}</p>
      {selected.behavior !== "active" && <p>Não há formulário de alteração para esta regra.</p>}
      {selected.editable && <form className={s.prayerForm} onSubmit={save}>
        {needsScope && <Input label="Identificador do escopo" value={scopeId}
          onChange={event => { setScopeId(event.target.value); setRevisionId(""); }} required />}
        {selected.valueType === "boolean" ? <Select label="Novo valor" required value={draftValue}
          options={[{ value: "true", label: "Ativo" }, { value: "false", label: "Desativado" }]}
          onChange={event => setDraftValue(event.target.value)} />
          : <Input label="Novo valor" required={!selected.key.startsWith("pastoral.")} type={selected.valueType === "time" ? "time" : selected.valueType === "number" ? "number" : "text"}
            value={draftValue} onChange={event => setDraftValue(event.target.value)} />}
        <Button type="submit" disabled={busy}>Salvar rascunho</Button>
      </form>}
      <h3>Histórico e revisões</h3>
      <ul className={s.entries}>{history?.filter(row => row.scopeId === (scopeId || null)).slice().reverse().map(row => <li key={row.id}>
        <span>{lifecycleLabels[row.lifecycle] ?? row.lifecycle} · {display(row.value)} · {formats.format(new Date(row.effectiveFrom ?? row.createdAt))}</span>{" "}
        {row.lifecycle !== "PUBLISHED" && <Button variant="secondary" disabled={busy}
          onClick={() => setRevisionId(row.id)}>Abrir revisão</Button>}
      </li>)}</ul>
      {revision?.lifecycle === "DRAFT" && <Button variant="secondary" disabled={busy} onClick={() => void perform(
        "/revisions/" + encodeURIComponent(revision.id) + "/review", { expectedUpdatedAt: revision.updatedAt }, "Rascunho em revisão.",
      )}>Enviar para revisão</Button>}
      {revision?.lifecycle === "IN_REVIEW" && <form className={s.prayerForm} onSubmit={publish}>
        <p>Publicar · {display(revision.value)}</p>
        <Input type="datetime-local" label="Início da vigência (Brasília)" required value={effectiveFrom} onChange={event => setEffectiveFrom(event.target.value)} />
        <Input type="datetime-local" label="Fim da vigência (opcional)" value={effectiveUntil} onChange={event => setEffectiveUntil(event.target.value)} />
        <Button type="submit" disabled={busy}>Publicar regra</Button>
      </form>}
    </section>}
    {visible?.length ? <ul className={s.entries} aria-label="Regras do sistema">
      {visible.map(item => <li key={item.key} className={`${ui.workspaceSurface} ${s.stat}`}>
        <div className={s.summaryHead}><h2>{item.title}</h2><Button variant="secondary" onClick={() => select(item)} disabled={busy}>
          Abrir<span className={ui.srOnly}> {item.title}</span>
        </Button></div><span>{item.description}</span>
        {item.behavior && item.behavior !== "active" && <span>{ruleState(item)}</span>}
      </li>)}
    </ul> : settings && <p>Nenhuma regra encontrada.</p>}
  </div>;
}
