"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../../../components/AppShell";
import { withBasePath } from "../../../lib/paths";
import styles from "./demo.module.css";
import {
  KEY, STEP_ORDER, STEP_LABEL, ROLE_LABEL, STATUS_LABEL, MODALITY_LABEL,
  seed, nextStep, isEligible, isPersonList, selectVisible,
  createVisitor, beginAdmission, advanceAdmission, setCredential,
  type Role, type Tab, type MembershipStatus, type Modality, type Step,
  type Person, type DemoError,
} from "../../../lib/demo-domain";


/**
 * Demonstração F2 estática para GitHub Pages.
 * NÃO autentica, não usa API, não armazena dados reais.
 * Estados seguem a proposta de contrato 0.2.0-f2 do backend.
 * A implantação real deve substituir este repositório local por chamadas autenticadas.
 */
function badge(status: MembershipStatus) {
  return status === "ACTIVE" ? styles.ok : status === "VISITOR" ? styles.neutral : styles.wait;
}
const ERROR_MESSAGES: Record<DemoError, string> = {
  ROLE_REQUIRED: "Operação bloqueada para este perfil ilustrativo.",
  INVALID_PERSON: "Confira o cadastro da pessoa.",
  DUPLICATE_EMAIL: "E-mail já cadastrado na demonstração. Verifique antes de incluir uma nova pessoa.",
  INVALID_STATE: "O registro não está na situação adequada para esta operação.",
  STEP_LOCKED: "Etapa fora de ordem: conclua as anteriores.",
  NOT_ELIGIBLE: "Emissão bloqueada: é necessário concluir a aprovação e manter membresia ativa.",
  CARD_NOT_ACTIVE: "Não há carteirinha ativa para revogar.",
  CARD_ALREADY_ACTIVE: "A carteirinha já está ativa.",
};

