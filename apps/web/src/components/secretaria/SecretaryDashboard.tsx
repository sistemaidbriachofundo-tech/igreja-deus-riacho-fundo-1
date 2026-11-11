"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiGet } from "../../lib/api";
import { Alert } from "../ui/Alert";
import { ReportBars, ReportHeadline, ReportMetric } from "../ReportDashboard";
import s from "./secretary-dashboard.module.css";

const groups = [
  ["membros", "Membros"], ["nao_membros", "Não membros"], ["inativos", "Inativos"],
  ["em_admissao", "Em admissão"], ["transferidos", "Transferidos"],
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
const percentage = new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 });
const dateLabel = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", timeZone: "UTC" });
const formatDay = (date: string) => dateLabel.format(new Date(date + "T12:00:00Z"));

const activityLabels = {
  birth: "Aniversários", baptism: "Batismos", wedding: "Casamentos",
  new: "Cadastros novos", changed: "Alterações", visitors: "Visitantes cadastrados",
};
type Activity = keyof typeof activityLabels;

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
  const [upcoming, setUpcoming] = useState(false);
  const [annual, setAnnual] = useState(false);
  const [limit, setLimit] = useState(8);
  const [groupLimit, setGroupLimit] = useState(8);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let current = true;
    setLoading(true);
    setError(false);
    const params = selectedPeriod ? "?" + new URLSearchParams(selectedPeriod).toString() : "";
    apiGet<Overview>("/persons/secretary-overview" + params, token).then(data => {
      if (!current) return;
      setOverview(data);
      setDraft(data.period);
    }).catch(() => { if (current) setError(true); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, revision, retry, selectedPeriod]);

  function applyPeriod(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draft && draft.from <= draft.to) setSelectedPeriod({ ...draft });
  }

  function selectGroup(next: Group) {
    setGroup(group === next ? null : next);
    setQuery("");
    setGroupLimit(8);
  }

  if (!overview && loading) return <section className={s.panel} role="status">Carregando o painel de membresia…</section>;
  if (!overview) return <section className={s.panel}>
    <Alert appearance="workspace" tone="warning" title="O painel de membresia não carregou." />
    <button className={s.secondary} type="button" onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>
  </section>;

  const celebrations = activity === "birth" || activity === "baptism" || activity === "wedding";
  const activityRows = celebrations
    ? overview.celebrations[activity].filter(row => upcoming || row.date === overview.today)
    : overview.recent[activity];
  const matchingPeople = group ? overview.people.filter(row => row.group === group &&
    row.name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))) : [];
  const { demographics, movements } = overview;
  const series = Object.entries(annual ? movements.byYear : movements.byMonth);
  const scale = Math.max(1, ...series.map(([, value]) => Math.max(value.admissoes, value.transferenciasEntrada, value.transferenciasSaida)));

  return <div className={s.dashboard} aria-busy={loading}>
    <ReportHeadline label="Pessoas cadastradas" value={overview.total}>
      <ReportMetric label="Membros" value={overview.byCategory.membros} />
      <ReportMetric label="Famílias cadastradas" value={households} />
      <ReportMetric label="Carteirinhas ativas" value={credentials} href="/app/membros/carteirinha/" />
    </ReportHeadline>

    {error && <Alert appearance="workspace" tone="warning" title="A atualização do painel falhou.">
      Os valores abaixo são do último carregamento. <button type="button" className={s.secondary} onClick={() => setRetry(value => value + 1)}>Tentar novamente</button>
    </Alert>}

    <div className={s.top}>
      <section className={s.panel} aria-label="Composição da membresia">
        <header><h2>Composição da membresia</h2><p>Selecione uma situação para abrir as fichas.</p></header>
        <div className={s.composition} aria-hidden="true">{groups.map(([key]) => (
          <span key={key} data-group={key} style={{ flexGrow: overview.byCategory[key] }} />
        ))}</div>
        <div className={s.categories}>{groups.map(([key, label]) => (
          <button key={key} data-group={key} type="button" aria-pressed={group === key} onClick={() => selectGroup(key)}>
            <i aria-hidden="true" /><span>{label}</span><strong>{counts.format(overview.byCategory[key])}</strong>
            <small>{percentage.format(overview.total ? overview.byCategory[key] / overview.total : 0)}</small>
          </button>
        ))}</div>
        {group && <div className={s.people}>
          <label>Buscar no grupo<input type="search" value={query} onChange={event => { setQuery(event.target.value); setGroupLimit(8); }} /></label>
          <p role="status">{counts.format(matchingPeople.length)} {matchingPeople.length === 1 ? "pessoa encontrada" : "pessoas encontradas"}</p>
          <ul className={s.personList}>{matchingPeople.slice(0, groupLimit).map(row => <li key={row.id}>
            <button type="button" onClick={() => onOpenPerson(row.id)}>{row.name}<span aria-hidden="true">↗</span></button>
          </li>)}</ul>
          {groupLimit < matchingPeople.length && <button className={s.secondary} type="button" onClick={() => setGroupLimit(value => value + 8)}>Mostrar mais pessoas</button>}
        </div>}
      </section>

      <section className={s.panel} aria-label="Acompanhamento da Secretaria">
        <header><h2>Acompanhamento</h2><p>Comemorações e movimentações do cadastro.</p></header>
        <div className={s.controls} role="group" aria-label="Lista de acompanhamento">
          {Object.entries(activityLabels).map(([key, label]) => <button key={key} type="button" aria-pressed={activity === key}
            onClick={() => { setActivity(key as Activity); setLimit(8); }}>{label}</button>)}
        </div>
        {celebrations && <div className={s.controls} role="group" aria-label="Período das comemorações">
          <button type="button" aria-pressed={!upcoming} onClick={() => setUpcoming(false)}>Hoje</button>
          <button type="button" aria-pressed={upcoming} onClick={() => setUpcoming(true)}>Próximos 7 dias</button>
        </div>}
        <p className={s.caption}>{counts.format(activityRows.length)} {activityRows.length === 1 ? "registro" : "registros"}{celebrations ? "" : " nos últimos 30 dias"}</p>
        {activityRows.length ? <ul className={s.personList}>{activityRows.slice(0, limit).map(row => <li key={row.id + row.date}>
          <button type="button" onClick={() => onOpenPerson(row.id)}>{row.name}<time dateTime={row.date}>{formatDay(row.date)}</time></button>
        </li>)}</ul> : <p className={s.empty}>Nenhum registro para este período.</p>}
        {limit < activityRows.length && <button className={s.secondary} type="button" onClick={() => setLimit(value => value + 8)}>Mostrar mais registros</button>}
      </section>
    </div>

    <section className={s.panel} aria-label="Movimentações da membresia">
      <header><h2>Movimentações da membresia</h2><p>Admissões aprovadas e transferências concluídas registradas no sistema.</p></header>
      {draft && <form className={s.period} onSubmit={applyPeriod}>
        <label>De<input type="date" required value={draft.from} max={draft.to} onChange={event => setDraft({ ...draft, from: event.target.value })} /></label>
        <label>Até<input type="date" required value={draft.to} min={draft.from} max={overview.today} onChange={event => setDraft({ ...draft, to: event.target.value })} /></label>
        <button className={s.secondary} type="submit" disabled={loading}>Aplicar período</button>
      </form>}
      <dl className={s.movementSummary} aria-label="Totais do período selecionado">
        <div><dt>Admissões</dt><dd>{counts.format(movements.period.admissoes)}</dd></div>
        <div><dt>Transferências recebidas</dt><dd>{counts.format(movements.period.transferenciasEntrada)}</dd></div>
        <div><dt>Transferências enviadas</dt><dd>{counts.format(movements.period.transferenciasSaida)}</dd></div>
        <div><dt>Saldo registrado</dt><dd>{counts.format(movements.period.admissoes + movements.period.transferenciasEntrada - movements.period.transferenciasSaida)}</dd></div>
      </dl>
      <div className={s.chartHeading}>
        <h3>Histórico registrado</h3>
        <div className={s.controls} role="group" aria-label="Agrupar histórico">
          <button type="button" aria-pressed={!annual} onClick={() => setAnnual(false)}>Mensal</button>
          <button type="button" aria-pressed={annual} onClick={() => setAnnual(true)}>Anual</button>
        </div>
      </div>
      <div className={s.legend} aria-hidden="true"><span>Admissões</span><span>Entradas</span><span>Saídas</span></div>
      <ul className={s.chart} style={{ gridTemplateColumns: `repeat(${series.length}, minmax(0, 1fr))` }}>
        {series.map(([key, point]) => <li key={key} aria-label={`${key}, ${point.admissoes} admissões, ${point.transferenciasEntrada} entradas, ${point.transferenciasSaida} saídas`}>
          <div className={s.columns} aria-hidden="true">{Object.values(point).map((value, index) =>
            <span key={index} style={{ height: `${value / scale * 100}%` }} />)}</div>
          <time dateTime={key}>{annual ? key : key.slice(5)}</time>
        </li>)}
      </ul>
    </section>

    <div className={s.demographics}>
      <ReportBars title="Faixa etária" description={`Base de ${counts.format(demographics.base)} pessoas com cadastro ativo. ${counts.format(demographics.missingBirthDate)} sem data de nascimento.`}
        rows={demographics.age.map(row => ({ label: row.label, value: row.count }))} />
      <ReportBars title="Tempo de igreja" description={`Desde a primeira frequência registrada. ${counts.format(demographics.missingChurchTime)} pessoas sem essa data.`}
        rows={demographics.churchTime.map(row => ({ label: row.label, value: row.count }))} />
      <ReportBars title="Distribuição por sexo" description={`Base de ${counts.format(demographics.base)} pessoas com cadastro ativo.`}
        rows={[
          { label: "Feminino", value: demographics.sex.FEMALE }, { label: "Masculino", value: demographics.sex.MALE },
          { label: "Outro", value: demographics.sex.OTHER }, { label: "Sem informação", value: demographics.sex.unknown },
        ]} />
      <ReportBars title="Idade quando começou a frequentar" description={`${counts.format(demographics.missingAgeAtAttendance)} pessoas sem as duas datas necessárias.`}
        rows={demographics.ageAtFirstAttendance.map(row => ({ label: row.label, value: row.count }))} />
      <ReportBars title="Tempo de vínculo dos membros" description="Desde o início do vínculo registrado para os membros ativos."
        rows={demographics.membershipTime.map(row => ({ label: row.label, value: row.count }))} />
    </div>
  </div>;
}
