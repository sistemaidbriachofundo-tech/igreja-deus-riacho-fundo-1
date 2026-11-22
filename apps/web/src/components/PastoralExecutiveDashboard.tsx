"use client";

import { useEffect, useState } from "react";
import { apiGet, loadStoredToken } from "../lib/api";
import { AppNavLink, UIIcon } from "./AppShell";
import { CongregationSummary } from "./PastoralCommunity";
import { WorkspacePriorities } from "./WorkspacePriorities";
import { pastoralSections } from "../lib/pastoral-navigation";
import s from "./pastoral-executive.module.css";

type Data = {
  admissions: number | null;
  expenses: number | null;
  openPrayers: number | null;
  birthdaysToday: number | null;
  cases: number | null;
  members: number | null;
  pendingMembers: number | null;
};
type PartialAnswer = { ok: boolean; value: number | null };
const pt = new Intl.NumberFormat("pt-BR");

function count(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : pt.format(value);
}
function safeCount(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}
function statusLabel(n: number | null, singular: string, plural: string) {
  return n === null ? "Consulta indisponível" : n === 1 ? singular : plural;
}

const metrics: Array<{ key: keyof Data; title: string; icon: "layers" | "wallet" | "mail" | "birthday" | "calendar" | "family" | "people"; href: string; tone: string }> = [
  { key: "admissions", title: "Admissões pendentes", icon: "layers", href: "/app/pastoral/admissoes/", tone: "blue" },
  { key: "expenses", title: "Despesas pendentes", icon: "wallet", href: "/app/pastoral/despesas/", tone: "amber" },
  { key: "openPrayers", title: "Pedidos de oração", icon: "mail", href: "/app/pastoral/oracoes/", tone: "green" },
  { key: "birthdaysToday", title: "Aniversariantes hoje", icon: "birthday", href: "/app/pastoral/aniversariantes/", tone: "violet" },
  { key: "cases", title: "Acompanhamentos", icon: "family", href: "/app/pastoral/cuidado/", tone: "teal" },
  { key: "members", title: "Membros ativos", icon: "people", href: "/app/pastoral/congregacao/", tone: "slate" },
];

const decisions = [
  { key: "admissions" as const, text: "Admissões aguardando parecer", href: "/app/pastoral/admissoes/", icon: "layers" as const, tone: "blue" },
  { key: "expenses" as const, text: "Despesas para aprovação", href: "/app/pastoral/despesas/", icon: "wallet" as const, tone: "amber" },
  { key: "openPrayers" as const, text: "Pedidos de oração abertos", href: "/app/pastoral/oracoes/", icon: "mail" as const, tone: "green" },
  { key: "birthdaysToday" as const, text: "Aniversariantes do dia", href: "/app/pastoral/aniversariantes/", icon: "birthday" as const, tone: "violet" },
  { key: "cases" as const, text: "Pessoas em acompanhamento", href: "/app/pastoral/cuidado/", icon: "family" as const, tone: "teal" },
];