export default function DemoF2Page() {
  const [people, setPeople] = useState<Person[]>(seed);
  const [role, setRole] = useState<Role>("SECRETARIA");
  const [tab, setTab] = useState<Tab>("painel");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [household, setHousehold] = useState("");
  const [modality, setModality] = useState<Modality>("BATISMO");
  const [notice, setNotice] = useState("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (isPersonList(parsed)) setPeople(parsed);
      }
    } catch {
      window.localStorage.removeItem(KEY);
    }
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) window.localStorage.setItem(KEY, JSON.stringify(people));
  }, [people, hydrated]);

  const isStaff = role !== "MEMBRO";
  const visible = useMemo(() => selectVisible(people, role, search), [people, role, search]);
  const activeCount = people.filter((p) => p.status === "ACTIVE").length;
  const pendingCount = people.filter((p) => p.status === "PENDING_ADMISSION").length;
  const visitorCount = people.filter((p) => p.status === "VISITOR").length;
  const cardCount = people.filter((p) => p.credential === "ACTIVE").length;

  function update(id: string, fn: (person: Person) => Person, message: string) {
    setPeople((prev) => prev.map((p) => p.id === id ? fn(p) : p));
    setNotice(message);
  }
  function addVisitor(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = createVisitor(people, role, { name, email, household }, "p-" + Date.now());
    if (!result.ok) { setNotice(ERROR_MESSAGES[result.code]); return; }
    setPeople(result.value);
    setName(""); setEmail(""); setHousehold("");
    setNotice("Visitante cadastrado na demonstração. Nenhuma informação foi enviada a um servidor.");
    setTab("pessoas");
  }
  function startAdmission(id: string) {
    const result = beginAdmission(people.find((p) => p.id === id), role, modality);
    if (!result.ok) { setNotice(ERROR_MESSAGES[result.code]); return; }
    update(id, () => result.value, "Protocolo demonstrativo criado. A documentação é a próxima etapa.");
  }
  function completeStep(id: string, step: Step) {
    const result = advanceAdmission(people.find((p) => p.id === id), role, step);
    if (!result.ok) { setNotice(ERROR_MESSAGES[result.code]); return; }
    update(id, () => result.value, step === "pastor"
      ? "Membresia aprovada na simulação. Carteirinha agora elegível."
      : STEP_LABEL[step] + " concluída na simulação.");
  }
  function changeCard(id: string, value: "ACTIVE" | "REVOKED") {
    const result = setCredential(people.find((p) => p.id === id), role, value);
    if (!result.ok) { setNotice(ERROR_MESSAGES[result.code]); return; }
    update(id, () => result.value, value === "ACTIVE"
      ? "Carteirinha demonstrativa emitida."
      : "Carteirinha demonstrativa revogada.");
  }
  function reset() {
    setPeople(seed()); setNotice("Dados fictícios restaurados."); setTab("painel"); setSearch("");
  }
  const tabs: { id: Tab; label: string }[] = [
    { id: "painel", label: "Visão geral" },
    { id: "pessoas", label: "Pessoas e famílias" },
    { id: "admissoes", label: "Admissões" },
    { id: "carteirinhas", label: "Carteirinhas" },
  ];
  const member = people.find((p) => p.id === "p-002");
  return (
    <AppShell active="demo" meta="Ambiente demonstrativo · F2">
      <div className={styles.root}>
        <header className={styles.head}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroPhoto} src={withBasePath("/images/hero-oficial.jpg")} alt="" width={928} height={1192} />
          <div>
            <p className={styles.eyebrow}>Igreja de Deus no Riacho Fundo 1 · Demonstração</p>
            <h1>Central de Membresia</h1>
            <p>Cuidar de pessoas começa por conhecê-las. Explore a jornada de admissão e os serviços da Secretaria em uma experiência interativa.</p>
          </div>
          <span className={styles.flag}>Dados 100% fictícios</span>
        </header>
        <div className={styles.disclaimer} role="note">
          <strong>Ambiente de demonstração:</strong> a seleção de perfis não é login; as permissões são ilustrativas.
          As alterações são guardadas apenas neste navegador. Não inclua informações reais de pessoas.
        </div>
        <div className={styles.toolbar}>
          <label className={styles.roleLabel}>
            Simular perfil
            <select value={role} onChange={(e) => { setRole(e.target.value as Role); setTab("painel"); setNotice(""); }} aria-label="Perfil demonstrativo">
              {(["SECRETARIA", "PASTOR", "MEMBRO"] as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
          </label>
          <button className={styles.ghost} type="button" onClick={reset}>Restaurar dados da demo</button>
        </div>
        <nav className={styles.tabs} aria-label="Módulos de demonstração">
          {tabs.filter((t) => isStaff || t.id === "painel" || t.id === "carteirinhas").map((t) => (
            <button key={t.id} type="button" className={tab === t.id ? styles.selected : ""} aria-current={tab === t.id ? "page" : undefined} onClick={() => { setTab(t.id); setNotice(""); }}>{t.label}</button>
          ))}
        </nav>
        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {tab === "painel" && (
          <div className={styles.section}>
            {isStaff ? (
              <>
                <div className={styles.kpis}>
                  <div><span>Membros ativos</span><strong>{activeCount}</strong><small>Aprovados</small></div>
                  <div><span>Admissões</span><strong>{pendingCount}</strong><small>Em andamento</small></div>
                  <div><span>Visitantes</span><strong>{visitorCount}</strong><small>Para acolhimento</small></div>
                  <div><span>Carteirinhas</span><strong>{cardCount}</strong><small>Ativas</small></div>
                </div>
                <div className={styles.twoCols}>
                  <section className={styles.panel}>
                    <p className={styles.eyebrow}>Fluxo F2</p>
                    <h2>Da visita à membresia</h2>
                    <p>O cadastro começa como visitante, segue pela conferência e depende de aprovação pastoral antes da emissão da carteirinha.</p>
                    <ol className={styles.process}>
                      <li>Cadastro e acolhimento</li>
                      <li>Modalidade e documentos</li>
                      <li>Conferência da Secretaria</li>
                      <li>Aprovação pastoral</li>
                      <li>Carteirinha elegível</li>
                    </ol>
                    <button className={styles.primary} type="button" onClick={() => setTab("admissoes")}>Ver admissões</button>
                  </section>
                  <section className={styles.panel}>
                    <p className={styles.eyebrow}>Pendências</p>
                    <h2>Fila de trabalho</h2>
                    {people.filter((p) => p.status !== "ACTIVE").map((p) => (
                      <div className={styles.slimRow} key={p.id}>
                        <span><strong>{p.name}</strong><small>{p.status === "VISITOR" ? "Aguardando abertura de protocolo" : "Próxima etapa: " + STEP_LABEL[nextStep(p) ?? "pastor"]}</small></span>
                        <span className={badge(p.status)}>{STATUS_LABEL[p.status]}</span>
                      </div>
                    ))}
                    <p className={styles.caption}>Os números acima são fictícios e não representam dados da igreja.</p>
                  </section>
                </div>
              </>
            ) : (
              <section className={styles.panel}>
                <p className={styles.eyebrow}>Área do membro · exemplo</p>
                <h2>Olá, Bruno Demo!</h2>
                <p>Você pode consultar sua carteirinha ilustrativa. Dados e permissões reais serão fornecidos pela API autenticada quando implantada.</p>
                <button className={styles.primary} type="button" onClick={() => setTab("carteirinhas")}>Ver minha carteirinha</button>
              </section>
            )}
          </div>
        )}
        {tab === "pessoas" && isStaff && (
          <div className={styles.section}>
            <div className={styles.sectionIntro}>
              <div><h2>Pessoas e famílias</h2><p>Cadastro único demonstrativo, sem conexão com banco de dados.</p></div>
              <input aria-label="Buscar pessoa" type="search" placeholder="Buscar nome, e-mail ou família" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            {role === "SECRETARIA" && (
              <form className={styles.form} onSubmit={addVisitor}>
                <h3>Registrar visitante fictício</h3>
                <div className={styles.formGrid}>
                  <label>Nome completo<input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex.: Elisa Exemplo" /></label>
                  <label>E-mail de teste<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="exemplo@example.test" /></label>
                  <label>Família ou núcleo<input value={household} onChange={(e) => setHousehold(e.target.value)} placeholder="Família Exemplo" /></label>
                  <button className={styles.primary} type="submit">Cadastrar visitante</button>
                </div>
              </form>
            )}
            <div className={styles.panel}>
              <h3>Cadastros ({visible.length})</h3>
              {visible.length === 0 && <p>Nenhum resultado.</p>}
              {visible.map((p) => <div className={styles.personRow} key={p.id}>
                <div className={styles.avatar} aria-hidden="true">{p.name.charAt(0)}</div>
                <div className={styles.personMain}><strong>{p.name}</strong><small>{p.household} · {p.email || "Sem e-mail"}</small></div>
                <span className={badge(p.status)}>{STATUS_LABEL[p.status]}</span>
              </div>)}
            </div>
          </div>
        )}
        {tab === "admissoes" && isStaff && (
          <div className={styles.section}>
            <div className={styles.sectionIntro}>
              <div><h2>Jornada de admissão</h2><p>As etapas não podem ser puladas; a decisão pastoral depende de perfil específico.</p></div>
            </div>
            {people.filter((p) => p.status !== "ACTIVE").map((p) => {
              const step = nextStep(p);
              const canAct = role === (step === "pastor" ? "PASTOR" : "SECRETARIA");
              return <section key={p.id} className={styles.panel}>
                <div className={styles.admissionHead}>
                  <div><h3>{p.name}</h3><p>{p.household} · {STATUS_LABEL[p.status]}</p></div>
                  <span className={badge(p.status)}>{STATUS_LABEL[p.status]}</span>
                </div>
                {p.status === "VISITOR" ? (
                  <div className={styles.admissionActions}>
                    {role === "SECRETARIA" ? (
                      <>
                        <label>Modalidade
                          <select value={modality} onChange={(e) => setModality(e.target.value as Modality)}>
                            {(["BATISMO", "TRANSFERENCIA", "RECONCILIACAO", "OUTRO"] as Modality[]).map((m) => <option key={m} value={m}>{MODALITY_LABEL[m]}</option>)}
                          </select>
                        </label>
                        <button className={styles.primary} type="button" onClick={() => startAdmission(p.id)}>Abrir protocolo</button>
                      </>
                    ) : <p className={styles.caption}>A Secretaria precisa abrir o protocolo primeiro.</p>}
                  </div>
                ) : (
                  <>
                    <div className={styles.steps}>
                      {STEP_ORDER.map((s, i) => <div key={s} className={p.checklist[s] ? styles.stepDone : s === step ? styles.stepCurrent : styles.stepLocked}>
                        <span className={styles.stepNumber}>{p.checklist[s] ? "✓" : String(i + 1)}</span>
                        <span>{STEP_LABEL[s]}</span>
                      </div>)}
                    </div>
                    <div className={styles.admissionActions}>
                      <p>{p.modality ? "Modalidade: " + MODALITY_LABEL[p.modality] + ". " : ""}Próxima etapa: <strong>{step ? STEP_LABEL[step] : "Concluída"}</strong>.</p>
                      {step && <button className={styles.primary} disabled={!canAct} type="button" onClick={() => completeStep(p.id, step)}>
                        {canAct ? "Concluir " + STEP_LABEL[step] : "Reservado a " + (step === "pastor" ? "Pastor" : "Secretaria")}
                      </button>}
                    </div>
                  </>
                )}
              </section>;
            })}
          </div>
        )}
        {tab === "carteirinhas" && (
          <div className={styles.section}>
            <div className={styles.sectionIntro}><div><h2>Carteirinhas digitais</h2><p>Exibição e emissão de exemplo. QR verificável somente com API implantada.</p></div></div>
            {(isStaff ? people.filter((p) => p.status === "ACTIVE") : member ? [member] : []).map((p) => (
              <section key={p.id} className={styles.cardRow}>
                <div className={styles.memberCard}>
                  <div className={styles.memberCardBrand}><span>✦</span> IGREJA DE DEUS <small>NO RIACHO FUNDO 1</small></div>
                  <div className={styles.memberCardBody}>
                    <small>CARTEIRINHA DIGITAL · DEMONSTRAÇÃO</small>
                    <h3>{p.name}</h3>
                    <p>{p.credential === "ACTIVE" ? "Membro ativo · Documento ilustrativo" : "Sem carteirinha ativa"}</p>
                    <code>{p.credential === "ACTIVE" ? p.token : "AGUARDANDO EMISSÃO"}</code>
                  </div>
                </div>
                <div className={styles.cardInfo}>
                  <h3>{p.name}</h3>
                  <p>{p.credential === "ACTIVE" ? "Carteirinha ativa na simulação." : p.credential === "REVOKED" ? "Carteirinha revogada na simulação." : "Ainda não foi emitida."}</p>
                  {role === "SECRETARIA" && (
                    p.credential === "ACTIVE"
                      ? <button className={styles.danger} type="button" onClick={() => changeCard(p.id, "REVOKED")}>Revogar carteirinha</button>
                      : <button className={styles.primary} disabled={!isEligible(p)} type="button" onClick={() => changeCard(p.id, "ACTIVE")}>Emitir carteirinha</button>
                  )}
                  {!isEligible(p) && <p className={styles.caption}>Emissão bloqueada até conclusão das aprovações.</p>}
                  <p className={styles.caption}>A imagem é demonstrativa. O token acima não deve ser usado para validar identidade ou acesso à igreja.</p>
                </div>
              </section>
            ))}
          </div>
        )}
        <footer className={styles.footer}>
          Protótipo F2 · contratos 0.2.0-f2 propostos · sem dados reais · sem autenticação.
          A operação definitiva dependerá da API NestJS e das aprovações da liderança.
        </footer>
      </div>
    </AppShell>
  );
}
