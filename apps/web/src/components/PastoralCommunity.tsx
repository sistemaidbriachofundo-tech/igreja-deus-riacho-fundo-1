"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet, apiPost, loadStoredToken } from "../lib/api";
import { dasError } from "../lib/das-operations";
import { AppNavLink, usePersonaAccess } from "./AppShell";
import { Alert, Button, Input, Loading, PageHeader, Select } from "./ui";
import s from "./pastoral-desk.module.css";
import ui from "./ui/ui.module.css";

type Congregation = {
  members: number; pendingAdmissions: number; openPrayers: number; birthdaysToday: number; upcomingServices: number;
  people?: { id: string; name: string; district?: string | null; status: string }[];
};
type MinistryPrayer = { id: string; createdAt: string; canReadText: boolean; status: string };
const statusLabels: Record<string, string> = { OPEN: "Novo", ACKNOWLEDGED: "Em acompanhamento", IN_PROGRESS: "Em acompanhamento", CLOSED: "Concluído" };
const statusChoices = [
  { label: "Todas as situações", value: "" }, { label: "Ativo", value: "ACTIVE" },
  { label: "Em admissão", value: "PENDING_ADMISSION" }, { label: "Inativo", value: "INACTIVE" },
];
const count = new Intl.NumberFormat("pt-BR");
const when = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const congregationPath = "/pastoral/congregation";

export function CongregationSummary({ revision }: { revision: number }) {
  const [totals, setTotals] = useState<Pick<Congregation, "members" | "pendingAdmissions"> & Partial<Congregation>>();
  const [error, setError] = useState("");
  useEffect(() => {
    const token = loadStoredToken();
    if (!token) return;
    let live = true;
    setError("");
    void apiGet<Congregation>(congregationPath, token)
      .catch(async () => {
        const report = await apiGet<{ totals: { activeMembers: number; pendingAdmission: number } }>("/reports/membership-insights", token);
        return { members: report.totals.activeMembers, pendingAdmissions: report.totals.pendingAdmission };
      })
      .then(data => { if (live) setTotals(data); })
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
          ["Membros ativos", totals.members],
          ["Admissões em andamento", totals.pendingAdmissions],
          ["Pedidos de oração abertos", totals.openPrayers],
          ["Aniversariantes de hoje", totals.birthdaysToday],
          ["Próximos cultos", totals.upcomingServices],
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
      if (!data.people) throw new Error("A consulta nominal está indisponível neste ambiente.");
      setResults(data.people);
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
  const [stage, setStage] = useState<"idle" | "loading" | "error" | "sent">("idle");
  const allowed = access.kind === "ready" && access.roles.some(role => ["MEMBRO", "CONVIDADO", "PASTOR", "SECRETARIA", "PLATFORM_ADMIN"].includes(role));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const token = loadStoredToken();
    if (!allowed || !token || message.trim().length < 2 || stage === "loading") return;
    setStage("loading");
    try {
      await apiPost("/pastoral/prayers", token, { body: message.trim() });
      setMessage("");
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
        <label>Seu pedido de oração<textarea rows={5} required maxLength={2000} minLength={2} value={message}
          onChange={event => setMessage(event.target.value)} /></label>
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
  const [open, setOpen] = useState<{ id: string; body: string }>();
  useEffect(() => {
    const token = loadStoredToken();
    if (!allowed || !token) return;
    let live = true;
    setError("");
    void apiGet<{ requests: MinistryPrayer[] }>("/pastoral/prayers", token, { fresh: true })
      .then(data => { if (live) setItems(data.requests); })
      .catch(problem => { if (live) setError(dasError(problem)); });
    return () => { live = false; };
  }, [allowed, revision]);

  async function view(item: MinistryPrayer) {
    const token = loadStoredToken();
    if (!allowed || !token || busy || !item.canReadText) return;
    if (open?.id === item.id) { setOpen(undefined); return; }
    setOpen(undefined);
    setBusy(true);
    setError("");
    try {
      const details = await apiGet<{ body: string }>("/pastoral/prayers/" + encodeURIComponent(item.id), token, { fresh: true });
      setOpen({ id: item.id, body: details.body });
    } catch (problem) { setError(dasError(problem)); }
    finally { setBusy(false); }
  }

  if (!allowed) return null;
  return <div className={s.desk}>
    <PageHeader title="Pedidos de oração" description="Acompanhe os pedidos encaminhados à Pastoral." appearance="workspace" heading="h1"
      actions={<Button variant="secondary" onClick={() => setRevision(value => value + 1)}>Atualizar</Button>} />
    {error && <Alert tone="danger" appearance="workspace" title={error} />}
    {!items && !error && <Loading label="Carregando pedidos de oração" />}
    {items?.length === 0 && <p>Nenhum pedido de oração encontrado.</p>}
    {items && <ul className={s.entries}>{items.map(item => <li key={item.id}>
      <article className={`${ui.workspaceSurface} ${s.stat}`}>
        <strong>Pedido de oração · {statusLabels[item.status] ?? item.status} · {when.format(new Date(item.createdAt))}</strong>
        {item.canReadText && <Button variant="secondary" disabled={busy} onClick={() => void view(item)}>
          {open?.id === item.id ? "Fechar pedido" : "Ler pedido"}
        </Button>}
        {open?.id === item.id && <p className={s.privateText}>{open.body}</p>}
      </article>
    </li>)}</ul>}
  </div>;
}
