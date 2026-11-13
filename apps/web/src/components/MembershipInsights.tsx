"use client";

import { isAdminEnabled } from "../lib/admin-environment";
import { useCallback, useEffect, useState } from "react";
import { AppNavLink, AppShell } from "./AppShell";
import { ApiRequestError, apiGet, loadStoredToken } from "../lib/api";
import {
  fmtNumber, formattedDate, makeCsv, makeLinePoints,
  type CountBand, type GrowthPoint, type MembershipInsightsData,
} from "./membership-insights-model";
import s from "./membership-insights.module.css";

type Phase = "checking" | "signed-out" | "forbidden" | "unavailable" | "disabled" | "ready";
type OccasionType = "birthday" | "baptism" | "wedding";
const OCCASIONS: Array<{ id: OccasionType; label: string }> = [
  { id: "birthday", label: "Aniversários" },
  { id: "baptism", label: "Batismo" },
  { id: "wedding", label: "Casamento" },
];
const STATUS = [
  { key: "ACTIVE", label: "Ativos", tone: "forest" },
  { key: "INACTIVE", label: "Inativos", tone: "slate" },
  { key: "PENDING_ADMISSION", label: "Em admissão", tone: "gold" },
  { key: "TRANSFERRED", label: "Transferidos", tone: "blue" },
];
const SEX = [
  { key: "FEMALE", label: "Feminino", tone: "plum" },
  { key: "MALE", label: "Masculino", tone: "blue" },
  { key: "OTHER", label: "Outro", tone: "forest" },
  { key: "UNKNOWN", label: "Não informado", tone: "slate" },
];
function pct(value: number, total: number) { return total > 0 ? Math.round(value / total * 1000) / 10 : 0; }
function Metric({ label, value, hint, tone }: { label: string; value: number; hint: string; tone: string }) {
  return <div className={s.metric} data-tone={tone}>
    <span className={s.metricLabel}>{label}</span>
    <strong>{fmtNumber(value)}</strong>
    <small>{hint}</small>
  </div>;
}
function LegendBar({ title, values, total, baseLabel }: {
  title: string;
  values: Array<{ key: string; label: string; tone: string }>;
  total: Record<string, number>;
  baseLabel: string;
}) {
  const sum = values.reduce((acc, v) => acc + (total[v.key] ?? 0), 0);
  return <section className={s.panel}>
    <header className={s.panelHead}><div><span className={s.eyebrow}>COMPOSIÇÃO</span><h2>{title}</h2><p>{baseLabel} · {fmtNumber(sum)} registros</p></div></header>
    {sum > 0 ? <>
      <div className={s.segmented} role="img" aria-label={values.map(v => v.label + " " + (total[v.key] ?? 0)).join(", ")}>
        {values.map(v => <span key={v.key} data-tone={v.tone} style={{ width: pct(total[v.key] ?? 0, sum) + "%" }} />)}
      </div>
      <div className={s.legend}>
        {values.map(v => <div key={v.key} className={s.legendItem}>
          <span className={s.legendDot} data-tone={v.tone} aria-hidden="true" />
          <span>{v.label}</span>
          <strong>{fmtNumber(total[v.key] ?? 0)}</strong>
          <small>{pct(total[v.key] ?? 0, sum).toLocaleString("pt-BR")}%</small>
        </div>)}
      </div>
    </> : <p className={s.empty}>Nenhum vínculo encontrado.</p>}
  </section>;
}
function Bands({ title, subtitle, rows, missing }: { title: string; subtitle: string; rows: CountBand[]; missing?: number }) {
  const max = Math.max(1, ...rows.map(b => b.count));
  return <section className={s.panel}>
    <header className={s.panelHead}><div><span className={s.eyebrow}>PERFIL DA COMUNIDADE</span><h2>{title}</h2><p>{subtitle}</p></div></header>
    <div className={s.bands}>{rows.map(row => <div className={s.bandRow} key={row.label}>
      <span>{row.label}</span>
      <div className={s.bandTrack}><i style={{ width: row.count / max * 100 + "%" }} /></div>
      <strong>{fmtNumber(row.count)}</strong>
    </div>)}</div>
    {missing !== undefined && <p className={s.footnote}>{fmtNumber(missing)} sem informação suficiente para este gráfico.</p>}
  </section>;
}
function Trend({ months, years }: { months: GrowthPoint[]; years: GrowthPoint[] }) {
  const [tab, setTab] = useState<"months" | "years">("months");
  const rows = tab === "months" ? months : years;
  const max = Math.max(1, ...rows.map(row => Math.max(row.newMemberships, row.exits)));
  const entryPoints = makeLinePoints(rows.map(r => r.newMemberships), 660, 204, max);
  const exitPoints = makeLinePoints(rows.map(r => r.exits), 660, 204, max);
  const path = (pts: ReturnType<typeof makeLinePoints>) => pts.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + "," + p.y.toFixed(1)).join(" ");
  return <section className={s.panel}>
    <header className={s.panelHead}>
      <div><span className={s.eyebrow}>MOVIMENTAÇÃO</span><h2>Entradas e saídas registradas</h2><p>Vínculos iniciados e encerrados no período, conforme datas cadastradas.</p></div>
      <div className={s.tabs} role="group" aria-label="Agrupar evolução">
        <button type="button" aria-pressed={tab === "months"} onClick={() => setTab("months")}>Mensal</button>
        <button type="button" aria-pressed={tab === "years"} onClick={() => setTab("years")}>Anual</button>
      </div>
    </header>
    <div className={s.trendLegend}><span><i data-tone="forest"/> Novos vínculos</span><span><i data-tone="gold"/> Encerramentos</span></div>
    {rows.length > 0 ? <>
      <div className={s.chart}>
        <svg viewBox="0 0 660 204" role="img" aria-label="Gráfico de entradas e saídas por período">
          {[0,1,2,3,4].map(i => <line key={i} x1="22" y1={14 + i * 37} x2="638" y2={14 + i * 37} className={s.gridline}/>)}
          <path d={path(entryPoints)} className={s.entriesLine}/>
          <path d={path(exitPoints)} className={s.exitsLine}/>
          {entryPoints.map((p,i) => <circle key={"e"+i} cx={p.x} cy={p.y} r="4" className={s.entriesDot}><title>{rows[i].label}: {rows[i].newMemberships} entradas</title></circle>)}
          {exitPoints.map((p,i) => <circle key={"x"+i} cx={p.x} cy={p.y} r="3" className={s.exitsDot}><title>{rows[i].label}: {rows[i].exits} saídas</title></circle>)}
        </svg>
      </div>
      <div className={s.chartLabels}>{rows.filter((_,i) => rows.length <= 12 || i % 3 === 0).map(row => <span key={row.label}>{row.label}</span>)}</div>
      <details className={s.details}><summary>Ver valores do gráfico</summary>
        <div className={s.tableScroll}><table><thead><tr><th>Período</th><th>Entradas</th><th>Saídas</th></tr></thead><tbody>
          {rows.map(row => <tr key={row.label}><td>{row.label}</td><td>{row.newMemberships}</td><td>{row.exits}</td></tr>)}
        </tbody></table></div>
      </details>
    </> : <p className={s.empty}>Sem registros no intervalo informado.</p>}
  </section>;
}

