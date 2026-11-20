"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPatch, apiPost, loadStoredToken } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { AppNavLink, usePersonaAccess } from "./AppShell";
import { Alert, Button, Input, Loading, PageHeader, Select } from "./ui";
import s from "./pastoral-desk.module.css";
import ui from "./ui/ui.module.css";

type Congregation = {
  church?: { name: string };
  totals: { activeMembers: number; pendingAdmission: number; households?: number };
  people?: { id: string; name: string; district?: string | null; status: string }[];
};
type MinistryPrayer = {
  id: string;
  createdAt: string;
  message: string;
  contactRequested: boolean;
  personName?: string;
  status: "NEW" | "IN_PROGRESS" | "CLOSED";
};
const statusLabels = { NEW: "Novo", IN_PROGRESS: "Em acompanhamento", CLOSED: "Concluído" };
const statusChoices = [
  { label: "Todas as situações", value: "" }, { label: "Ativo", value: "ACTIVE" },
  { label: "Em admissão", value: "PENDING_ADMISSION" }, { label: "Inativo", value: "INACTIVE" },
];
const count = new Intl.NumberFormat("pt-BR");
const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const congregationPath = "/pastoral/congregation";

export function CongregationSummary({ revision }: { revision: number }) {
  const [totals, setTotals] = useState<Congregation["totals"]>();
  const [error, setError] = useState("");
  useEffect(() => {
    const token = loadStoredToken();
    if (!token) return;
    let live = true;
    setError("");
    void apiGet<Congregation>(congregationPath, token)
      .catch(() => apiGet<Congregation>("/reports/membership-insights", token))
      .then(data => { if (live) setTotals(data.totals); })
      .catch(() => { if (live) setError("Não foi possível consultar os indicadores da congregação."); });
    return () => { live = false; };
  }, [revision]);

  return <section className={s.desk} aria-labelledby="congregation-summary">
    <div className={s.summaryHead}>
      <h2 id="congregation-summary">Visão da congregação</h2>
      <AppNavLink href="/app/pastoral/congregacao/" className={ui.workspaceSecondary}>Ver congregação</AppNavLink>
    </div>
    {error ? <Alert tone="warning" appearance="workspace" title={error} /> : totals ? (
      <dl className={s.queues}>
        {([
          ["Membros ativos", totals.activeMembers],
          ["Pessoas em admissão", totals.pendingAdmission],
          ["Famílias cadastradas", totals.households],
        ] as const).map(([label, value]) => <div key={label} className={`${ui.workspaceSurface} ${s.stat}`}>
          <dt>{label}</dt><dd>{typeof value === "number" ? count.format(value) : "Indisponível"}</dd>
        </div>)}
      </dl>
    ) : <Loading label="Carregando indicadores da congregação" />}
  </section>;
}

export function CongregationDirectory() {
  const access = usePersonaAccess();
  const allowed = access.kind === "ready" && access.roles.includes("PASTOR");
  const [query, setQuery] = useState("");
  const [district, setDistrict] = useState("");
  const [status, setStatus] = useState("");
  const [results, setResults] = useState<Congregation["people"]>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filters = new URLSearchParams();
  if (query.trim()) filters.set("query", query.trim());
  if (district.trim()) filters.set("district", district.trim());
  if (status) filters.set("status", status);
  const queryString = filters.toString();

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = loadStoredToken();
    if (!allowed || !token || loading) return;
    setLoading(true);
    setError("");
    try {
      const data = await apiGet<Congregation>(congregationPath + (queryString ? "?" + queryString : ""), token);
      setResults(data.people ?? []);
    } catch (problem) {
      setResults(undefined);
      setError(dasError(problem));
    } finally {
      setLoading(false);
    }
  }

  if (!allowed) return null;
  return <div className={s.desk}>
    <PageHeader title="Congregação" description="Consulte as pessoas da congregação sob seu acompanhamento."
      appearance="workspace" heading="h1" />
    <form className={`${ui.workspaceSurface} ${s.fields}`} onSubmit={search}>
      <Input label="Nome" value={query} maxLength={120} onChange={event => setQuery(event.target.value)} />
      <Input label="Bairro" value={district} maxLength={120} onChange={event => setDistrict(event.target.value)} />
      <Select label="Situação" value={status} options={statusChoices} onChange={event => setStatus(event.target.value)} />
      <Button type="submit" disabled={loading}>{loading ? "Consultando…" : "Consultar"}</Button>
    </form>
    {error && <Alert tone="danger" appearance="workspace" title={error} />}
    {results && <section aria-label="Pessoas da congregação">
      {results.length ? <ul className={s.entries}>{results.map(person => <li key={person.id} className={`${ui.workspaceSurface} ${s.stat}`}>
        <strong>{person.name}</strong><span>{person.district || "Bairro não informado"} · {statusChoices.find(item => item.value === person.status)?.label ?? person.status}</span>
      </li>)}</ul> : <p>Nenhuma pessoa encontrada com esses filtros.</p>}
    </section>}
  </div>;
}

