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
function situation(status: string) {
  switch (status) {
    case "ACTIVE": return "Ativo";
    case "PENDING_ADMISSION": return "Em admissão";
    case "INACTIVE": return "Inativo";
    case "TRANSFERRED": return "Transferido";
    default: return status;
  }
}

export default function SecretariaPage() {
  const [token, setToken] = useState<string | null>(null);
  const [rows, setRows] = useState<MembershipRow[]>([]);
  const [churchName, setChurchName] = useState<string>(PILOT_CHURCH_NAME);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const refresh = useCallback(async (accessToken: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await apiGet<MembershipListResponse>("/memberships", accessToken);
      setRows(result.memberships);
      setChurchName(result.church.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Não foi possível acessar a Secretaria");
    } finally {
      setBusy(false);
    }
  }, []);

  async function handleAuth(accessToken: string) {
    setToken(accessToken);
    await refresh(accessToken);
  }
  const visible = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return rows.filter((row) => !term || (row.person.displayName + " " + (row.person.email ?? "")).toLocaleLowerCase("pt-BR").includes(term));
  }, [rows, search]);
  const active = rows.filter((row) => row.status === "ACTIVE").length;
  const cards = rows.filter((row) => Boolean(row.activeCredentialId)).length;
  const awaiting = rows.filter((row) => row.status === "PENDING_ADMISSION").length;

  return (
    <AppShell active="secretaria" meta="Secretaria · Riacho Fundo I">
      <div className={styles.root}>
        <header className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>Gestão e serviço · Secretaria</p>
            <h1>Secretaria e membresia</h1>
            <p>Organização, responsabilidade e cuidado em cada etapa da vida da congregação.</p>
          </div>
          <span className={styles.smallFlag}>{token ? "Consulta com acesso autorizado" : "Demonstração disponível"}</span>
        </header>

        <section className={styles.hero} aria-label="Secretaria e cuidado">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroImage} src={withBasePath("/images/adoracao-oficial.jpg")} alt="" width={932} height={1180} />
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}>Ordem para melhor servir</p>
            <h2>Uma Secretaria que acompanha pessoas, não apenas documentos.</h2>
            <p>Cadastro, conferência e decisões documentadas com o respeito que cada história merece.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href={withBasePath("/app/demo/")}>Explorar o fluxo completo</a>
              <a className={styles.lightButton} href={withBasePath("/app/membros/")}>Consultar pessoas</a>
            </div>
          </div>
        </section>

        {token && (
          <section className={styles.metrics} aria-label="Resumo de membresias da API">
            <article className={styles.metric}><div><span className={styles.metricName}>Membresias cadastradas</span><strong>{rows.length}</strong><small>Consulta da congregação</small></div><span className={styles.metricIcon}>01</span></article>
            <article className={styles.metric}><div><span className={styles.metricName}>Membros ativos</span><strong>{active}</strong><small>Situação regular</small></div><span className={styles.metricIcon}>02</span></article>
            <article className={styles.metric}><div><span className={styles.metricName}>Carteirinhas emitidas</span><strong>{cards}</strong><small>Ativas na API</small></div><span className={styles.metricIcon}>03</span></article>
          </section>
        )}

        <div className={styles.columns}>
          <section className={styles.panel} aria-label="Área da Secretaria">
            <div className={styles.panelTitle}>
              <div><h2>Atendimento e registros</h2><p>Unidade: {churchName}</p></div>
              {token && <button className={styles.secondary} type="button" disabled={busy} onClick={() => void refresh(token)}>{busy ? "Atualizando..." : "Atualizar"}</button>}
            </div>

            {!token ? (
              <div className={styles.connectGrid}>
                <div>
                  <h3 className={styles.connectHeading}>Acesso à Secretaria</h3>
                  <p className={styles.connectSub}>Os registros oficiais só ficam disponíveis com uma API ativa e perfil autorizado. Enquanto a infraestrutura é concluída, use a demonstração para conhecer os processos com dados fictícios.</p>
                  <a className={styles.primary} href={withBasePath("/app/demo/")}>Abrir simulação da Secretaria</a>
                  <div className={styles.softPanel} style={{ marginTop: "1.1rem" }}>
                    <strong>Protocolo de admissão</strong>
                    <p>As novas admissões deverão passar por documentação, conferência da Secretaria e aprovação pastoral. O backend implementará as validações.</p>
                  </div>
                </div>
                <div className={styles.connectPanel}>
                  <p className={styles.eyebrow}>Acesso técnico</p>
                  <DemoLogin hintEmail="ana.demo@example.test" onAuthenticated={handleAuth} />
                  <button className={styles.secondary} type="button" onClick={() => { const stored = loadStoredToken(); if (stored) void handleAuth(stored); else setError("Não há sessão salva neste navegador."); }}>Usar sessão existente</button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.toolbar}>
                  <input className={styles.searchField} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar pessoas..." aria-label="Buscar membros da Secretaria" />
                  <span className={styles.smallFlag}>{awaiting} em admissão</span>
                </div>
                <div className={styles.tableHead} aria-hidden="true"><span>Membro</span><span>Situação</span><span>Carteirinha</span><span>Ações</span></div>
                {visible.length === 0 ? <div className={styles.empty}><strong>Nenhum registro encontrado</strong>{busy ? "Consultando a API..." : "Altere a pesquisa ou atualize a listagem."}</div> : visible.map((row) => (
                  <div className={styles.listRow} key={row.id}>
                    <div className={styles.memberCell}>
                      <span className={styles.avatar} aria-hidden="true">{row.person.displayName.trim().charAt(0).toUpperCase()}</span>
                      <div><span className={styles.memberName}>{row.person.displayName}</span><span className={styles.memberMeta}>{row.person.email ?? "E-mail não informado"}</span></div>
                    </div>
                    <div><span className={row.status === "ACTIVE" ? styles.chipActive : styles.chipWaiting}>{situation(row.status)}</span></div>
                    <div><span className={row.activeCredentialId ? styles.chipActive : styles.chipNeutral}>{row.activeCredentialId ? "Ativa" : "Pendente"}</span></div>
                    <div><span className={styles.chipNeutral}>Consulta</span></div>
                  </div>
                ))}
                <div className={styles.notice} role="note">
                  Emissão e cadastro direto estão temporariamente indisponíveis nesta interface até que o backend conclua o protocolo de admissão e o bloqueio de carteirinha por aprovação pastoral. A demonstração permite simular todas as etapas.
                </div>
              </>
            )}
            {error && <p className={styles.notice} role="alert">{error}</p>}
          </section>

          <aside className={styles.panel} aria-label="Etapas de admissão">
            <p className={styles.eyebrow}>Fluxo da membresia</p>
            <h2 className={styles.connectHeading}>Cada admissão segue um caminho seguro</h2>
            <p className={styles.panelText}>O registro final depende de conferências e aprovações. Isso protege as pessoas e a responsabilidade institucional da igreja.</p>
            <ol className={styles.steps}>
              {["Modalidade de admissão", "Documentos necessários", "Análise da Secretaria", "Aprovação pastoral", "Carteirinha liberada"].map((label, index) => (
                <li key={label}><span className={styles.stepNum}>{index + 1}</span>{label}</li>
              ))}
            </ol>
            <div className={styles.softPanel} style={{ marginTop: "1.25rem" }}>
              <strong>Preparando novos protocolos</strong>
              <p>O formulário real ficará disponível após o Cursor entregar os endpoints de admissão com validação no servidor.</p>
              <a className={styles.secondary} href={withBasePath("/app/demo/")}>Testar com dados fictícios</a>
            </div>
          </aside>
        </div>
        <p className={styles.note}>As funções de escrita só devem ser habilitadas após a implantação das regras de admissão e autorização. Nenhum registro é alterado nesta tela.</p>
      </div>
    </AppShell>
  );
}
