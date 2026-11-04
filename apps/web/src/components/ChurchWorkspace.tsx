"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AppShell } from "./AppShell";
import { withBasePath } from "../lib/paths";
import {
  SYNTHETIC_STORE_KEY, STATUS_LABEL, STAGE_LABEL, MODALITY_LABEL,
  initialMembers, isMembersDataset, summarize, filterMembers, createMember,
  openAdmission, advanceAdmission, updateMemberNotes, setMemberCard,
  type Member, type MemberInput, type MemberStatus, type Modality, type OperationResult,
} from "../lib/church-synthetic";
import styles from "./church-workspace.module.css";

export type WorkspaceView = "overview" | "members" | "secretary" | "cards";

function Icon({ name, size = 20 }: { name: "users" | "heart" | "file" | "card" | "search" | "plus" | "arrow" | "check" | "calendar" | "bell" | "filter" | "refresh" | "family" | "clock"; size?: number }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.85, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths = {
    users: <><circle cx="9" cy="7.5" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2H3Z"/><circle cx="18" cy="8" r="2"/><path d="M17 14c2.5.3 4 2 4 4.5V20"/></>,
    heart: <path d="M20.8 4.9a5.3 5.3 0 0 0-7.5 0L12 6.2l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-8.6a5.3 5.3 0 0 0 0-7.5Z"/>,
    file: <><path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z"/><path d="M14 2v6h5M8 13h8M8 17h6"/></>,
    card: <><rect x="2.5" y="5" width="19" height="14" rx="2.2"/><path d="M2.5 10h19M6 15h5"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 5 5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 2v6m10-6v6M3 11h18"/></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9ZM10 21h4"/></>,
    filter: <><path d="M4 6h16M7 12h10M10 18h4"/></>,
    refresh: <><path d="M20 5v6h-6M4 19v-6h6"/><path d="M5.5 9a7 7 0 0 1 12.2-3L20 11M4 13l2.4 5A7 7 0 0 0 18 15"/></>,
    family: <><path d="M3 21V9l9-7 9 7v12H3Z"/><path d="M9 21v-8h6v8"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false" {...common}>{paths[name]}</svg>;
}
function statusTone(status: MemberStatus) {
  return status === "ACTIVE" ? styles.greenBadge : status === "PENDING_ADMISSION" ? styles.amberBadge : status === "VISITOR" ? styles.blueBadge : styles.grayBadge;
}
function Badge({ status }: { status: MemberStatus }) {
  return <span className={statusTone(status)}><span className={styles.badgeDot} />{STATUS_LABEL[status]}</span>;
}
function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "").join("");
}
function readableDate(date: string) {
  const value = new Date(date + "T12:00:00");
  return Number.isNaN(value.getTime()) ? "—" : value.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}