export function PrayerRequestForm() {
  const access = usePersonaAccess();
  const [message, setMessage] = useState("");
  const [contactRequested, setContact] = useState(false);
  const [stage, setStage] = useState<"idle" | "loading" | "error" | "sent">("idle");
  const allowed = access.kind === "ready" && access.roles.some(role => ["MEMBRO", "PASTOR", "SECRETARIA", "LIDER_MINISTERIO", "PLATFORM_ADMIN", "TESOURARIA"].includes(role));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = loadStoredToken();
    if (!allowed || !token || !message.trim() || stage === "loading") return;
    setStage("loading");
    try {
      await apiPost("/pastoral/prayers", token, { message: message.trim(), contactRequested });
      setMessage("");
      setContact(false);
      setStage("sent");
    } catch {
      setStage("error");
    }
  }

  if (!allowed) return null;
  return <div className={s.desk}>
    <PageHeader title="Pedir oração" description="Seu pedido é encaminhado à Pastoral da sua congregação." appearance="workspace" heading="h1" />
    {stage === "sent" ? <Alert tone="success" appearance="workspace" title="Seu pedido foi encaminhado à Pastoral." /> :
      <form className={`${ui.workspaceSurface} ${s.prayerForm}`} onSubmit={submit}>
        <label>Seu pedido de oração<textarea rows={5} required maxLength={1000} value={message}
          onChange={event => setMessage(event.target.value)} /></label>
        <label><input type="checkbox" checked={contactRequested} onChange={event => setContact(event.target.checked)} /> Quero que a Pastoral entre em contato comigo</label>
        {stage === "error" && <Alert tone="danger" appearance="workspace" title="Não foi possível encaminhar o pedido. Tente novamente." />}
        <Button type="submit" disabled={!message.trim() || stage === "loading"}>{stage === "loading" ? "Enviando…" : "Enviar pedido"}</Button>
      </form>}
  </div>;
}

export function PastoralPrayerQueue() {
  const access = usePersonaAccess();
  const allowed = access.kind === "ready" && access.roles.includes("PASTOR");
  const [items, setItems] = useState<MinistryPrayer[]>();
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const token = loadStoredToken();
    if (!allowed || !token) return;
    let live = true;
    setError("");
    void apiGet<{ prayers: MinistryPrayer[] }>("/pastoral/prayers", token)
      .then(data => { if (live) setItems(data.prayers); })
      .catch(problem => { if (live) setError(dasError(problem)); });
    return () => { live = false; };
  }, [allowed, revision]);

  async function update(item: MinistryPrayer, status: MinistryPrayer["status"]) {
    const token = loadStoredToken();
    if (!allowed || !token || busy) return;
    setBusy(true);
    setError("");
    try {
      await apiPatch("/pastoral/prayers/" + encodeURIComponent(item.id), token, { status });
      setRevision(value => value + 1);
    } catch (problem) {
      setError(dasError(problem));
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return null;
  return <div className={s.desk}>
    <PageHeader title="Pedidos de oração" description="Acompanhe os pedidos encaminhados à Pastoral." appearance="workspace" heading="h1"
      actions={<Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Atualizar</Button>} />
    {error && <Alert tone="danger" appearance="workspace" title={error} />}
    {!items && !error && <Loading label="Carregando pedidos de oração" />}
    {items?.length === 0 && <p>Nenhum pedido de oração encontrado.</p>}
    {items && <ul className={s.entries}>{items.map(item => <li key={item.id}>
      <details className={`${ui.workspaceSurface} ${s.stat}`}>
        <summary><strong>{item.personName || "Pedido de oração"}</strong> · {statusLabels[item.status] ?? item.status} · {when.format(new Date(item.createdAt))}</summary>
        <p className={s.privateText}>{item.message}</p>
        {item.contactRequested && <p>Solicitou contato da Pastoral.</p>}
        {item.status !== "CLOSED" && <div className={s.actions}>
          {item.status === "NEW" && <Button variant="secondary" disabled={busy} onClick={() => void update(item, "IN_PROGRESS")}>Iniciar acompanhamento</Button>}
          <Button variant="secondary" disabled={busy} onClick={() => void update(item, "CLOSED")}>Concluir</Button>
        </div>}
      </details>
    </li>)}</ul>}
  </div>;
}
