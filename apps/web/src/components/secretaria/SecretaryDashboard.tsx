"use client";

import { useEffect, useState, type FormEvent } from "react";
import { AppNavLink, UIIcon } from "../AppShell";
import { apiGet } from "../../lib/api";
import { Alert } from "../ui/Alert";
import s from "./secretary-dashboard.module.css";

/** Secretaria RF1: os indicadores vêm da API, nunca de números colocados na interface. */
const groups = [
  ["membros", "Membros", "Vínculos reconhecidos"],
  ["nao_membros", "Não membros", "Pessoas acompanhadas"],
  ["inativos", "Inativos", "Cadastros inativos"],
  ["em_admissao", "Em admissão", "Aguardando decisão"],
  ["transferidos", "Transferidos", "Transferências registradas"],
] as const;
type Group = (typeof groups)[number][0];
type PersonRow = { id: string; name: string; date: string };
type Count = { label: string; count: number };
type Movement = { admissoes: number; transferenciasEntrada: number; transferenciasSaida: number };
type Period = { from: string; to: string };
type Overview = {
  today: string;
  period: Period;
  total: number;
  byCategory: Record<Group, number>;
  people: Array<{ id: string; name: string; group: Group }>;
  demographics: {
    base: number; age: Count[]; missingBirthDate: number;
    churchTime: Count[]; missingChurchTime: number;
    ageAtFirstAttendance: Count[]; missingAgeAtAttendance: number; membershipTime: Count[];
    sex: { FEMALE: number; MALE: number; OTHER: number; unknown: number };
  };
  celebrations: Record<"birth" | "baptism" | "wedding", PersonRow[]>;
  recent: Record<"new" | "changed" | "visitors", PersonRow[]>;
  movements: { period: Movement; byMonth: Record<string, Movement>; byYear: Record<string, Movement> };
};

const counts = new Intl.NumberFormat("pt-BR");
const pct = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
const dayFormat = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
function formatDay(value: string) {
  const valueUtc = new Date(value.slice(0, 10) + "T12:00:00Z");
  return Number.isFinite(valueUtc.getTime()) ? dayFormat.format(valueUtc) : "Data não informada";
}
function shortPeriod(value: string, annual: boolean) {
  if (annual) return value;
  const [y, m] = value.split("-");
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, 1));
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(date).replace(".", "")
    : value;
}
const activities = [
  ["birth", "Aniversários"], ["baptism", "Batismos"], ["wedding", "Casamentos"],
  ["new", "Novos cadastros"], ["changed", "Alterações"], ["visitors", "Visitantes"],
] as const;
type Activity = (typeof activities)[number][0];

function SummaryCard({ label, number, detail, icon, tone }: {
  label: string; number: number | null; detail: string;
  icon: "people" | "family" | "check" | "clock"; tone: "featured" | "green" | "gold" | "neutral";
}) {
  return <article className={s.summaryCard} data-tone={tone}>
    <div className={s.cardTop}><span>{label}</span><span className={s.cardIcon}><UIIcon name={icon} size={21}/></span></div>
    <strong>{number === null ? "—" : counts.format(number)}</strong>
    <small>{detail}</small>
  </article>;
}

