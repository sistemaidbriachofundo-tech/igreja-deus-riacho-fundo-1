"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { apiGet, apiPatch, apiPost, loadStoredToken } from "../lib/api";
import { churchLocalToISO, dasError } from "../lib/das-operations";
import type { SettingBehavior } from "../lib/system-rules-state";
import { PageHeader } from "./ui/PageHeader";
import { withBasePath } from "../lib/paths";
import { usePersonaAccess } from "./AppShell";
import { Alert, Button, Input, Loading, Modal, Select } from "./ui";
import { UIIcon, type GlyphName } from "./ui/UIIcon";
import s from "./system-rules-desk.module.css";
import ui from "./ui/ui.module.css";

type Setting = { key: string; title: string; description: string; valueType: string; scopeKind: string; editable: boolean; behavior: SettingBehavior };
type Revision = { id: string; lifecycle: string; value: unknown; scopeId: string | null; updatedAt: string; createdAt: string; effectiveFrom: string | null; effectiveUntil: string | null };
type Effective = { value: unknown; source: "DEV" | "PUBLISHED"; revisionId: string | null };
type Pastor = { id: string; name: string };
type Ministry = { id: string; name: string; slug: string };
const path = "/system-settings";
const groups: { id: SettingBehavior; title: string; icon: GlyphName; detail: string }[] = [
  { id: "active", title: "Editáveis", icon: "settings", detail: "Escolha uma regra para alterar seu valor e definir quando entra em vigor." },
  { id: "locked", title: "Protegidas", icon: "lock", detail: "Essas regras são fixas nesta versão. Abra uma delas para consultar a restrição." },
  { id: "documentary", title: "Referência", icon: "book", detail: "Estas diretrizes estão documentadas. A publicação por este painel ainda não está disponível." },
];
const descriptions: Record<string, string> = {
  "pastoral.titular_user_id": "Quem recebe os pedidos de oração da congregação.",
  "pastoral.substitute_user_id": "Quem assume os pedidos na ausência do responsável.",
  "auth.password_reset.ttl_hours": "Por quanto tempo o link para criar uma nova senha funciona.",
  "notices.birthday.hour_brasilia": "Quando o aviso diário de aniversários é programado, no horário de Brasília.",
  "rosters.louvor.week_block": "Impede que um integrante do Louvor seja sorteado duas vezes na mesma semana, conforme o ministério.",
  "notices.birthday.timezone": "Fuso usado para decidir o dia civil dos aniversariantes.",
  "rosters.survey.open_day": "Dia do mês em que a pesquisa de disponibilidade da escala abre.",
  "events.agenda.keep_days_after_end": "Quantos dias um evento permanece na agenda pública depois de terminar.",
};
const birthdayZones = ["America/Sao_Paulo", "America/Manaus", "America/Rio_Branco", "America/Noronha", "America/Cuiaba", "America/Belem", "America/Fortaleza", "America/Recife", "America/Bahia", "America/Porto_Velho", "America/Boa_Vista", "America/Campo_Grande", "America/Maceio", "America/Santarem", "America/Araguaina"];
const zoneLabel = (value: string) => value === "America/Sao_Paulo" ? "Horário de Brasília" : value.replace("America/", "").replace(/_/g, " ");
function numberBounds(key: string) {
  if (key === "rosters.survey.open_day") return { min: 20, max: 28, label: "Dia do mês em que a pesquisa abre" };
  if (key === "events.agenda.keep_days_after_end") return { min: 0, max: 14, label: "Dias na agenda depois do término" };
  return { min: 1, max: 24, label: "Validade do link em horas" };
}
const statuses: Record<string, string> = { DRAFT: "Rascunho", IN_REVIEW: "Em revisão", PUBLISHED: "Publicada" };
const scopes: Record<string, string> = { CHURCH: "Congregação", PLATFORM: "Plataforma", MINISTRY: "Ministério", MODULE: "Módulo", GROUP: "Grupo", TRACK: "Trilha" };
const formatDate = (value: string) => new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(value));
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
const ruleIcons: Record<string, GlyphName> = { auth: "shield", notices: "birthday", pastoral: "people", events: "ticket", finance: "wallet", rosters: "roster", credentials: "badge" };