function SmallAvatar({ name, large = false }: { name: string; large?: boolean }) {
  const palette = ["#f3dfc2", "#e9e2d5", "#f0dbc9", "#e4dfc9", "#f6e4d6"];
  const sum = [...name].reduce((n, c) => n + c.charCodeAt(0), 0);
  return <span className={large ? styles.avatarLarge : styles.avatar} style={{ background: palette[sum % palette.length] }} aria-hidden="true">{initials(name)}</span>;
}
function Kpi({ label, value, sub, icon, trend }: { label: string; value: number; sub: string; icon: "users" | "heart" | "file" | "card"; trend?: string }) {
  return <article className={styles.kpi}>
    <div className={styles.kpiTop}><span>{label}</span><span className={styles.kpiIcon}><Icon name={icon} /></span></div>
    <div className={styles.kpiValue}>{value}<span className={styles.kpiTrend}>{trend ?? ""}</span></div>
    <p>{sub}</p>
  </article>;
}
function CardEmblem() {
  return <svg width="42" height="42" viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M21 4h6v16h13v6H27v17h-6V26H8v-6h13V4Z" fill="currentColor"/><path d="M34 8c-3 6-1 11 1 15 3 6 3 12-1 18 8-4 12-12 9-20-1-4-6-8-9-13Z" fill="currentColor"/></svg>;
}
function MemberCard({ person }: { person: Member }) {
  return <div className={styles.identityCard} aria-label={"Carteirinha sintética de " + person.name}>
    <div className={styles.identityBrand}><span className={styles.identityEmblem}><CardEmblem /></span><span>IGREJA DE DEUS<small>NO RIACHO FUNDO I</small></span><span className={styles.identityCross}>✦</span></div>
    <div><p className={styles.identityOverline}>Identificação eclesiástica</p><strong className={styles.identityName}>{person.name}</strong><span className={styles.identitySubtitle}>{person.family}</span></div>
    <div className={styles.identityFoot}><span>MEMBRO ATIVO</span><span>{person.id}</span></div>
    <div className={styles.identityWatermark}>DADO SINTÉTICO • SEM VALIDADE</div>
  </div>;
}
function MemberRows({ members, onSelect, empty = "Nenhum registro encontrado." }: { members: Member[]; onSelect: (id: string) => void; empty?: string }) {
  if (members.length === 0) return <p className={styles.empty}>{empty}</p>;
  return <div className={styles.tableWrap}><table className={styles.table}>
    <thead><tr><th>Pessoa</th><th>Família</th><th>Situação</th><th>Carteirinha</th><th aria-label="Abrir cadastro" /></tr></thead>
    <tbody>{members.map((m) => <tr key={m.id} onClick={() => onSelect(m.id)}>
      <td><button type="button" className={styles.personButton} onClick={(event) => { event.stopPropagation(); onSelect(m.id); }}><SmallAvatar name={m.name}/><span><strong>{m.name}</strong><small>{m.email}</small></span></button></td>
      <td><span className={styles.cellMain}>{m.family}</span><small className={styles.cellSub}>{m.ministry}</small></td>
      <td><Badge status={m.status}/></td>
      <td><span className={m.card === "ACTIVE" ? styles.cardActive : styles.cardMuted}>{m.card === "ACTIVE" ? "Emitida" : m.card === "REVOKED" ? "Revogada" : "Não emitida"}</span></td>
      <td><button className={styles.rowArrow} aria-label={"Abrir " + m.name} type="button" onClick={(event) => { event.stopPropagation(); onSelect(m.id); }}><Icon name="arrow" size={17}/></button></td>
    </tr>)}</tbody></table></div>;
}
const cardSubsets = [
  { name: "Ativos", status: "ACTIVE" as const, tone: "#b48c45" },
  { name: "Em admissão", status: "PENDING_ADMISSION" as const, tone: "#cb9b58" },
  { name: "Visitantes", status: "VISITOR" as const, tone: "#a99b84" },
  { name: "Inativos", status: "INACTIVE" as const, tone: "#665447" },
];