export function MembershipInsights() {
  const enabled = isAdminEnabled();
  const [phase, setPhase] = useState<Phase>(enabled ? "checking" : "disabled");
  const [data, setData] = useState<MembershipInsightsData | null>(null);
  const [draftFrom, setDraftFrom] = useState("");
  const [draftTo, setDraftTo] = useState("");
  const [period, setPeriod] = useState({ from: "", to: "" });
  const [requestId, setRequestId] = useState(0);
  const [occasion, setOccasion] = useState<OccasionType>("birthday");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const token = loadStoredToken();
    if (!token) { setPhase("signed-out"); setData(null); return; }
    setPhase("checking");
    try {
      const query = new URLSearchParams();
      if (period.from) query.set("from", period.from);
      if (period.to) query.set("to", period.to);
      const response = await apiGet<MembershipInsightsData>("/reports/membership-insights" + (query.size ? "?" + query.toString() : ""), token);
      if (!response?.totals || !response?.growth || !Array.isArray(response.occasions)) throw new Error("A API retornou um relatório incompleto.");
      setData(response); setPhase("ready"); setNotice("");
    } catch (error) {
      setData(null);
      if (error instanceof ApiRequestError && error.status === 401) setPhase("signed-out");
      else if (error instanceof ApiRequestError && error.status === 403) setPhase("forbidden");
      else { setPhase("unavailable"); setNotice(error instanceof Error ? error.message : "Não foi possível consultar os indicadores."); }
    }
  }, [period.from, period.to]);
  useEffect(() => { if (enabled) void load(); }, [enabled, load, requestId]);

  function applyPeriod(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (draftFrom && draftTo && draftFrom > draftTo) { setNotice("A data inicial deve ser anterior à data final."); return; }
    setPeriod({ from: draftFrom, to: draftTo });
    if (draftFrom === period.from && draftTo === period.to) setRequestId(n => n+1);
  }
  function downloadCsv() {
    if (!data) return;
    const blob = new Blob([makeCsv(data)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = "id-riacho1-membresia.csv";
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const occasionRows = data?.occasions.filter(entry => entry.type === occasion) ?? [];
  return <AppShell active="secretaria" secretarySection="resumo" meta="Indicadores de membresia">
    <main className={s.page} data-membership-insights>
      <header className={s.hero}>
        <div className={s.heroContent}>
          <span className={s.heroKicker}><i/> SECRETARIA · RIA­CHO FUNDO I</span>
          <h1>Pessoas, histórias e <em>pertencimento.</em></h1>
          <p>Uma visão completa da nossa comunidade, com informações responsáveis para cuidar melhor de cada pessoa.</p>
          <div className={s.heroLinks}>
            <AppNavLink href="/app/secretaria/pessoas/">Abrir fichas de pessoas <span aria-hidden="true">↗</span></AppNavLink>
            <AppNavLink href="/app/relatorios/">Relatórios operacionais <span aria-hidden="true">↗</span></AppNavLink>
          </div>
        </div>
        <div className={s.heroSeal} aria-hidden="true"><span>ID</span><small>R I A C H O 1</small></div>
      </header>
      <form className={s.toolbar} onSubmit={applyPeriod}>
        <div><span className={s.eyebrow}>VISÃO DA CONGREGAÇÃO</span><strong>Panorama de membresia</strong>
          <small>{data ? "Atualizado em " + new Date(data.generatedAt).toLocaleString("pt-BR") : "Dados do ambiente autorizado"}</small>
        </div>
        <label>De <input type="date" value={draftFrom} max={draftTo || undefined} onChange={e => setDraftFrom(e.target.value)} /></label>
        <label>Até <input type="date" value={draftTo} min={draftFrom || undefined} onChange={e => setDraftTo(e.target.value)} /></label>
        <button type="submit">Aplicar filtros</button>
        <button type="button" className={s.subtleButton} onClick={() => setRequestId(x => x+1)}>Atualizar</button>
      </form>
      {notice && <div role="alert" className={s.notice}>{notice}</div>}
      {phase !== "ready" && <section className={s.statePanel} role="status">
        <h2>{phase === "disabled" ? "Indicadores disponíveis na homologação" :
          phase === "checking" ? "Consultando informações…" :
          phase === "signed-out" ? "Entre para acessar a Secretaria" :
          phase === "forbidden" ? "Seu perfil não pode consultar estes indicadores" :
          "Não foi possível carregar o panorama"}</h2>
        <p>{phase === "disabled" ? "O painel utiliza somente os registros autorizados da API. Nenhum número fictício será exibido fora do ambiente de testes." :
          phase === "signed-out" ? "Esta visão exige uma sessão válida e permissão de Secretaria, Pastor ou Administração." :
          phase === "forbidden" ? "Os dados permanecem protegidos pela autorização do servidor." :
          phase === "checking" ? "Lendo dados da congregação com o seu acesso." :
          "Os dados não foram substituídos por valores simulados."}</p>
        {phase === "unavailable" && <button type="button" onClick={() => setRequestId(n => n+1)}>Tentar novamente</button>}
        {phase === "signed-out" && <AppNavLink href="/login/">Ir para o login</AppNavLink>}
      </section>}
      {phase === "ready" && data && <>
        <section className={s.metrics} aria-label="Indicadores principais">
          <Metric label="Pessoas cadastradas" value={data.totals.registeredPersons} hint="Na congregação" tone="dark" />
          <Metric label="Membros ativos" value={data.totals.activeMembers} hint="Vínculos ativos" tone="forest" />
          <Metric label="Em admissão" value={data.totals.pendingAdmission} hint="Acompanhamento da Secretaria" tone="gold" />
          <Metric label="Membros inativos" value={data.totals.inactiveMembers} hint="Vínculos inativos" tone="slate" />
        </section>
        <div className={s.sectionIntro}><div><span className={s.eyebrow}>OLHAR SOBRE A IGREJA</span><h2>Quem faz parte da nossa comunidade</h2></div><div className={s.exportActions}>
          <button type="button" onClick={downloadCsv}>Exportar CSV</button>
          <button type="button" onClick={() => window.print()}>Imprimir / salvar PDF</button>
        </div></div>
        <div className={s.twoColumns}>
          <LegendBar title="Situação eclesiástica" baseLabel="Base de vínculos" values={STATUS} total={data.byStatus}/>
          <LegendBar title="Distribuição por sexo" baseLabel="Membros ativos" values={SEX} total={data.bySex}/>
        </div>
        <div className={s.twoColumns}>
          <Bands title="Faixa etária" subtitle="Membros ativos, segundo data de nascimento" rows={data.ages.bands} missing={data.ages.missing}/>
          <Bands title="Tempo como membro" subtitle="Estimativa pela data de início do vínculo" rows={data.tenure.member}/>
        </div>
        <div className={s.twoColumns}>
          <Bands title="Tempo frequentando a igreja" subtitle="Conforme primeira frequência registrada" rows={data.tenure.attending} missing={data.tenure.missingFirstAttendance}/>
          <section className={s.panel}>
            <header className={s.panelHead}><div><span className={s.eyebrow}>QUALIDADE CADASTRAL</span><h2>Base completa, cuidado melhor</h2><p>Datas de nascimento informadas entre os membros ativos.</p></div></header>
            <div className={s.coverage}><strong>{pct(data.coverage.activeWithBirthDate, data.coverage.activeTotal).toLocaleString("pt-BR")}%</strong><span>com nascimento preenchido</span></div>
            <div className={s.coverageTrack}><i style={{width: pct(data.coverage.activeWithBirthDate, data.coverage.activeTotal) + "%"}} /></div>
            <p className={s.footnote}>Faltam {fmtNumber(data.ages.missing)} registros para completar este indicador. Corrija pela ficha autorizada, sem criar dados artificiais.</p>
            <AppNavLink className={s.inlineLink} href="/app/secretaria/pessoas/">Ir para a Secretaria ↗</AppNavLink>
          </section>
        </div>
        <Trend months={data.growth.months} years={data.growth.years}/>
        <div className={s.twoColumns}>
          <section className={s.panel}>
            <header className={s.panelHead}><div><span className={s.eyebrow}>DATAS IMPORTANTES</span><h2>Celebrar cada história</h2><p>Próximos 30 dias · somente pessoas adultas</p></div></header>
            <div className={s.tabs} role="group" aria-label="Tipo de comemoração">{OCCASIONS.map(item =>
              <button key={item.id} type="button" aria-pressed={occasion === item.id} onClick={() => setOccasion(item.id)}>{item.label}</button>
            )}</div>
            {occasionRows.length ? <ul className={s.personList}>{occasionRows.slice(0,12).map(row =>
              <li key={row.type + row.personId}><div className={s.personMark} aria-hidden="true">{row.name.charAt(0)}</div><div><strong>{row.name}</strong><span>{formattedDate(row.date)} · {row.daysAway === 0 ? "Hoje" : "em " + row.daysAway + " dia(s)"}</span></div><span className={s.personTag}>{row.years} anos</span></li>
            )}</ul> : <p className={s.empty}>Nenhuma comemoração registrada para os próximos 30 dias.</p>}
          </section>
          <section className={s.panel}>
            <header className={s.panelHead}><div><span className={s.eyebrow}>MOVIMENTAÇÃO E ACOLHIMENTO</span><h2>Acompanhamento da congregação</h2><p>Transferências concluídas no período selecionado.</p></div></header>
            <div className={s.movements}>
              <div><span>Recebidas</span><strong>{fmtNumber(data.movements.transfersIn)}</strong></div>
              <div><span>Enviadas</span><strong>{fmtNumber(data.movements.transfersOut)}</strong></div>
              <div><span>Saldo de transferências</span><strong>{data.movements.netTransfers > 0 ? "+" : ""}{fmtNumber(data.movements.netTransfers)}</strong></div>
            </div>
            <h3 className={s.smallTitle}>Novos cadastros · últimos 30 dias</h3>
            {data.recent.length ? <ul className={s.recentList}>{data.recent.map(p => <li key={p.id}><strong>{p.name}</strong><span>{formattedDate(p.date)}</span></li>)}</ul>
              : <p className={s.empty}>Nenhum novo cadastro adulto neste período.</p>}
          </section>
        </div>
        <aside className={s.methodNote} aria-label="Como interpretar os dados">
          <strong>Sobre os indicadores</strong>
          {data.notes.map(note => <p key={note}>{note}</p>)}
          <p>Dados exclusivos do perfil autorizado. Acesso indevido e informações de menores permanecem protegidos.</p>
        </aside>
      </>}
    </main>
  </AppShell>;
}