function DemographicCard({ title, description, rows }: { title: string; description: string; rows: Count[] }) {
  const max = Math.max(1, ...rows.map(row => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return <section className={s.demographicCard} aria-label={title}>
    <header><span className={s.overline}>PERFIL CADASTRAL</span><h3>{title}</h3><p>{description}</p></header>
    {total ? <ul className={s.demographicBars}>{rows.map(row => <li key={row.label}>
      <div><span>{row.label}</span><strong>{counts.format(row.count)}</strong></div>
      <span className={s.demographicTrack} aria-hidden="true"><i style={{width: (row.count / max * 100) + "%"}}/></span>
    </li>)}</ul> : <div className={s.emptyActivity}><UIIcon name="activity" size={24}/>
      <strong>Sem dados suficientes</strong><p>Os indicadores aparecerão conforme as informações forem cadastradas.</p></div>}
  </section>;
}

export function SecretaryDashboard({ token, revision, households, credentials, onOpenPerson }: {
  token: string; revision: number; households: number | null; credentials: number | null;
  onOpenPerson: (id: string) => void;
}) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [selectedPeriod, setSelectedPeriod] = useState<Period | null>(null);
  const [draft, setDraft] = useState<Period | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [query, setQuery] = useState("");
  const [activity, setActivity] = useState<Activity>("birth");
  const [upcoming, setUpcoming] = useState(true);
  const [annual, setAnnual] = useState(false);
  const [limit, setLimit] = useState(6);
  const [groupLimit, setGroupLimit] = useState(8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    const params = selectedPeriod ? "?" + new URLSearchParams(selectedPeriod).toString() : "";
    apiGet<Overview>("/persons/secretary-overview" + params, token)
      .then(data => { if (current) { setOverview(data); setDraft(data.period); } })
      .catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, revision, retry, selectedPeriod]);

  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft && draft.from && draft.to && draft.from <= draft.to) setSelectedPeriod({ ...draft });
  }
  function selectGroup(next: Group) {
    setGroup(previous => previous === next ? null : next);
    setQuery("");
    setGroupLimit(8);
  }
  if (!overview && loading) return <section className={s.loadingPanel} role="status">
    <span className={s.loader} aria-hidden="true"/>
    <strong>Preparando a visão da Secretaria…</strong>
    <p>Consultando os registros autorizados da congregação.</p>
  </section>;
  if (!overview) return <section className={s.loadingPanel} role="alert">
    <strong>Não foi possível carregar o panorama.</strong>
    <p>Os indicadores não serão substituídos por números de demonstração.</p>
    <button className={s.secondary} type="button" onClick={() => setRetry(v => v + 1)}>Tentar novamente</button>
  </section>;

  const classifiedTotal = groups.reduce((sum, [key]) => sum + (overview.byCategory[key] ?? 0), 0);
  const celebrations = activity === "birth" || activity === "baptism" || activity === "wedding";
  const activityRows = celebrations
    ? overview.celebrations[activity].filter(row => upcoming || row.date === overview.today)
    : overview.recent[activity];
  const matchingPeople = group ? overview.people.filter(row => row.group === group
    && row.name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))) : [];
  const { demographics, movements } = overview;
  const series = Object.entries(annual ? movements.byYear : movements.byMonth).sort(([a], [b]) => a.localeCompare(b));
  const maxSeries = Math.max(1, ...series.map(([, p]) => Math.max(p.admissoes, p.transferenciasEntrada, p.transferenciasSaida)));
  const seriesHasData = series.some(([, p]) => p.admissoes || p.transferenciasEntrada || p.transferenciasSaida);
  const selectedGroup = groups.find(([code]) => code === group);
  const updatedLabel = formatDay(overview.today);

  return <div className={s.dashboard} aria-busy={loading} data-secretary-dashboard="v2">
    <section className={s.hero} aria-labelledby="secretary-panorama-title">
      <div className={s.heroCopy}>
        <span className={s.kicker}><i aria-hidden="true"/> SECRETARIA · RIA­CHO FUNDO I</span>
        <h2 id="secretary-panorama-title">Cada pessoa conta.<br/><em>Cada história importa.</em></h2>
        <p>Uma visão da comunidade para acompanhar vínculos, celebrar histórias e tomar decisões com cuidado.</p>
        <div className={s.heroActions}>
          <AppNavLink href="/app/secretaria/pessoas/">Consultar fichas <UIIcon name="arrow" size={16}/></AppNavLink>
          <AppNavLink href="/app/secretaria/indicadores/">Indicadores detalhados <UIIcon name="arrow" size={16}/></AppNavLink>
        </div>
      </div>
      <div className={s.heroAside} aria-label="Informações do painel">
        <span className={s.heroAsideLabel}>PANORAMA DA COMUNIDADE</span>
        <strong>{counts.format(overview.total)}</strong>
        <span>Pessoas cadastradas</span>
        <div className={s.heroMeta}><UIIcon name="calendar" size={15}/> Dados até {updatedLabel}</div>
      </div>
    </section>

    {error && <Alert appearance="workspace" tone="warning" title="A atualização do painel falhou.">
      Exibindo o último resultado carregado. <button type="button" className={s.secondary} onClick={() => setRetry(v => v + 1)}>Tentar novamente</button>
    </Alert>}

    <section className={s.summary} aria-label="Indicadores principais">
      <SummaryCard tone="featured" label="Pessoas cadastradas" number={overview.total} detail="Registros da congregação" icon="people"/>
      <SummaryCard tone="green" label="Membros" number={overview.byCategory.membros} detail="Vínculos registrados" icon="check"/>
      <SummaryCard tone="neutral" label="Famílias cadastradas" number={households} detail="Núcleos familiares" icon="family"/>
      <SummaryCard tone="gold" label="Em admissão" number={overview.byCategory.em_admissao} detail="Pessoas em acompanhamento" icon="clock"/>
    </section>

    <div className={s.sectionHeading}>
      <div><span className={s.overline}>COMUNIDADE E CUIDADO</span><h2>Quem está conosco</h2>
      <p>Composição da membresia e datas importantes para acompanhar as pessoas.</p></div>
      <div className={s.quickLink}><AppNavLink href="/app/membros/carteirinha/">
        <UIIcon name="badge" size={16}/> Carteirinhas ativas: {credentials === null ? "—" : counts.format(credentials)}
        <UIIcon name="chevron" size={16}/>
      </AppNavLink></div>
    </div>

    <div className={s.top}>
      <section className={s.panel} aria-labelledby="composition-title">
        <header className={s.panelHeading}>
          <span className={s.overline}>PERFIL DE MEMBRESIA</span>
          <h3 id="composition-title">Situação dos cadastros</h3>
          <p>Clique em uma situação para encontrar as pessoas relacionadas.</p>
        </header>
        <div className={s.composition} role="img"
          aria-label={groups.map(([key, label]) => `${label}: ${overview.byCategory[key] ?? 0}`).join("; ")}>
          {classifiedTotal > 0 ? groups.map(([key]) => <span key={key} data-group={key}
            style={{ width: ((overview.byCategory[key] ?? 0) / classifiedTotal * 100) + "%" }} />) : <span className={s.compositionEmpty}/>}
        </div>
        <div className={s.categories}>
          {groups.map(([key, label, hint]) => {
            const count = overview.byCategory[key] ?? 0;
            return <button key={key} data-group={key} type="button" aria-pressed={group === key} onClick={() => selectGroup(key)}>
              <span className={s.categoryDot} aria-hidden="true"/>
              <span className={s.categoryLabel}><strong>{label}</strong><small>{hint}</small></span>
              <span className={s.categoryCount}><strong>{counts.format(count)}</strong><small>{classifiedTotal ? pct.format(count / classifiedTotal * 100) + "%" : "—"}</small></span>
              <UIIcon name="chevron" size={17}/>
            </button>;
          })}
        </div>
        {group && <div className={s.people} aria-label={selectedGroup?.[1] ?? "Pessoas no grupo"}>
          <div className={s.peopleHeading}>
            <div><strong>{selectedGroup?.[1]}</strong><p>{counts.format(matchingPeople.length)} pessoa(s) encontrada(s)</p></div>
            <button type="button" className={s.secondary} onClick={() => setGroup(null)}>Fechar lista</button>
          </div>
          <label>Buscar no grupo<input type="search" value={query} placeholder="Nome da pessoa" onChange={event => { setQuery(event.target.value); setGroupLimit(8); }}/></label>
          <ul className={s.personList}>{matchingPeople.slice(0,groupLimit).map(row => <li key={row.id}>
            <button type="button" onClick={() => onOpenPerson(row.id)}>
              <span className={s.personAvatar} aria-hidden="true">{row.name.trim().charAt(0)}</span>
              <strong>{row.name}</strong><UIIcon name="arrow" size={16}/>
            </button>
          </li>)}</ul>
          {matchingPeople.length === 0 && <p className={s.empty}>Nenhuma pessoa encontrada com esse filtro.</p>}
          {groupLimit < matchingPeople.length && <button className={s.secondary} type="button" onClick={() => setGroupLimit(value => value + 8)}>Mostrar mais pessoas</button>}
        </div>}
      </section>

      <section className={s.panel} aria-labelledby="activity-title">
        <header className={s.panelHeading}>
          <span className={s.overline}>ACOMPANHAMENTO</span>
          <h3 id="activity-title">Pessoas e datas especiais</h3>
          <p>Comemorações e alterações que merecem atenção da Secretaria.</p>
        </header>
        <div className={s.activityPicker} role="group" aria-label="Tipo de acompanhamento">
          {activities.map(([key, label]) => <button key={key} type="button" aria-pressed={activity === key}
            onClick={() => { setActivity(key); setLimit(6); }}>{label}</button>)}
        </div>
        {celebrations && <div className={s.activityPeriod} role="group" aria-label="Período das comemorações">
          <button type="button" aria-pressed={!upcoming} onClick={() => setUpcoming(false)}>Hoje</button>
          <button type="button" aria-pressed={upcoming} onClick={() => setUpcoming(true)}>Próximos 7 dias</button>
        </div>}
        <div className={s.activityCount}><strong>{counts.format(activityRows.length)}</strong>
          <span>{activityRows.length === 1 ? "registro" : "registros"} {celebrations ? "para acompanhar" : "nos últimos 30 dias"}</span></div>
        {activityRows.length ? <ul className={s.personList}>{activityRows.slice(0, limit).map((row, index) => <li key={row.id+"-"+row.date+"-"+index}>
          <button type="button" onClick={() => onOpenPerson(row.id)}>
            <span className={s.personAvatar} aria-hidden="true">{row.name.trim().charAt(0)}</span>
            <strong>{row.name}</strong>
            <time dateTime={row.date}>{formatDay(row.date)}</time><UIIcon name="chevron" size={16}/>
          </button>
        </li>)}</ul> : <div className={s.emptyActivity}><UIIcon name="calendar" size={23}/><strong>Sem acontecimentos para exibir</strong>
          <p>Quando houver registros nesse período, eles aparecerão aqui.</p></div>}
        {limit < activityRows.length && <button className={s.secondary} type="button" onClick={() => setLimit(value => value + 6)}>Mostrar mais registros</button>}
      </section>
    </div>

    <section className={s.panel} aria-labelledby="movements-title">
      <div className={s.movementHeader}>
        <header className={s.panelHeading}>
          <span className={s.overline}>EVOLUÇÃO DA CONGREGAÇÃO</span>
          <h3 id="movements-title">Movimentações da membresia</h3>
          <p>Admissões aprovadas e transferências concluídas, conforme registros do sistema.</p>
        </header>
        {draft && <form className={s.period} onSubmit={applyPeriod}>
          <label>De<input type="date" required value={draft.from} max={draft.to} onChange={event => setDraft({ ...draft, from: event.target.value })}/></label>
          <label>Até<input type="date" required value={draft.to} min={draft.from} max={overview.today} onChange={event => setDraft({ ...draft, to: event.target.value })}/></label>
          <button type="submit" disabled={loading}>Aplicar período</button>
        </form>}
      </div>
      <dl className={s.movementSummary} aria-label="Totais do período selecionado">
        <div><dt>Admissões</dt><dd>{counts.format(movements.period.admissoes)}</dd><small>Aprovadas</small></div>
        <div><dt>Transferências recebidas</dt><dd>{counts.format(movements.period.transferenciasEntrada)}</dd><small>Entradas</small></div>
        <div><dt>Transferências enviadas</dt><dd>{counts.format(movements.period.transferenciasSaida)}</dd><small>Saídas</small></div>
        <div><dt>Variação de eventos</dt><dd>{counts.format(movements.period.admissoes + movements.period.transferenciasEntrada - movements.period.transferenciasSaida)}</dd>
          <small>Não representa o total de membros</small></div>
      </dl>
      <div className={s.chartHeading}>
        <div><h4>Histórico registrado</h4><p>Comparação de entradas, saídas e admissões</p></div>
        <div className={s.chartTabs} role="group" aria-label="Agrupar histórico">
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>Mensal</button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>Anual</button>
        </div>
      </div>
      <div className={s.legend} aria-hidden="true"><span data-tone="admission">Admissões</span><span data-tone="in">Recebidas</span><span data-tone="out">Enviadas</span></div>
      {seriesHasData ? <div className={s.chartScroll} role="region" aria-label="Gráfico de movimentações, com rolagem horizontal quando necessário" tabIndex={0}>
        <ul className={s.chart} style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0,1fr))`, minWidth: Math.max(450, series.length * 57) + "px" }}>
          {series.map(([key, point]) => <li key={key} aria-label={`${key}: ${point.admissoes} admissões, ${point.transferenciasEntrada} recebidas e ${point.transferenciasSaida} enviadas`}>
            <div className={s.columns} aria-hidden="true">
              {[point.admissoes, point.transferenciasEntrada, point.transferenciasSaida].map((value, index) =>
                <span key={index} data-series={index} title={counts.format(value)} style={{ height: (value ? Math.max(3, value / maxSeries * 100) : 0) + "%" }}/>)}
            </div>
            <time dateTime={key}>{shortPeriod(key,annual)}</time>
          </li>)}
        </ul>
      </div> : <p className={s.empty}>Ainda não há movimentações registradas neste período.</p>}
      {seriesHasData && <details className={s.chartDetails}><summary>Ver os números do gráfico em tabela</summary>
        <div className={s.chartTableWrap}><table><thead><tr><th>Período</th><th>Admissões</th><th>Recebidas</th><th>Enviadas</th></tr></thead><tbody>{series.map(([key, value]) =>
          <tr key={key}><td>{key}</td><td>{value.admissoes}</td><td>{value.transferenciasEntrada}</td><td>{value.transferenciasSaida}</td></tr>)}</tbody></table></div>
      </details>}
    </section>

    <div className={s.sectionHeading}><div><span className={s.overline}>PERFIL DA COMUNIDADE</span><h2>Entenda nossa membresia</h2>
      <p>Informações demográficas calculadas a partir dos registros existentes.</p></div></div>
    <div className={s.demographics}>
      <DemographicCard title="Faixa etária" description={`Base de ${counts.format(demographics.base)} cadastros ativos. ${counts.format(demographics.missingBirthDate)} sem nascimento.`}
        rows={demographics.age.map(row => ({ label: row.label, count: row.count }))}/>
      <DemographicCard title="Tempo de igreja" description={`Desde a primeira frequência. ${counts.format(demographics.missingChurchTime)} sem essa data.`}
        rows={demographics.churchTime.map(row => ({ label: row.label, count: row.count }))}/>
      <DemographicCard title="Distribuição por sexo" description={`Base de ${counts.format(demographics.base)} pessoas com cadastro ativo.`}
        rows={[
          { label: "Feminino", count: demographics.sex.FEMALE }, { label: "Masculino", count: demographics.sex.MALE },
          { label: "Outro", count: demographics.sex.OTHER }, { label: "Não informado", count: demographics.sex.unknown },
        ]}/>
      <DemographicCard title="Idade no início da frequência" description={`${counts.format(demographics.missingAgeAtAttendance)} cadastros sem as datas necessárias.`}
        rows={demographics.ageAtFirstAttendance.map(row => ({ label: row.label, count: row.count }))}/>
      <DemographicCard title="Tempo de vínculo como membro" description="Desde o início do vínculo, para membros ativos."
        rows={demographics.membershipTime.map(row => ({ label: row.label, count: row.count }))}/>
    </div>
    <p className={s.dataNote}><UIIcon name="shield" size={16}/> Indicadores construídos a partir da API de homologação. Dados não informados são sinalizados; valores não são inventados.</p>
  </div>;
}
