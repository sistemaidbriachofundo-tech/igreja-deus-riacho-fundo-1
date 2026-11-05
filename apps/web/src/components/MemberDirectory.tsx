"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { AppShell } from "./AppShell";
import {
  SYNTHETIC_STORE_KEY, STATUS_LABEL, MODALITY_LABEL, initialMembers,
  isMembersDataset, summarize, filterMembers, createMember, openAdmission,
  updateMemberNotes, type Member, type MemberStatus, type Modality, type MemberInput,
} from "../lib/church-synthetic";
import { withBasePath } from "../lib/paths";
import styles from "./member-directory.module.css";

const FILTERS: Array<{ key: "ALL" | MemberStatus; label: string }> = [
  { key: "ALL", label: "Todos" },
  { key: "ACTIVE", label: "Membros ativos" },
  { key: "PENDING_ADMISSION", label: "Em admissão" },
  { key: "VISITOR", label: "Visitantes" },
  { key: "INACTIVE", label: "Inativos" },
];
const EMPTY_FORM: MemberInput = { name: "", email: "", family: "", phone: "" };

function Symbol({ name, size = 19 }: { name: "search" | "plus" | "arrow" | "users" | "family" | "clock" | "card" | "close" | "filter" | "check" | "reset" | "clipboard"; size?: number }) {
  const p = {
    search: <><circle cx="10.9" cy="10.9" r="6.5"/><path d="m16 16 4.5 4.5"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    users: <><circle cx="9" cy="8" r="3"/><path d="M2.5 20v-1a6.5 6.5 0 0 1 13 0v1"/><path d="M16.4 5.2a3 3 0 0 1 0 5.6M17 14a5.5 5.5 0 0 1 4 5.4"/></>,
    family: <><path d="M3 21V9l9-7 9 7v12H3Z"/><path d="M9 21v-8h6v8"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
    card: <><rect x="2" y="5" width="20" height="14" rx="3"/><path d="M2 10h20M6 15h5"/></>,
    close: <path d="M6 6l12 12M18 6 6 18"/>,
    filter: <><path d="M3 6h18M6 12h12M9 18h6"/></>,
    check: <path d="m5 12 5 5L20 7"/>,
    reset: <><path d="M3 11a9 9 0 0 1 16-5l2 2M21 3v5h-5"/><path d="M21 13a9 9 0 0 1-16 5l-2-2M3 21v-5h5"/></>,
    clipboard: <><rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4.5h6V2H9v2.5ZM9 11h6M9 15h6"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{p[name]}</svg>;
}

function Portrait({ person, large = false }: { person: Member; large?: boolean }) {
  const photoIndex = Math.max(0, Number(person.id.split("-").pop()) - 1) % 6;
  return <span
    className={large ? styles.portraitLarge : styles.portrait}
    style={{ backgroundImage: `url("${withBasePath("/images/pessoas-sinteticas.webp")}")`, backgroundPosition: `${(photoIndex / 5) * 100}% center` }}
    role="img"
    aria-label={"Retrato sintético ilustrativo de " + person.name}
  />;
}
function Status({ value }: { value: MemberStatus }) {
  return <span className={styles.status + " " + styles["status" + value]}><i aria-hidden="true"/>{STATUS_LABEL[value]}</span>;
}
function dateLabel(iso: string) {
  return new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function MemberDirectory() {
  const [people, setPeople] = useState<Member[]>(initialMembers);
  const [hydrated, setHydrated] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"ALL" | MemberStatus>("ALL");
  const [chosen, setChosen] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<MemberInput>(EMPTY_FORM);
  const [notice, setNotice] = useState("");
  const [notes, setNotes] = useState("");
  const [modality, setModality] = useState<Modality>("BATISMO");
  const [page, setPage] = useState(1);
  const pageSize = 8;
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(SYNTHETIC_STORE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isMembersDataset(parsed)) setPeople(parsed);
      }
    } catch { /* base local inválida: inicializa com registros sintéticos */ }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    try { window.localStorage.setItem(SYNTHETIC_STORE_KEY, JSON.stringify(people)); } catch { /* navegador sem armazenamento local */ }
  }, [people, hydrated]);
  useEffect(() => {
    if (!chosen && !creating) return;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") { setChosen(null); setCreating(false); }
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [chosen, creating]);
  const stats = useMemo(() => summarize(people), [people]);
  const filtered = useMemo(() => filterMembers(people, query, filter), [people, query, filter]);
  const numberPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const rows = filtered.slice((Math.min(page, numberPages) - 1) * pageSize, Math.min(page, numberPages) * pageSize);
  const selected = people.find(p => p.id === chosen);
  const pending = people.filter(p => p.status === "PENDING_ADMISSION");

  function select(id: string) {
    setChosen(id);
    setNotes(people.find(p => p.id === id)?.notes ?? "");
    setNotice("");
  }
  function savePerson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const next = "RF1-" + String(Math.max(...people.map(p => Number(p.id.split("-").pop()) || 0), 0) + 1).padStart(4, "0");
    const result = createMember(people, form, next);
    if (!result.ok) { setNotice(result.message); return; }
    setPeople(result.members);
    setForm(EMPTY_FORM);
    setCreating(false);
    setQuery("");
    setFilter("ALL");
    setPage(1);
    setChosen(next);
    setNotice("Pessoa fictícia cadastrada nesta base de homologação.");
  }
  function saveNotes() {
    if (!selected) return;
    const result = updateMemberNotes(people, selected.id, notes);
    if (!result.ok) { setNotice(result.message); return; }
    setPeople(result.members);
    setNotice("Observações sintéticas atualizadas.");
  }
  function startAdmission() {
    if (!selected) return;
    const result = openAdmission(people, selected.id, modality);
    if (!result.ok) { setNotice(result.message); return; }
    setPeople(result.members);
    setNotice("Protocolo sintético iniciado. A aprovação oficial requer API autenticada.");
  }
  function resetData() {
    setPeople(initialMembers());
    setChosen(null); setPage(1); setFilter("ALL"); setQuery("");
    setNotice("Base sintética restaurada sem alterar dados da igreja.");
  }
  return <AppShell active="membros" meta="Secretaria · Riacho Fundo I">
    <div className={styles.root}>
      <header className={styles.heading}>
        <div>
          <div className={styles.breadcrumb}>Plataforma <span>/</span> Gestão de pessoas <span>/</span> <strong>Membros e famílias</strong></div>
          <span className={styles.eyebrow}>GESTÃO ECLESIÁSTICA</span>
          <h1>Membros e famílias<span className={styles.period}>.</span></h1>
          <p>Uma visão organizada das pessoas, vínculos e jornadas de pertencimento.</p>
        </div>
        <div className={styles.headingActions}>
          <span className={styles.dataPill}><i/> Ambiente de avaliação · dados sintéticos</span>
          <button type="button" className={styles.mainButton} onClick={() => { setCreating(true); setNotice(""); }}><Symbol name="plus" size={18}/> Nova pessoa</button>
        </div>
      </header>

      <section className={styles.banner} aria-label="Mensagem institucional">
        <div className={styles.bannerContent}>
          <span className={styles.bannerOverline}>IGREJA DE DEUS · RIACHO FUNDO I</span>
          <h2>Mais que registros.<br/><em>Pessoas e histórias.</em></h2>
          <p>Organizar para acolher, acompanhar e cuidar melhor.</p>
        </div>
        <span className={styles.bannerCorner}>FÉ · COMUNHÃO · FAMÍLIA</span>
      </section>

      <section className={styles.metrics} aria-label="Indicadores sintéticos">
        <div><span className={styles.metricIcon}><Symbol name="users" size={21}/></span><span><small>Total de pessoas</small><strong>{stats.total.toLocaleString("pt-BR")}</strong><em>Base sintética atual</em></span></div>
        <div><span className={styles.metricIcon}><Symbol name="check" size={21}/></span><span><small>Membros ativos</small><strong>{stats.active.toLocaleString("pt-BR")}</strong><em>Vínculo confirmado</em></span></div>
        <div><span className={styles.metricIcon}><Symbol name="family" size={21}/></span><span><small>Núcleos familiares</small><strong>{stats.families.toLocaleString("pt-BR")}</strong><em>Famílias cadastradas</em></span></div>
        <div><span className={styles.metricIcon}><Symbol name="clock" size={21}/></span><span><small>Em admissão</small><strong>{stats.pending.toLocaleString("pt-BR")}</strong><em>Aguardando análise</em></span></div>
      </section>

      {notice && <div role="status" className={styles.notice}><Symbol name="check" size={17}/><span>{notice}</span><button type="button" aria-label="Dispensar aviso" onClick={() => setNotice("")}><Symbol name="close" size={16}/></button></div>}

      <div className={styles.bodyGrid}>
        <section className={styles.directory} aria-label="Diretório de pessoas">
          <div className={styles.sectionTitle}>
            <div><span className={styles.smallCaption}>DIRETÓRIO</span><h2>Pessoas cadastradas <span>{filtered.length}</span></h2></div>
            <button type="button" className={styles.resetButton} onClick={resetData}><Symbol name="reset" size={15}/> Restaurar dados</button>
          </div>
          <div className={styles.searchLine}>
            <label className={styles.searchBox}><Symbol name="search" size={18}/><input aria-label="Pesquisar pessoas" placeholder="Buscar por nome, família ou ministério..." value={query} onChange={e => {setQuery(e.target.value);setPage(1);}}/></label>
            <span className={styles.searchTip}><Symbol name="filter" size={16}/> Refine sua consulta</span>
          </div>
          <div className={styles.filters} role="group" aria-label="Filtrar por situação">
            {FILTERS.map(f => <button key={f.key} type="button" className={filter === f.key ? styles.filterActive : styles.filterButton} onClick={() => {setFilter(f.key);setPage(1);}}>{f.label}</button>)}
          </div>
          <div className={styles.list}>
            <div className={styles.listHead}><span>PESSOA</span><span>FAMÍLIA / MINISTÉRIO</span><span>SITUAÇÃO</span><span aria-hidden="true"/></div>
            {rows.map(person => <button type="button" key={person.id} className={styles.personRow} onClick={() => select(person.id)}>
              <span className={styles.primaryCell}><Portrait person={person}/><span><strong>{person.name}</strong><small>{person.id} · {person.email}</small></span></span>
              <span className={styles.familyCell}><strong>{person.family}</strong><small>{person.ministry}</small></span>
              <span className={styles.badgeCell}><Status value={person.status}/></span>
              <span className={styles.rowChevron}><Symbol name="arrow" size={16}/></span>
            </button>)}
            {rows.length === 0 && <div className={styles.empty}><Symbol name="search" size={26}/><strong>Nenhuma pessoa encontrada</strong><span>Tente outro nome ou altere os filtros.</span><button type="button" onClick={() => {setQuery("");setFilter("ALL");setPage(1);}}>Limpar filtros</button></div>}
          </div>
          <footer className={styles.listFooter}><span>Exibindo {rows.length} de {filtered.length} registros sintéticos</span><div className={styles.pagination}><button type="button" disabled={page <= 1} onClick={() => setPage(p => Math.max(1,p-1))}>Anterior</button><span>{Math.min(page,numberPages)} / {numberPages}</span><button type="button" disabled={page >= numberPages} onClick={() => setPage(p => Math.min(numberPages,p+1))}>Próxima</button></div></footer>
        </section>

        <aside className={styles.sideColumn} aria-label="Acompanhamento">
          <section className={styles.sideCard}>
            <div className={styles.sideHead}><span className={styles.smallCaption}>CUIDADO E ACOMPANHAMENTO</span><h2>Em andamento</h2><p>Os próximos passos das pessoas em admissão.</p></div>
            <div className={styles.pending}>{pending.slice(0,4).map(p => <button type="button" key={p.id} onClick={() => select(p.id)}><Portrait person={p}/><span><strong>{p.name}</strong><small>{p.stage === "PASTOR" ? "Análise pastoral" : p.stage === "SECRETARIA" ? "Conferência da Secretaria" : "Verificação de documentos"}</small></span><Symbol name="arrow" size={16}/></button>)}</div>
            {pending.length === 0 && <p className={styles.muted}>Nenhuma admissão pendente.</p>}
            <a href={withBasePath("/app/secretaria/")} className={styles.sideLink}>Abrir Secretaria <Symbol name="arrow" size={17}/></a>
          </section>
          <section className={styles.familyFeature}>
            <span className={styles.smallCaption}>ORGANIZAÇÃO EM FAMÍLIA</span>
            <span className={styles.familyFeatureIcon}><Symbol name="family" size={25}/></span>
            <h2>O cuidado começa com a conexão.</h2>
            <p>Encontre rapidamente os vínculos e acompanhe cada núcleo familiar.</p>
            <span className={styles.familyCount}><strong>{stats.families}</strong> famílias na base de avaliação</span>
          </section>
          <p className={styles.syntheticNote}>Imagens e informações dos perfis são fictícias. Nenhuma alteração nesta tela representa uma decisão oficial da igreja.</p>
        </aside>
      </div>
    </div>

    {selected && <div className={styles.overlay} onMouseDown={event => {if(event.target===event.currentTarget)setChosen(null);}}>
      <aside className={styles.drawer} role="dialog" aria-modal="true" aria-label={"Prontuário de "+selected.name}>
        <div className={styles.drawerTop}><span>CADASTRO INDIVIDUAL · {selected.id}</span><button type="button" aria-label="Fechar prontuário" onClick={() => setChosen(null)}><Symbol name="close" size={20}/></button></div>
        <div className={styles.drawerIdentity}><Portrait person={selected} large/><h2>{selected.name}</h2><p>{selected.email}</p><Status value={selected.status}/></div>
        <div className={styles.drawerSection}><h3>Dados da pessoa</h3><dl><div><dt>Família</dt><dd>{selected.family}</dd></div><div><dt>Ministério</dt><dd>{selected.ministry}</dd></div><div><dt>Cadastro</dt><dd>{dateLabel(selected.joinedAt)}</dd></div><div><dt>Carteirinha</dt><dd>{selected.card === "ACTIVE" ? "Ativa" : selected.card === "REVOKED" ? "Revogada" : "Não emitida"}</dd></div></dl></div>
        <div className={styles.drawerSection}><h3>Observações internas</h3><label htmlFor="notes">Anotações fictícias</label><textarea id="notes" value={notes} maxLength={500} rows={4} onChange={e => setNotes(e.target.value)} placeholder="Registrar observações para avaliação da interface"/><button type="button" className={styles.secondaryButton} onClick={saveNotes}>Salvar observações</button></div>
        {selected.status === "VISITOR" && <div className={styles.drawerSection}><h3>Iniciar admissão</h3><label htmlFor="modalidade">Modalidade</label><select id="modalidade" value={modality} onChange={e => setModality(e.target.value as Modality)}>{Object.entries(MODALITY_LABEL).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select><button type="button" className={styles.mainButton} onClick={startAdmission}><Symbol name="clipboard" size={18}/> Criar protocolo sintético</button></div>}
        <p className={styles.drawerFoot}>Homologação visual · Base local sintética · Sem valor institucional</p>
      </aside>
    </div>}

    {creating && <div className={styles.overlay} onMouseDown={event => {if(event.target===event.currentTarget)setCreating(false);}}>
      <div role="dialog" aria-modal="true" aria-labelledby="person-form-title" className={styles.modal}>
        <div className={styles.modalTop}><div><span className={styles.smallCaption}>NOVO CADASTRO SINTÉTICO</span><h2 id="person-form-title">Cadastrar pessoa</h2><p>Complete os dados fictícios para testar o diretório.</p></div><button type="button" aria-label="Fechar formulário" onClick={() => setCreating(false)}><Symbol name="close" size={20}/></button></div>
        <form onSubmit={savePerson} className={styles.form}>
          <label>Nome completo<input required minLength={3} value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Ex.: Maria Exemplo"/></label>
          <label>E-mail de teste<input required type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} placeholder="pessoa20@example.test"/></label>
          <label>Família<input value={form.family} onChange={e => setForm({...form,family:e.target.value})} placeholder="Família Exemplo"/></label>
          <label>Telefone fictício<input value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} placeholder="Não informado"/></label>
          <p>Apenas e-mails terminados em <strong>@example.test</strong> são aceitos.</p>
          <div className={styles.formActions}><button type="button" className={styles.secondaryButton} onClick={() => setCreating(false)}>Cancelar</button><button type="submit" className={styles.mainButton}><Symbol name="plus" size={17}/> Salvar cadastro</button></div>
        </form>
      </div>
    </div>}
  </AppShell>;
}
