"use client";

import { PILOT_CHURCH_NAME } from "@idbrf/shared";
import { useCallback, useMemo, useState } from "react";
import { AppShell } from "../../../components/AppShell";
import { DemoLogin } from "../../../components/DemoLogin";
import { apiGet, loadStoredToken } from "../../../lib/api";
import { withBasePath } from "../../../lib/paths";
import styles from "../workspace.module.css";

interface MembershipRow {
  id: string;
  status: string;
  joinedAt: string;
  notes: string | null;
  person: { id: string; displayName: string; email: string | null; status: string; householdId: string | null };
  activeCredentialId: string | null;
}
interface MembershipListResponse {
  church: { id: string; slug: string; name: string };
  memberships: MembershipRow[];
}
function statusClass(status: string) {
  return status === "ACTIVE" ? styles.chipActive : status === "PENDING_ADMISSION" ? styles.chipWaiting : styles.chipNeutral;
}
function statusName(status: string) {
  return status === "ACTIVE" ? "Ativo" : status === "PENDING_ADMISSION" ? "Em admissão" : status === "INACTIVE" ? "Inativo" : status === "TRANSFERRED" ? "Transferido" : status;
}

export default function MembrosPage() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [churchName, setChurchName] = useState<string>(PILOT_CHURCH_NAME);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const refresh = useCallback(async (accessToken: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiGet<MembershipListResponse>("/memberships", accessToken);
      setRows(result.memberships);
      setChurchName(result.church.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível consultar a API");
    } finally {
      setBusy(false);
    }
  }, []);
  async function handleAuth(accessToken: string) {
    setToken(accessToken);
    await refresh(accessToken);
  }
  const filtered = useMemo(() => rows.filter((row) => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    const matches = !term || (row.person.displayName + " " + (row.person.email ?? "")).toLocaleLowerCase("pt-BR").includes(term);
    return matches && (statusFilter === "ALL" || row.status === statusFilter);
  }), [rows, search, statusFilter]);

  const active = rows.filter((row) => row.status === "ACTIVE").length;
  const cards = rows.filter((row) => Boolean(row.activeCredentialId)).length;
  const pending = rows.filter((row) => row.status === "PENDING_ADMISSION").length;

  return (
    <AppShell active="membros" meta="Membros e famílias · Riacho Fundo I">
      <div className={styles.root}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Pessoas · Família · Comunhão</p>
            <h1>Membros e famílias</h1>
            <p>Uma visão organizada para conhecer, acolher e acompanhar as pessoas de {churchName}.</p>
          </div>
          <span className={styles.smallFlag}>{token ? "Consulta pela API" : "Ambiente de apresentação"}</span>
        </header>

        <section className={styles.hero} aria-label="Cuidado com as pessoas">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroImage} src={withBasePath("/images/comunidade-oficial.jpg")} alt="" width={932} height={1180} />
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}>Pessoas em primeiro lugar</p>
            <h2>Famílias acolhidas. Histórias acompanhadas.</h2>
            <p>O cadastro único aproxima a equipe das necessidades de cada pessoa, respeitando a privacidade e os vínculos da comunidade.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href={withBasePath("/app/demo/")}>Conhecer a demonstração</a>
              <a className={styles.lightButton} href={withBasePath("/app/secretaria/")}>Acessar Secretaria</a>
            </div>
          </div>
        </section>

        {token && (
          <section className={styles.metrics} aria-label="Indicadores de membros conectados à API">
            <article className={styles.metric}><div><span className={styles.metricName}>Membresias</span><strong>{rows.length}</strong><small>Registros retornados</small></div><span className={styles.metricIcon}>01</span></article>
            <article className={styles.metric}><div><span className={styles.metricName}>Ativos</span><strong>{active}</strong><small>Vínculos ativos</small></div><span className={styles.metricIcon}>02</span></article>
            <article className={styles.metric}><div><span className={styles.metricName}>Carteirinhas ativas</span><strong>{cards}</strong><small>Identificações emitidas</small></div><span className={styles.metricIcon}>03</span></article>
          </section>
        )}

        <div className={styles.columns}>
          <section className={styles.panel} aria-label="Consulta de membresia">
            <div className={styles.panelTitle}>
              <div><h2>Central de pessoas</h2><p>{token ? "Dados consultados na API da congregação." : "Conexão necessária para consultar registros."}</p></div>
              {token && <button className={styles.secondary} type="button" disabled={busy} onClick={() => void refresh(token)}>{busy ? "Atualizando..." : "Atualizar"}</button>}
            </div>

            {!token ? (
              <div className={styles.connectGrid}>
                <div>
                  <h3 className={styles.connectHeading}>Acesse com uma conta autorizada</h3>
                  <p className={styles.connectSub}>Esta área consulta informações da congregação. Ela necessita de autenticação e de uma API configurada; no GitHub Pages, utilize o ambiente demonstrativo com pessoas fictícias.</p>
                  <a className={styles.primary} href={withBasePath("/app/demo/")}>Explorar versão demonstrativa</a>
                  <div className={styles.softPanel} style={{ marginTop: "1rem" }}>
                    <strong>Privacidade e cuidado</strong>
                    <p>Somente a equipe autorizada deve visualizar os registros. A seleção de papéis da demonstração não concede acesso a dados reais.</p>
                  </div>
                </div>
                <div className={styles.connectPanel}>
                  <p className={styles.eyebrow}>Acesso técnico</p>
                  <DemoLogin hintEmail="ana.demo@example.test" onAuthenticated={handleAuth} />
                  <button className={styles.secondary} type="button" onClick={() => { const stored = loadStoredToken(); if (stored) void handleAuth(stored); else setError("Nenhuma sessão salva neste navegador."); }}>Usar sessão existente</button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.toolbar}>
                  <input className={styles.searchField} type="search" aria-label="Pesquisar por nome ou e-mail" placeholder="Buscar nome ou e-mail..." value={search} onChange={(event) => setSearch(event.target.value)} />
                  <select className={styles.selectField} aria-label="Filtrar por situação" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                    <option value="ALL">Todas as situações</option>
                    <option value="ACTIVE">Ativos</option>
                    <option value="PENDING_ADMISSION">Em admissão</option>
                    <option value="INACTIVE">Inativos</option>
                    <option value="TRANSFERRED">Transferidos</option>
                  </select>
                </div>
                <div className={styles.tableHead} aria-hidden="true"><span>Pessoa</span><span>Situação</span><span>Carteirinha</span><span>Acompanhamento</span></div>
                {filtered.length === 0 ? <div className={styles.empty}><strong>Nenhuma pessoa encontrada</strong>{busy ? "Buscando registros..." : "Tente outro filtro ou consulte a Secretaria."}</div> : filtered.map((row) => (
                  <div className={styles.listRow} key={row.id}>
                    <div className={styles.memberCell}>
                      <span className={styles.avatar} aria-hidden="true">{row.person.displayName.trim().charAt(0).toUpperCase()}</span>
                      <div><span className={styles.memberName}>{row.person.displayName}</span><span className={styles.memberMeta}>{row.person.email ?? "Sem e-mail informado"}</span></div>
                    </div>
                    <div><span className={statusClass(row.status)}>{statusName(row.status)}</span></div>
                    <div><span className={row.activeCredentialId ? styles.chipActive : styles.chipNeutral}>{row.activeCredentialId ? "Ativa" : "Não emitida"}</span></div>
                    <div><a className={styles.secondary} href={withBasePath("/app/secretaria/")}>Secretaria</a></div>
                  </div>
                ))}
                <p className={styles.caption}>Vínculos familiares detalhados e prontuário individual dependem dos endpoints de pessoas e famílias previstos na API.</p>
              </>
            )}
            {error && <p className={styles.notice} role="alert">{error}</p>}
          </section>

          <aside className={styles.panel} aria-label="Jornada de acolhimento">
            <p className={styles.eyebrow}>Cuidado e acompanhamento</p>
            <h2 className={styles.connectHeading}>A jornada de cada pessoa importa</h2>
            <p className={styles.panelText}>A plataforma foi planejada para acompanhar cada história, do primeiro contato à participação na vida da igreja.</p>
            <ol className={styles.steps}>
              {["Primeiro contato e acolhimento", "Cadastro e vínculo familiar", "Conferência documental", "Aprovação de membresia", "Serviço e acompanhamento"].map((label, index) => (
                <li key={label}><span className={styles.stepNum}>{index + 1}</span>{label}</li>
              ))}
            </ol>
            <div className={styles.softPanel} style={{ marginTop: "1.2rem" }}>
              <strong>Construído por etapas</strong>
              <p>A admissão com aprovação pastoral está prevista no próximo ciclo do backend. Até lá, a jornada completa pode ser explorada somente na demonstração.</p>
            </div>
          </aside>
        </div>
        <p className={styles.note}>Nenhum dado fictício da demonstração é enviado à API. O acesso operacional só funciona em ambiente com backend e autenticação habilitados. Pendências de admissão consultadas: {token ? pending : "—"}.</p>
      </div>
    </AppShell>
  );
}