export function ChurchWorkspace({ view }: { view: WorkspaceView }) {
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [personForm, setPersonForm] = useState<MemberInput>({ name: "", email: "", family: "", phone: "" });
  const [responsible, setResponsible] = useState<"SECRETARIA" | "PASTOR">("SECRETARIA");
  const [modality, setModality] = useState<Modality>("BATISMO");
  const [notesDraft, setNotesDraft] = useState("");
  const [notice, setNotice] = useState("");
  const [cardsFilter, setCardsFilter] = useState("ALL");
  const [admissionFilter, setAdmissionFilter] = useState("ALL");

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SYNTHETIC_STORE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isMembersDataset(parsed)) setMembers(parsed);
      }
    } catch { /* malformed local fixture: use safe seed */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) {
      try { window.localStorage.setItem(SYNTHETIC_STORE_KEY, JSON.stringify(members)); }
      catch { /* Browsers may deny local persistence; current session still works */ }
    }
  }, [members, hydrated]);
  useEffect(() => {
    if (!selectedId && !createOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setSelectedId(null); setCreateOpen(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, createOpen]);

  const stats = useMemo(() => summarize(members), [members]);
  const filtered = useMemo(() => filterMembers(members, query, filter), [members, query, filter]);
  const selected = members.find((p) => p.id === selectedId);
  const pending = members.filter((p) => p.status === "PENDING_ADMISSION");
  const eligible = members.filter((p) => p.status === "ACTIVE");
  const cards = eligible.filter((p) => cardsFilter === "ALL" || (cardsFilter === "ISSUED" ? p.card === "ACTIVE" : p.card !== "ACTIVE"));
  const displayDate = "4 de novembro de 2026";

  function run(result: OperationResult, success: string) {
    if (result.ok) { setMembers(result.members); setNotice(success); }
    else setNotice(result.message);
    return result.ok;
  }
  function addPerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextId = "RF1-" + String(Math.max(...members.map((m) => Number(m.id.split("-").pop()) || 0), 0) + 1).padStart(4, "0");
    if (run(createMember(members, personForm, nextId), "Cadastro sintético registrado com sucesso.")) {
      setCreateOpen(false); setPersonForm({ name: "", email: "", family: "", phone: "" }); setSelectedId(nextId);
    }
  }
  function reset() {
    setMembers(initialMembers());
    setNotice("Base sintética restaurada. Nenhum dado da igreja foi alterado.");
    setSelectedId(null); setQuery(""); setFilter("ALL");
  }
  function openDetails(id: string) { setSelectedId(id); setNotice(""); setNotesDraft(members.find((m) => m.id === id)?.notes ?? ""); }

  const title = view === "overview" ? "Visão geral" : view === "members" ? "Membros e famílias" : view === "secretary" ? "Secretaria" : "Carteirinhas digitais";
  const description = view === "overview" ? "Um olhar completo sobre o cuidado e a gestão da congregação."
    : view === "members" ? "Pessoas, vínculos familiares e históricos em uma única base."
    : view === "secretary" ? "Acompanhe documentos, processos e aprovações com clareza."
    : "Emissão, consulta e controle de identificação eclesiástica.";

  return <AppShell active={view === "overview" ? "visao" : view === "members" ? "membros" : view === "secretary" ? "secretaria" : "carteirinha"} meta="Riacho Fundo I">
    <div className={styles.workspace}>
      <div className={styles.breadcrumb}><span>Gestão da igreja</span><span>/</span><strong>{title}</strong></div>
      <header className={styles.pageHeader}>
        <div><span className={styles.overline}>IGREJA DE DEUS · RIACHO FUNDO I</span><h1>{title}</h1><p>{description}</p></div>
        <div className={styles.headerActions}>
          <span className={styles.syntheticPill}><span className={styles.liveDot}/> Homologação · dados sintéticos</span>
          <button type="button" className={styles.primaryButton} onClick={() => { setCreateOpen(true); setNotice(""); }}><Icon name="plus" size={17}/> Novo cadastro</button>
        </div>
      </header>
      {notice && <div className={styles.notice} role="status"><Icon name="check" size={18}/>{notice}<button type="button" aria-label="Fechar mensagem" onClick={() => setNotice("")}>×</button></div>}

      {view === "overview" && <>
        <div className={styles.welcome}>
          <div className={styles.welcomeCopy}>
            <span className={styles.welcomeEyebrow}><Icon name="calendar" size={15}/> {displayDate}</span>
            <h2>Bem-vindo à gestão da nossa igreja.</h2>
            <p>Pessoas, famílias e processos organizados para que o cuidado esteja sempre em primeiro lugar.</p>
            <a className={styles.welcomeLink} href={withBasePath("/app/membros/")}>Consultar membros <Icon name="arrow" size={16}/></a>
          </div>
          <div className={styles.welcomeDecor} aria-hidden="true"><CardEmblem/><span>FÉ • FAMÍLIA • COMUNHÃO</span></div>
        </div>
        <div className={styles.kpiGrid}>
          <Kpi icon="users" label="Pessoas cadastradas" value={stats.total} sub="Base de homologação" />
          <Kpi icon="heart" label="Membros ativos" value={stats.active} sub="Membresias regulares" />
          <Kpi icon="file" label="Em admissão" value={stats.pending} sub="Protocolos em andamento" />
          <Kpi icon="card" label="Carteirinhas ativas" value={stats.issued} sub="Identificações emitidas" />
        </div>
        <div className={styles.dashboardGrid}>
          <section className={styles.surface}>
            <div className={styles.surfaceHead}><div><span className={styles.sectionOverline}>Panorama</span><h2>Composição da membresia</h2></div><span className={styles.miniTag}>Atualizado nesta sessão</span></div>
            <div className={styles.distributionBar} role="img" aria-label="Distribuição dos membros por situação">
              {cardSubsets.map((item) => { const total = members.filter((p) => p.status === item.status).length; return <span key={item.status} style={{ width: ((total / Math.max(stats.total, 1)) * 100) + "%", background: item.tone }} title={item.name + ": " + total}/>; })}
            </div>
            <div className={styles.breakdown}>{cardSubsets.map((item) => <div key={item.status}><span className={styles.legendDot} style={{ background: item.tone }}/><span>{item.name}</span><strong>{members.filter((p) => p.status === item.status).length}</strong></div>)}</div>
            <div className={styles.summaryFoot}><Icon name="family" size={18}/> <strong>{stats.families} famílias</strong> cadastradas nesta base sintética</div>
          </section>
          <section className={styles.surface}>
            <div className={styles.surfaceHead}><div><span className={styles.sectionOverline}>Acompanhamento</span><h2>Admissões pendentes</h2></div><a className={styles.textLink} href={withBasePath("/app/secretaria/")}>Ver todas <Icon name="arrow" size={15}/></a></div>
            <div className={styles.pendingList}>{pending.slice(0, 4).map((m) => <button type="button" key={m.id} onClick={() => openDetails(m.id)} className={styles.pendingItem}><SmallAvatar name={m.name}/><span><strong>{m.name}</strong><small>{STAGE_LABEL[m.stage]}</small></span><Icon name="arrow" size={17}/></button>)}</div>
          </section>
        </div>
        <section className={styles.surface}>
          <div className={styles.surfaceHead}><div><span className={styles.sectionOverline}>Cadastros</span><h2>Pessoas recentes</h2></div><a className={styles.textLink} href={withBasePath("/app/membros/")}>Ver diretório <Icon name="arrow" size={15}/></a></div>
          <MemberRows members={[...members].slice(-6).reverse()} onSelect={openDetails}/>
        </section>
      </>}

      {view === "members" && <>
        <div className={styles.kpiGrid}>
          <Kpi icon="users" label="Cadastros" value={stats.total} sub="Pessoas na unidade" />
          <Kpi icon="heart" label="Membresias ativas" value={stats.active} sub="Participação regular" />
          <Kpi icon="family" label="Famílias vinculadas" value={stats.families} sub="Núcleos familiares" />
          <Kpi icon="file" label="Novos visitantes" value={stats.visitors} sub="Aguardam acolhimento" />
        </div>
        <section className={styles.surface}>
          <div className={styles.surfaceHead}><div><span className={styles.sectionOverline}>Diretório</span><h2>Cadastro de pessoas <span className={styles.count}>{filtered.length}</span></h2></div><button className={styles.outlineButton} type="button" onClick={reset}><Icon name="refresh" size={16}/> Restaurar base</button></div>
          <div className={styles.filterbar}><label className={styles.search}><Icon name="search" size={18}/><input aria-label="Buscar pessoa, família ou ministério" placeholder="Buscar pessoa, família ou ministério" value={query} onChange={(e) => setQuery(e.target.value)}/></label>
            <label className={styles.selectWrapper}><Icon name="filter" size={16}/><select aria-label="Filtrar por situação" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="ALL">Todas as situações</option><option value="ACTIVE">Ativos</option><option value="PENDING_ADMISSION">Em admissão</option><option value="VISITOR">Visitantes</option><option value="INACTIVE">Inativos</option></select></label>
          </div>
          <MemberRows members={filtered} onSelect={openDetails} empty="Não encontramos pessoas para os filtros informados."/>
          <div className={styles.tableFooter}>Exibindo {filtered.length} de {stats.total} cadastros · Dados sintéticos salvos somente neste navegador</div>
        </section>
      </>}

      {view === "secretary" && <>
        <div className={styles.kpiGrid}>
          <Kpi icon="file" label="Protocolos abertos" value={stats.pending} sub="Em andamento" />
          <Kpi icon="clock" label="Aguardam pastor" value={pending.filter((m) => m.stage === "PASTOR").length} sub="Pendente de aprovação" />
          <Kpi icon="check" label="Conferência da Secretaria" value={pending.filter((m) => m.stage === "SECRETARIA").length} sub="Revisão documental" />
          <Kpi icon="users" label="Visitantes" value={stats.visitors} sub="Prontos para admissão" />
        </div>
        <section className={styles.surface}>
          <div className={styles.surfaceHead}><div><span className={styles.sectionOverline}>Secretaria</span><h2>Gestão de admissões</h2><p>Etapas de documentação, análise e aprovação pastoral</p></div>
            <label className={styles.actor}>Atuação na homologação<select aria-label="Responsável pela etapa" value={responsible} onChange={(e) => setResponsible(e.target.value as "SECRETARIA" | "PASTOR")}><option value="SECRETARIA">Secretaria</option><option value="PASTOR">Pastor</option></select></label>
          </div>
          <div className={styles.filterbar}><label className={styles.search}><Icon name="search" size={18}/><input aria-label="Buscar protocolo" placeholder="Pesquisar pessoa em admissão" value={query} onChange={(e) => setQuery(e.target.value)}/></label>
            <div className={styles.segmented} role="group" aria-label="Filtrar processos">{[{k:"ALL",t:"Todos"},{k:"DOCUMENTS",t:"Documentos"},{k:"SECRETARIA",t:"Secretaria"},{k:"PASTOR",t:"Pastor"}].map((o) => <button type="button" key={o.k} onClick={() => setAdmissionFilter(o.k)} className={admissionFilter === o.k ? styles.segmentActive : ""}>{o.t}</button>)}</div>
          </div>
          <div className={styles.protocolList}>{pending.filter((p) => (admissionFilter === "ALL" || p.stage === admissionFilter) && p.name.toLowerCase().includes(query.toLowerCase())).map((p) => <article className={styles.protocolCard} key={p.id}>
            <div className={styles.protocolProfile}><SmallAvatar name={p.name}/><div><strong>{p.name}</strong><small>{p.id} · {MODALITY_LABEL[p.modality]}</small></div></div>
            <div className={styles.stepTrack} aria-label={"Etapa atual: " + STAGE_LABEL[p.stage]}>{["DOCUMENTS", "SECRETARIA", "PASTOR"].map((step, index) => <span key={step} className={["DOCUMENTS", "SECRETARIA", "PASTOR"].indexOf(p.stage) >= index ? styles.stepLive : styles.stepDone} title={STAGE_LABEL[step as keyof typeof STAGE_LABEL]}/>)}</div>
            <span className={styles.stageName}>{STAGE_LABEL[p.stage]}</span>
            <button type="button" className={styles.miniButton} onClick={() => run(advanceAdmission(members, p.id, responsible), "Etapa registrada na base sintética.")}>Concluir etapa <Icon name="arrow" size={15}/></button>
          </article>)}</div>
          {pending.filter((p) => (admissionFilter === "ALL" || p.stage === admissionFilter) && p.name.toLowerCase().includes(query.toLowerCase())).length === 0 && <p className={styles.empty}>Não há protocolos nesta etapa.</p>}
        </section>
        <div className={styles.lowerGrid}><section className={styles.surface}><div className={styles.surfaceHead}><div><span className={styles.sectionOverline}>Acolhimento</span><h2>Visitantes aguardando admissão</h2></div></div>
          <div className={styles.pendingList}>{members.filter((m) => m.status === "VISITOR").map((m) => <button type="button" onClick={() => openDetails(m.id)} key={m.id} className={styles.pendingItem}><SmallAvatar name={m.name}/><span><strong>{m.name}</strong><small>{m.family}</small></span><Icon name="arrow" size={17}/></button>)}</div></section>
          <section className={styles.helpCard}><span className={styles.sectionOverline}>Responsabilidade institucional</span><h2>Aprovação com rastreabilidade</h2><p>A sequência da admissão está refletida nesta interface. A autorização efetiva por perfil, o histórico auditável e a persistência oficial serão validados pela API no ambiente HML.</p><span>Modo sintético — nenhuma decisão oficial é registrada aqui.</span></section></div>
      </>}

      {view === "cards" && <>
        <div className={styles.kpiGrid}>
          <Kpi icon="card" label="Carteirinhas ativas" value={stats.issued} sub="Identificações sintéticas" />
          <Kpi icon="heart" label="Membresias elegíveis" value={stats.active} sub="Aprovação concluída" />
          <Kpi icon="file" label="Aguardando emissão" value={eligible.filter((m) => m.card !== "ACTIVE").length} sub="Membros elegíveis" />
          <Kpi icon="users" label="Total de pessoas" value={stats.total} sub="Base de homologação" />
        </div>
        <section className={styles.surface}>
          <div className={styles.surfaceHead}><div><span className={styles.sectionOverline}>Identificação eclesiástica</span><h2>Carteirinhas de membros</h2><p>Emissão e revogação locais para validação da experiência</p></div>
            <div className={styles.segmented} role="group" aria-label="Filtrar carteirinhas">{[{k:"ALL",t:"Todas"},{k:"ISSUED",t:"Emitidas"},{k:"PENDING",t:"Pendentes"}].map((item) => <button type="button" key={item.k} onClick={() => setCardsFilter(item.k)} className={cardsFilter === item.k ? styles.segmentActive : ""}>{item.t}</button>)}</div>
          </div>
          <div className={styles.cardsGrid}>{cards.map((person) => <article key={person.id} className={styles.credentialTile}>
            <MemberCard person={person} />
            <div className={styles.credentialActions}><div><strong>{person.name}</strong><small>{person.card === "ACTIVE" ? "Emitida • identificação sintética" : person.card === "REVOKED" ? "Revogada" : "Aguardando emissão"}</small></div>
              <button type="button" className={person.card === "ACTIVE" ? styles.outlineButton : styles.primaryButton} onClick={() => run(setMemberCard(members, person.id, person.card === "ACTIVE" ? "REVOKE" : "ISSUE"), person.card === "ACTIVE" ? "Carteirinha sintética revogada." : "Carteirinha sintética emitida.")}>{person.card === "ACTIVE" ? "Revogar" : "Emitir"}</button>
            </div>
          </article>)}</div>
          {cards.length === 0 && <p className={styles.empty}>Nenhuma carteirinha nesta categoria.</p>}
        </section>
      </>}

      <footer className={styles.workspaceFoot}>Igreja de Deus no Riacho Fundo I <span>•</span> Ambiente de homologação visual <span>•</span> Dados sintéticos armazenados localmente, sem envio à API.</footer>
    </div>

    {selected && <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={"Cadastro de " + selected.name}>
        <div className={styles.drawerTop}><span>PRONTUÁRIO DA PESSOA</span><button type="button" className={styles.close} aria-label="Fechar cadastro" onClick={() => setSelectedId(null)}>×</button></div>
        <div className={styles.drawerProfile}><SmallAvatar name={selected.name} large/><div><h2>{selected.name}</h2><p>{selected.id} · {selected.email}</p><Badge status={selected.status}/></div></div>
        <div className={styles.detailGrid}><div><span>Família</span><strong>{selected.family}</strong></div><div><span>Ministério</span><strong>{selected.ministry}</strong></div><div><span>Data de cadastro</span><strong>{readableDate(selected.joinedAt)}</strong></div><div><span>Modalidade</span><strong>{MODALITY_LABEL[selected.modality]}</strong></div></div>
        <div className={styles.drawerSection}><h3>Informações da membresia</h3><div className={styles.detailLine}><span>Situação</span><Badge status={selected.status}/></div><div className={styles.detailLine}><span>Etapa atual</span><strong>{STAGE_LABEL[selected.stage]}</strong></div><div className={styles.detailLine}><span>Carteirinha</span><strong>{selected.card === "ACTIVE" ? "Emitida" : selected.card === "REVOKED" ? "Revogada" : "Não emitida"}</strong></div></div>
        <div className={styles.drawerSection}><h3>Observações</h3><textarea rows={3} maxLength={500} aria-label="Observações sintéticas da pessoa" placeholder="Anotações internas sintéticas..." value={notesDraft} onChange={(e) => setNotesDraft(e.target.value)}/><button type="button" className={styles.outlineButton} onClick={() => run(updateMemberNotes(members, selected.id, notesDraft), "Observação salva localmente.")}>Salvar observações</button></div>
        <div className={styles.drawerSection}><h3>Operações do cadastro</h3>
          {selected.status === "VISITOR" && <div className={styles.drawerAction}><select aria-label="Modalidade de admissão" value={modality} onChange={(e) => setModality(e.target.value as Modality)}>{Object.entries(MODALITY_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className={styles.primaryButton} onClick={() => run(openAdmission(members, selected.id, modality), "Admissão sintética iniciada.")}>Iniciar admissão</button></div>}
          {selected.status === "PENDING_ADMISSION" && <div className={styles.drawerAction}><select aria-label="Responsável pela aprovação" value={responsible} onChange={(e) => setResponsible(e.target.value as "SECRETARIA" | "PASTOR")}><option value="SECRETARIA">Secretaria</option><option value="PASTOR">Pastor</option></select><button type="button" className={styles.primaryButton} onClick={() => run(advanceAdmission(members, selected.id, responsible), "Etapa sintética concluída.")}>Concluir {STAGE_LABEL[selected.stage]}</button></div>}
          {selected.status === "ACTIVE" && <button type="button" className={selected.card === "ACTIVE" ? styles.outlineButton : styles.primaryButton} onClick={() => run(setMemberCard(members, selected.id, selected.card === "ACTIVE" ? "REVOKE" : "ISSUE"), "Situação da carteirinha atualizada.")}>{selected.card === "ACTIVE" ? "Revogar carteirinha" : "Emitir carteirinha"}</button>}
        </div>
        <p className={styles.drawerDisclaimer}>Dados fictícios. As alterações ficam somente neste navegador e não têm validade institucional.</p>
      </aside>
    </div>}

    {createOpen && <div className={styles.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget) setCreateOpen(false); }}>
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="new-member-title">
        <div className={styles.modalTop}><div><span className={styles.sectionOverline}>NOVO REGISTRO</span><h2 id="new-member-title">Cadastrar pessoa</h2><p>Informações sintéticas para homologação da interface.</p></div><button className={styles.close} type="button" aria-label="Fechar formulário" onClick={() => setCreateOpen(false)}>×</button></div>
        <form onSubmit={addPerson} className={styles.form}>
          <label>Nome completo<input required value={personForm.name} onChange={(e) => setPersonForm({ ...personForm, name: e.target.value })} placeholder="Nome da pessoa fictícia"/></label>
          <label>E-mail sintético<input required type="email" value={personForm.email} onChange={(e) => setPersonForm({ ...personForm, email: e.target.value })} placeholder="pessoa20@example.test"/></label>
          <label>Família<input value={personForm.family} onChange={(e) => setPersonForm({ ...personForm, family: e.target.value })} placeholder="Família fictícia"/></label>
          <label>Telefone<input value={personForm.phone} onChange={(e) => setPersonForm({ ...personForm, phone: e.target.value })} placeholder="Não informado"/></label>
          <div className={styles.formFoot}><button type="button" className={styles.outlineButton} onClick={() => setCreateOpen(false)}>Cancelar</button><button className={styles.primaryButton} type="submit"><Icon name="plus" size={16}/> Salvar cadastro</button></div>
        </form>
      </div>
    </div>}
  </AppShell>;
}