export function PastoralExecutiveDashboard({ roles }: { roles: readonly string[] }) {
  const isPastor = roles.includes("PASTOR");
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    const token = loadStoredToken();
    if (!token) return;
    setData(null);
    setError("");
    const load = async <T,>(path: string): Promise<T | null> => {
      try { return await apiGet<T>(path, token, { fresh: true }); }
      catch { return null; }
    };
    void Promise.all([
      load<{ admissions: unknown[] }>("/admissions?status=AWAITING_PASTOR"),
      load<{ entries: Array<{ approvalFlow?: string; firstApprovedByUserId?: string | null }> }>("/ledger/entries?status=PENDING_APPROVAL"),
      isPastor ? load<{ members: number; pendingAdmissions: number; openPrayers: number; birthdaysToday: number }>("/pastoral/congregation") : Promise.resolve(null),
      load<{ totals?: { activeMembers?: number; pendingAdmission?: number } }>("/reports/membership-insights"),
      isPastor ? load<{ requests: Array<{ status: string }> }>("/pastoral/prayers") : Promise.resolve(null),
      isPastor ? load<{ cases: Array<{ status?: string }> }>("/pastoral-cases") : Promise.resolve(null),
    ]).then(([admissions, expenses, congregation, report, prayers, cases]) => {
      if (!live) return;
      const stats: Data = {
        admissions: admissions?.admissions ? admissions.admissions.length : null,
        expenses: expenses?.entries ? expenses.entries.filter(e => e.approvalFlow === "TREASURER_THEN_PASTOR" && e.firstApprovedByUserId).length : null,
        openPrayers: isPastor ? (prayers?.requests ? prayers.requests.filter(p => p.status === "OPEN").length : safeCount(congregation?.openPrayers)) : null,
        birthdaysToday: isPastor ? safeCount(congregation?.birthdaysToday) : null,
        cases: isPastor ? (cases?.cases ? cases.cases.filter(c => c.status !== "CLOSED").length : null) : null,
        members: safeCount(congregation?.members ?? report?.totals?.activeMembers),
        pendingMembers: safeCount(congregation?.pendingAdmissions ?? report?.totals?.pendingAdmission),
      };
      setData(stats);
      if (Object.values(stats).every(value => value === null)) setError("Os serviços de indicadores não estão disponíveis agora.");
    }).catch(() => { if (live) setError("Não foi possível atualizar os dados pastorais."); });
    return () => { live = false; };
  }, [revision, isPastor]);

  return (
    <div className={s.dashboard}>
      <header className={s.intro}>
        <div><p className={s.kicker}>PASTORAL · RIACHO FUNDO I</p>
          <h1>Mesa Pastoral</h1>
          <p>Acompanhe pessoas, decisões, cuidado pastoral e prioridades da congregação.</p>
        </div>
        <button type="button" className={s.refresh} onClick={() => setRevision(x => x + 1)}><UIIcon name="activity" size={17} /> Atualizar dados</button>
      </header>
      {error && <p className={s.warning} role="alert">{error}</p>}
      <section aria-label="Indicadores da Mesa Pastoral" className={s.kpis} aria-busy={data === null}>
        {metrics.filter(item => isPastor || !["openPrayers", "cases", "birthdaysToday"].includes(item.key)).map(item => (
          <AppNavLink className={s.kpi} data-tone={item.tone} href={item.href} key={item.key}>
            <span className={s.kpiIcon}><UIIcon name={item.icon} size={22} /></span>
            <span className={s.kpiContent}><span>{item.title}</span>
              <strong aria-label={data === null ? "Carregando" : count(data[item.key])}>{data === null ? "…" : count(data[item.key])}</strong>
            </span>
            <span className={s.kpiArrow}><UIIcon name="arrow" size={17} /></span>
          </AppNavLink>
        ))}
      </section>

      <div className={s.primaryGrid}>
        <section className={s.panel} aria-labelledby="pastoral-today">
          <div className={s.panelTitle}><h2 id="pastoral-today"><UIIcon name="activity" size={21} /> Prioridades de hoje</h2></div>
          <ul className={s.priorityList}>
            {decisions.filter(item => isPastor || ["admissions","expenses"].includes(item.key)).map(item => (
              <li key={item.key}>
                <AppNavLink href={item.href} className={s.priorityRow} data-tone={item.tone}>
                  <UIIcon name={item.icon} size={18} />
                  <span>{item.text}</span>
                  <strong>{data ? count(data[item.key]) : "…"}</strong>
                  <UIIcon name="chevron" size={15} />
                </AppNavLink>
              </li>
            ))}
          </ul>
          <WorkspacePriorities showService={false} showDecisions revision={revision} />
        </section>

        <section className={s.panel} aria-labelledby="pastoral-care">
          <div className={s.panelTitle}><h2 id="pastoral-care"><UIIcon name="family" size={21} /> Cuidado pastoral</h2>
            {isPastor && <AppNavLink href="/app/pastoral/cuidado/">Ver tudo</AppNavLink>}
          </div>
          {isPastor ? <div className={s.careBody}>
            <div className={s.careSummary}><span className={s.roundIcon}><UIIcon name="family" size={26}/></span>
              <div><strong>{data ? count(data.cases) : "…"}</strong><span>Acompanhamentos em andamento</span></div>
            </div>
            <p>Pedidos de oração, visitas e acompanhamento de famílias são tratados na área pastoral protegida.</p>
            <div className={s.careLinks}>
              <AppNavLink href="/app/pastoral/cuidado/"><UIIcon name="family" size={17}/> Abrir atendimentos</AppNavLink>
              <AppNavLink href="/app/pastoral/oracoes/"><UIIcon name="mail" size={17}/> Ver pedidos de oração</AppNavLink>
            </div>
          </div> : <div className={s.careBody}>
            <p>Os atendimentos e pedidos de oração são confidenciais. O administrador visualiza somente informações autorizadas e as decisões administrativas.</p>
            <span className={s.private}><UIIcon name="shield" size={18}/> Informações pastorais protegidas</span>
          </div>}
        </section>

        <section className={s.panel} aria-labelledby="pastoral-agenda">
          <div className={s.panelTitle}><h2 id="pastoral-agenda"><UIIcon name="calendar" size={21}/> Agenda da igreja</h2>
            <AppNavLink href="/agenda/">Abrir agenda</AppNavLink>
          </div>
          <ul className={s.agendaList}>
            <li><time>QUI</time><span><strong>Culto da Família</strong><small>Quinta-feira · 20h</small></span></li>
            <li><time>DOM</time><span><strong>Culto da manhã</strong><small>Domingo · 10h</small></span></li>
            <li><time>DOM</time><span><strong>Culto da noite</strong><small>Domingo · 19h</small></span></li>
          </ul>
          <p className={s.agendaNote}>Horários regulares confirmados. Para eventos especiais e alterações, consulte a Agenda.</p>
          <AppNavLink className={s.agendaButton} href="/app/pastoral/ordem-de-culto/">Ver ordem de culto <UIIcon name="arrow" size={16}/></AppNavLink>
        </section>
      </div>

      <div className={s.lowerGrid}>
        <section className={s.panel} aria-labelledby="pastoral-congregation">
          <div className={s.panelTitle}><h2 id="pastoral-congregation"><UIIcon name="people" size={21}/> Visão da congregação</h2>
            <AppNavLink href={isPastor ? "/app/pastoral/congregacao/" : "/app/secretaria/"}>Ver detalhes</AppNavLink>
          </div>
          <div className={s.congregationGrid}>
            <div className={s.congregationValue}><span>Membros ativos</span><strong>{data ? count(data.members) : "…"}</strong>
              <small>Conforme consulta autorizada</small>
            </div>
            <div className={s.congregationValue}><span>Em admissão</span><strong>{data ? count(data.pendingMembers) : "…"}</strong>
              <small>Conforme consulta autorizada</small>
            </div>
            <div className={s.congregationRoutes}>
              <AppNavLink href="/app/pastoral/mapa/"><UIIcon name="map" size={21}/> Mapa da membresia <UIIcon name="arrow" size={15}/></AppNavLink>
              <AppNavLink href="/app/conexao/"><UIIcon name="layers" size={21}/> Conexão e Trilhas <UIIcon name="arrow" size={15}/></AppNavLink>
              <AppNavLink href="/app/ministerios/"><UIIcon name="people" size={21}/> Ministérios <UIIcon name="arrow" size={15}/></AppNavLink>
            </div>
          </div>
          {isPastor && <div className={s.expandedSummary}><CongregationSummary revision={revision}/></div>}
        </section>
        <section className={s.panel} aria-labelledby="pastoral-actions">
          <div className={s.panelTitle}><h2 id="pastoral-actions"><UIIcon name="activity" size={21}/> Ações rápidas</h2></div>
          <nav className={s.quickActions} aria-label="Ações rápidas da Pastoral">
            {pastoralSections(roles).map(a => <AppNavLink href={a.href} key={a.id}>
              <UIIcon name={a.icon} size={21}/><span>{a.title}</span>
            </AppNavLink>)}
          </nav>
        </section>
      </div>
      <p className={s.privacy}>Indicadores consultados na API conforme seu perfil. Nenhum número é inventado; dados indisponíveis aparecem como “—”.</p>
    </div>
  );
}