function valueLabel(item: Setting, value: unknown, pastors: Pastor[]) {
  if (item.key.startsWith("pastoral.")) return value ? pastors.find(p => p.id === value)?.name ?? "Pastor fora da lista atual" : "Pela ordem de vínculo pastoral";
  if (item.key === "rosters.survey.open_day") return "Dia " + String(value);
  if (item.key === "events.agenda.keep_days_after_end") return value === 0 ? "Some ao terminar" : String(value) + " dias";
  if (item.key === "notices.birthday.timezone" && typeof value === "string") return zoneLabel(value);
  if (item.valueType === "number") return String(value) + (value === 1 ? " hora" : " horas");
  if (typeof value === "boolean") return value ? "Ativo" : "Desativado";
  if (value === "mock") return "Simulação";
  if (value === "ecclesiastical") return "Situação e cargo eclesiástico";
  if (value === "America/Sao_Paulo") return "Horário de Brasília";
  return String(value ?? "A definir");
}

export function SystemRulesDesk() {
  const access = usePersonaAccess();
  const allowed = access.kind === "ready" && access.roles.includes("PLATFORM_ADMIN");
  const [settings, setSettings] = useState<Setting[]>();
  const [group, setGroup] = useState<SettingBehavior>("active");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Setting>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const token = loadStoredToken();
    if (!allowed || !token) return;
    let live = true;
    setError("");
    void apiGet<{ items: Setting[] }>(path + "/catalog", token, { fresh: true }).then(
      data => { if (live) setSettings(data.items); },
      issue => { if (live) setError(dasError(issue)); },
    );
    return () => { live = false; };
  }, [allowed, attempt]);
  if (!allowed) return <PageHeader appearance="workspace" heading="h1" title="Gestão do Sistema"
    description="Entre com o perfil de administrador da igreja para editar as regras da congregação."
    actions={access.kind === "preview" ? <a className={ui.workspacePrimary} href={withBasePath("/login/")}>Entrar</a> : undefined} />;
  const current = groups.find(item => item.id === group)!;
  const visible = settings?.filter(item => item.behavior === group && normalize(item.title + " " + (descriptions[item.key] ?? item.description)).includes(normalize(search)));
  return <div className={s.desk}>
    <PageHeader appearance="workspace" heading="h1" title="Gestão do Sistema" description="Regras e preferências da congregação"
      actions={<a className={ui.workspaceSecondary} href={withBasePath("/app/servir/atmosfera/?config=regras")}><UIIcon name="roster" size={17} /> Regras de escala do Atmosfera</a>} />
    <section className={s.operational} aria-labelledby="operational-rules-title">
      <div><h2 id="operational-rules-title">Regras operacionais já configuráveis</h2>
        <p>Edite equipes, vagas e escalas diretamente nos módulos. Estas telas salvam configurações da operação, sem solicitar alteração no código.</p></div>
      <div className={s.operationalLinks}>
        <a href={withBasePath("/app/servir/atmosfera/?config=regras")}><UIIcon name="roster" size={17} /> Atmosfera · Módulos e escalas</a>
        <a href={withBasePath("/app/servir/louvor/?config=regras")}><UIIcon name="roster" size={17} /> Louvor · Equipe e geração mensal</a>
        <a href={withBasePath("/app/pastoral/ordem-de-culto/")}><UIIcon name="settings" size={17} /> Ordem do Culto · Regras e integrantes</a>
        <a href={withBasePath("/app/eventos-gestao/")}><UIIcon name="ticket" size={17} /> Eventos · Inscrições e lotes</a>
      </div>
      <p className={s.operationalNote}>As regras em <strong>Referência</strong> ainda não alteram o sistema. Regras protegidas, como exigência de login e controles financeiros, não podem ser afrouxadas pelo painel.</p>
    </section>
    {error && <><Alert title={error} tone="danger" /><Button onClick={() => setAttempt(n => n + 1)}>Tentar novamente</Button></>}
    {!settings && !error && <Loading label="Carregando regras" />}
    {settings && <>
      <div className={s.groups} role="group" aria-label="Categorias de regras">{groups.map(item =>
        <button type="button" key={item.id} aria-pressed={group === item.id} onClick={() => { setGroup(item.id); setSearch(""); }}>
          <UIIcon name={item.icon} size={16} /><span>{item.title}</span><small>{settings.filter(rule => rule.behavior === item.id).length}</small>
        </button>)}</div>
      <section className={s.catalog}>
        <div className={s.toolbar}><div><h2>{group === "documentary" ? "Diretrizes de referência" : "Regras " + current.title.toLowerCase()}</h2><p>{current.detail}</p></div>
          <Input label="Buscar nesta categoria" type="search" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <ul className={s.rows} aria-label="Regras do sistema">{visible?.map(item =>
          <li key={item.key}><button type="button" className={s.row} onClick={() => setSelected(item)} aria-label={(item.editable ? "Editar " : "Consultar ") + item.title}>
            <span className={s.icon}><UIIcon name={ruleIcons[item.key.split(".")[0]] ?? "settings"} /></span>
            <span className={s.copy}><strong>{item.title}</strong><span>{descriptions[item.key] ?? item.description}</span></span>
            <span className={s.action}>{item.editable ? "Editar" : "Consultar"} <UIIcon name={item.editable ? "settings" : "chevron"} size={15} /></span>
          </button></li>)}</ul>
        {!visible?.length && <p role="status">Nenhuma regra encontrada nesta categoria.</p>}
      </section>
    </>}
    {selected && createPortal(<RuleEditor key={selected.key} item={selected} onClose={() => setSelected(undefined)} />, document.body)}
  </div>;
}

