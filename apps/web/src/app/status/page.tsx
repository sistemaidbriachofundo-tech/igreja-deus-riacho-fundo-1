import { AppShell } from "../../components/AppShell";
import { withBasePath } from "../../lib/paths";
import styles from "./status.module.css";

const GITHUB = "https://github.com/sistemaidbriachofundo-tech/igreja-deus-riacho-fundo-1";

const MODULES = [
  {
    number: "01", label: "Painel e indicadores", description: "Nova Visão Geral, acessos rápidos e identificação visual da igreja.",
    href: "/app/", cta: "Explorar painel", state: "Visível agora",
  },
  {
    number: "02", label: "Central de membresia", description: "Cadastro fictício, etapas de admissão, conferência e aprovação pastoral simulada.",
    href: "/app/demo/", cta: "Testar a demonstração", state: "Interativo",
  },
  {
    number: "03", label: "Membros e Secretaria", description: "Novas telas responsivas. Consultas reais exigem acesso autorizado à API.",
    href: "/app/membros/", cta: "Conhecer a interface", state: "Interface publicada",
  },
  {
    number: "04", label: "Carteirinha digital", description: "Nova apresentação marrom e dourada. QR operacional depende do ambiente com API.",
    href: "/app/membros/carteirinha/", cta: "Ver carteirinha", state: "Interface publicada",
  },
] as const;

const ROADMAP = [
  {
    label: "Entregue ao repositório",
    title: "Frontend e Backend reunidos",
    description: "As entregas #21 e #28 foram integradas à main. O site estático foi publicado pelo GitHub Actions.",
    state: "Concluído",
    completed: true,
  },
  {
    label: "Disponível para experimentar",
    title: "Demonstração com dados fictícios",
    description: "É possível testar o fluxo e alternar perfis ilustrativos no próprio navegador, sem conta nem servidor.",
    state: "Disponível",
    completed: true,
  },
  {
    label: "Próximo marco",
    title: "API em ambiente de homologação",
    description: "O Cursor está responsável por infraestrutura e segurança. A API não funciona dentro do GitHub Pages.",
    state: "Pendente",
    completed: false,
  },
  {
    label: "Após homologação",
    title: "Fluxos reais integrados",
    description: "Ligar formulários e dados às APIs autenticadas e comprovar o percurso de ponta a ponta.",
    state: "A desenvolver",
    completed: false,
  },
] as const;

export default function StatusPage() {
  return (
    <AppShell meta="Acompanhe a evolução · Riacho Fundo I">
      <main className={styles.root} id="conteudo">
        <header className={styles.hero}>
          <div className={styles.glow} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>Sua igreja · Nossa plataforma</p>
            <h1>Veja o sistema ganhando vida.</h1>
            <p className={styles.lead}>Conheça as telas que já foram publicadas e acompanhe as próximas entregas, sem confundir a demonstração com dados reais da congregação.</p>
            <div className={styles.heroActions}>
              <a className={styles.primary} href={withBasePath("/app/demo/")}>Testar a nova versão <span aria-hidden="true">↗</span></a>
              <a className={styles.secondary} href={withBasePath("/app/")}>Abrir painel</a>
            </div>
            <p className={styles.release}>Atualização do frontend e backend · 4 de novembro de 2026</p>
          </div>
          <div className={styles.heroArt} aria-hidden="true">
            <div className={styles.artTop}><span className={styles.artDot} /> Igreja de Deus · Plataforma</div>
            <div className={styles.artBars}>
              <span className={styles.artBig} />
              <span className={styles.artMedium} />
              <span className={styles.artShort} />
            </div>
            <div className={styles.artCards}><span /><span /><span /></div>
            <div className={styles.artFooter}><i /><span /><span /></div>
          </div>
        </header>

        <section aria-labelledby="modules-title" className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionKicker}>Explore o que mudou</p>
              <h2 id="modules-title">As telas da nova versão</h2>
            </div>
            <span className={styles.subtle}>Links para a publicação atual</span>
          </div>
          <div className={styles.moduleGrid}>
            {MODULES.map((item) => (
              <article key={item.number} className={styles.moduleCard}>
                <div className={styles.moduleTop}>
                  <span className={styles.moduleNumber}>{item.number}</span>
                  <span className={styles.moduleState}>{item.state}</span>
                </div>
                <h3>{item.label}</h3>
                <p>{item.description}</p>
                <a href={withBasePath(item.href)}>{item.cta} <span aria-hidden="true">↗</span></a>
              </article>
            ))}
          </div>
        </section>

        <section aria-labelledby="progress-title" className={styles.section}>
          <div className={styles.sectionHead}>
            <div>
              <p className={styles.sectionKicker}>Evolução transparente</p>
              <h2 id="progress-title">Onde estamos no desenvolvimento</h2>
            </div>
          </div>
          <ol className={styles.timeline}>
            {ROADMAP.map((item, i) => (
              <li key={item.title} className={styles.milestone}>
                <span className={item.completed ? styles.timelineDone : styles.timelinePending} aria-label={item.completed ? "Concluído" : "Não concluído"}>
                  {item.completed ? "✓" : i + 1}
                </span>
                <div className={styles.milestoneText}>
                  <span className={styles.milestoneLabel}>{item.label}</span>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </div>
                <span className={styles.milestoneStatus}>{item.state}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.endNote} aria-label="Informações de acompanhamento">
          <div>
            <p className={styles.sectionKicker}>Acompanhe pelo GitHub</p>
            <h2>Você consegue ver cada avanço.</h2>
            <p>O frontend é desenvolvido pelo ChatGPT; a API, o banco e a infraestrutura, pelo Cursor. Alterações futuras passam por Pull Requests e testes antes de integrar a versão pública.</p>
            <div className={styles.links}>
              <a href={GITHUB + "/actions"} target="_blank" rel="noreferrer">Ver testes e publicações ↗</a>
              <a href={GITHUB + "/pulls"} target="_blank" rel="noreferrer">Ver entregas em revisão ↗</a>
            </div>
          </div>
          <div className={styles.safety}>
            <strong>Sobre a demonstração</strong>
            <p>Os nomes e números são inventados e ficam somente neste navegador. Nenhum cadastro realizado ali corresponde a uma pessoa real da igreja.</p>
          </div>
        </section>
      </main>
    </AppShell>
  );
}