function RuleEditor({ item, onClose }: { item: Setting; onClose: () => void }) {
  const [effective, setEffective] = useState<Effective>();
  const [history, setHistory] = useState<Revision[]>([]);
  const [pastors, setPastors] = useState<Pastor[]>([]);
  const [ministries, setMinistries] = useState<Ministry[]>([]);
  const [scopeId, setScopeId] = useState("");
  useEffect(() => {
    if (item.scopeKind !== "MINISTRY") return;
    const token = loadStoredToken();
    if (!token) return;
    let live = true;
    void apiGet<{ ministries: Ministry[] }>("/ministries", token, { fresh: true })
      .then(result => {
        if (!live) return;
        const available = result.ministries.filter(ministry => /^louvor(?:-|$)/i.test(ministry.slug));
        setMinistries(available);
        setScopeId(current => current || available[0]?.id || "");
      }).catch(issue => { if (live) setError(dasError(issue)); });
    return () => { live = false; };
  }, [item.scopeKind]);
  const [draftValue, setDraftValue] = useState("");
  const [revisionId, setRevisionId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [schedule, setSchedule] = useState(false);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const pastorRule = item.key.startsWith("pastoral.");
  const revision = history.find(row => row.id === revisionId && row.lifecycle !== "PUBLISHED");
  const previous = history.find(row => row.id === effective?.revisionId);
  const describe = (value: unknown) => valueLabel(item, value, pastors);

  useEffect(() => {
    const token = loadStoredToken();
    if (!token) return;
    if (item.scopeKind === "MINISTRY" && !scopeId) { setLoading(false); return; }
    let live = true;
    setLoading(true);
    setError("");
    const query = new URLSearchParams({ key: item.key, scopeKind: item.scopeKind, ...(scopeId ? { scopeId } : {}) });
    void Promise.all([
      apiGet<Effective>(path + "/effective?" + query, token, { fresh: true }),
      apiGet<{ revisions: Revision[] }>(path + "/" + encodeURIComponent(item.key) + "/history", token, { fresh: true }),
      pastorRule ? apiGet<{ items: Pastor[] }>(path + "/pastors", token, { fresh: true }) : Promise.resolve({ items: [] as Pastor[] }),
    ]).then(([active, changes, people]) => {
      if (!live) return;
      setEffective(active);
      setHistory(changes.revisions.filter(row => row.scopeId === (scopeId || null)).reverse());
      setPastors(people.items);
      const draft = changes.revisions.find(row => row.id === revisionId && row.lifecycle === "DRAFT");
      setDraftValue(String((draft ? draft.value : active.value) ?? ""));
    }).catch(issue => { if (live) { setEffective(undefined); setError(dasError(issue)); } })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [item, pastorRule, reload, revisionId, scopeId]);

  async function perform(route: string, body: unknown, message: string, method: "POST" | "PATCH" = "POST") {
    const token = loadStoredToken();
    if (!token || busy || loading) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const send = method === "PATCH" ? apiPatch : apiPost;
      const result = await send<Revision>(path + route, token, body);
      setRevisionId(result.id); setNotice(message); setReload(n => n + 1);
    } catch (issue) { setError(dasError(issue)); }
    finally { setBusy(false); }
  }

  function publish(event: FormEvent) {
    event.preventDefault();
    if (!revision) return;
    const from = schedule ? churchLocalToISO(start) : "now";
    const until = end ? churchLocalToISO(end) : null;
    if (!from || (schedule && Date.parse(from) <= Date.now()) || (end && (!until || Date.parse(until) <= (schedule ? Date.parse(from) : Date.now())))) {
      setError("Confira a data de início e a de término da vigência."); return;
    }
    const replace = previous && !previous.effectiveUntil;
    void perform("/revisions/" + revision.id + "/publish", {
      expectedUpdatedAt: revision.updatedAt, effectiveFrom: from, effectiveUntil: until, ...(replace ? { replaceRevisionId: previous.id } : {}),
    }, schedule ? "Publicação agendada. Consulte o início da vigência no histórico." : "Regra publicada. O novo valor já está em vigor.");
  }

  return <Modal open appearance="workspace" title={(item.editable ? "Editar · " : "") + item.title} description={descriptions[item.key] ?? item.description} onClose={() => { if (!busy) onClose(); }}>
    {item.scopeKind === "MINISTRY" && <Select label="Ministério desta regra"
      value={scopeId}
      onChange={event => { setScopeId(event.target.value); setRevisionId(""); setEffective(undefined); }}
      options={[{ value: "", label: "Selecione o ministério" }, ...ministries.map(ministry => ({ value: ministry.id, label: ministry.name }))]} />}
    {item.scopeKind === "MINISTRY" && ministries.length === 0 &&
      <Alert appearance="workspace" tone="warning" title="Cadastre um ministério de Louvor para configurar esta regra." />}
    {loading && <Loading label="Consultando regra" />}
    {error && <><Alert appearance="workspace" tone="danger" title={error} />{effective && <Button variant="secondary" onClick={() => setReload(n => n + 1)}>Recarregar regra</Button>}</>}
    {notice && <div role="status"><Alert appearance="workspace" tone="success" title={notice} /></div>}
    {!loading && !effective && <Button onClick={() => setReload(n => n + 1)}>Tentar novamente</Button>}
    {!loading && effective && <>
      <div className={s.current}><span>{item.behavior === "documentary" ? "Valor de referência" : "Valor vigente"} · {scopes[item.scopeKind] ?? item.scopeKind}</span><strong>{describe(effective.value)}</strong></div>
      {item.editable && (!revision || revision.lifecycle === "DRAFT") && <form onSubmit={event => {
        event.preventDefault();
        const value = item.valueType === "number" ? Number(draftValue) : item.valueType === "boolean" ? draftValue === "true" : draftValue;
        if (revision) {
          void perform("/revisions/" + revision.id, { expectedUpdatedAt: revision.updatedAt, value }, "Alterações salvas neste rascunho.", "PATCH");
          return;
        }
        void perform("/drafts", { key: item.key, scopeKind: item.scopeKind, ...(scopeId ? { scopeId } : {}), value }, "Rascunho salvo. Confira o valor antes de enviar para revisão.");
      }}>
        {pastorRule ? <Select label="Pastor designado" value={draftValue} onChange={e => setDraftValue(e.target.value)}
          options={[{ value: "", label: "Usar a ordem de vínculo pastoral" }, ...(draftValue && !pastors.some(p => p.id === draftValue) ? [{ value: draftValue, label: "Pastor fora da lista atual" }] : []), ...pastors.map(p => ({ value: p.id, label: p.name }))]} />
          : item.valueType === "boolean" ? <Select label="Bloqueio de escala na mesma semana" value={draftValue}
            onChange={event => setDraftValue(event.target.value)}
            options={[{ value: "true", label: "Ativo: não repetir na mesma semana" }, { value: "false", label: "Desativado: permitir quando as outras regras aceitarem" }]} />
          : item.key === "notices.birthday.timezone" ? <Select label="Fuso do aviso de aniversário" value={draftValue}
            onChange={event => setDraftValue(event.target.value)}
            options={birthdayZones.map(zone => ({ value: zone, label: zoneLabel(zone) }))} />
          : <Input label={item.valueType === "time" ? "Novo horário (Brasília)" : numberBounds(item.key).label} required type={item.valueType === "time" ? "time" : "number"} min={item.valueType === "number" ? numberBounds(item.key).min : undefined} max={item.valueType === "number" ? numberBounds(item.key).max : undefined} value={draftValue} onChange={e => setDraftValue(e.target.value)} />}
        <Button className={ui.workspacePrimary} type="submit" disabled={busy || draftValue === String((revision ? revision.value : effective.value) ?? "")}>{revision ? "Salvar alterações" : "Salvar rascunho"}</Button>
      </form>}
      {revision && <section className={s.workflow} aria-label="Revisão selecionada">
        <h3>{statuses[revision.lifecycle]} · {describe(revision.value)}</h3>
        {revision.lifecycle === "DRAFT" && <Button className={ui.workspacePrimary} disabled={busy || draftValue !== String(revision.value ?? "")} onClick={() => void perform("/revisions/" + revision.id + "/review", { expectedUpdatedAt: revision.updatedAt }, "Pronto para publicar. Escolha quando a regra entra em vigor.")}>Enviar para revisão</Button>}
        {revision.lifecycle === "IN_REVIEW" && <form onSubmit={publish}>
          <Select label="Entrada em vigor" value={schedule ? "later" : "now"} onChange={e => setSchedule(e.target.value === "later")}
            options={[{ value: "now", label: "Ao publicar" }, { value: "later", label: "Agendar para outra data" }]} />
          {schedule && <Input type="datetime-local" label="Início da vigência (Brasília)" required value={start} onChange={e => setStart(e.target.value)} />}
          <Input type="datetime-local" label="Fim da vigência (opcional)" value={end} onChange={e => setEnd(e.target.value)} />
          {previous && !previous.effectiveUntil && <p>A versão vigente será encerrada quando a nova entrar em vigor.</p>}
          <Button className={ui.workspacePrimary} type="submit" disabled={busy}>Publicar regra</Button>
        </form>}
        <Button variant="ghost" disabled={busy} onClick={() => { setRevisionId(""); setNotice(""); setError(""); }}>Voltar à regra</Button>
      </section>}
      {item.behavior === "locked" && <p className={s.note}><UIIcon name="lock" size={18} /> Esta configuração é protegida na versão atual.</p>}
      {item.behavior === "documentary" && <p className={s.note}><UIIcon name="book" size={18} /> Diretriz de referência. Este painel ainda não controla sua aplicação.</p>}
      <details className={s.history}><summary>Histórico e revisões ({history.length})</summary>
        {!history.length && <p>Ainda não há revisões para esta regra.</p>}
        <ul>{history.map(row => <li key={row.id}><strong>{statuses[row.lifecycle] ?? row.lifecycle} · {describe(row.value)}</strong><span>
          {formatDate(row.effectiveFrom ?? row.createdAt)}{row.effectiveUntil ? " até " + formatDate(row.effectiveUntil) : ""} · Brasília
        </span>{item.editable && row.lifecycle !== "PUBLISHED" && <Button variant="secondary" disabled={busy} onClick={() => {
          setRevisionId(row.id); setStart(""); setEnd(""); setSchedule(false); setNotice(""); setError("");
        }}>Abrir revisão</Button>}</li>)}</ul>
      </details>
    </>}
  </Modal>;
}
