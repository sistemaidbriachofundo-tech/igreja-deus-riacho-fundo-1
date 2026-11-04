import Link from "next/link";
import { AppShell } from "../../components/AppShell";
import { withBasePath } from "../../lib/paths";
import styles from "./overview.module.css";

type StatIcon = "pessoas" | "coracao" | "documento" | "cartao";

function Icon({ kind }: { kind: StatIcon }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  if (kind === "pessoas") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><circle cx="9" cy="7" r="3" /><path d="M3 20v-2a6 6 0 0 1 12 0v2H3Z" /><circle cx="18" cy="8" r="2" /><path d="M17 14c2.3.3 4 2.2 4 4.7V20h-3" /></svg>;
  if (kind === "coracao") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M20.8 4.9a5.3 5.3 0 0 0-7.5 0L12 6.2l-1.3-1.3a5.3 5.3 0 0 0-7.5 7.5L12 21l8.8-8.6a5.3 5.3 0 0 0 0-7.5Z" /></svg>;
  if (kind === "documento") return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><path d="M6 2h8l5 5v15H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" /><path d="M14 2v6h5M8 13h8M8 17h6" /></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...common}><rect x="2.5" y="5" width="19" height="14" rx="2.3"/><path d="M2.5 10h19M6 15h5"/></svg>;
}

const modules = [
  { label: "Membros e famílias", description: "Cadastro e vínculos", url: "/app/membros/" },
  { label: "Secretaria", description: "Admissões e documentos", url: "/app/secretaria/" },
  { label: "Carteirinhas", description: "Identificação digital", url: "/app/membros/carteirinha/" },
] as const;

/** Visão geral com os elementos visuais da prancha aprovada.
 * Números abaixo são exemplos didáticos, nunca estatísticas reais da congregação.
 */
export default function VisaoGeralPage() {
  return (
    <AppShell active="visao" meta="Gestão e cuidado · Riacho Fundo I">
      <div className={styles.root}>
        <header className={styles.intro}>
          <div>
            <p className={styles.kicker}>Igreja de Deus · Riacho Fundo I</p>
            <h1>Visão geral</h1>
            <p className={styles.muted}>Uma plataforma para cuidar de pessoas e conectar ministérios.</p>
          </div>
          <span className={styles.introBadge}>● Ambiente demonstrativo</span>
        </header>

        <section className={styles.hero} aria-label="Boas-vindas">
          {/* Foto oficial já incorporada ao repositório; apenas efeito de atmosfera. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className={styles.heroPhoto} src={withBasePath("/images/hero-oficial.jpg")} alt="" width={928} height={1192} />
          <div className={styles.heroShade} aria-hidden="true" />
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}>Nossa missão</p>
            <h2>Uma igreja para DEUS, pelas FAMÍLIAS e enviada ao MUNDO.</h2>
            <p>Bem-vindo à plataforma da Igreja de Deus no Riacho Fundo I. Conheça como a tecnologia pode apoiar a comunhão, o cuidado e o serviço.</p>
            <div className={styles.actions}>
              <a className={styles.primary} href={withBasePath("/app/demo/")}>Explorar demonstração <span aria-hidden="true">↗</span></a>
              <a className={styles.outline} href={withBasePath("/app/membros/")}>Membros e famílias</a>
            </div>
          </div>
        </section>

        <div className={styles.sectionTitle}>
          <h2>Central de membresia</h2>
          <span>Indicadores fictícios para conhecer o sistema</span>
        </div>
        <section className={styles.stats} aria-label="Indicadores demonstrativos">
          <article className={styles.stat}><div className={styles.statHead}><p>Pessoas no exemplo</p><span className={styles.statIcon}><Icon kind="pessoas"/></span></div><strong>4</strong><small>Cadastros fictícios</small></article>
          <article className={styles.stat}><div className={styles.statHead}><p>Membros ativos</p><span className={styles.statIcon}><Icon kind="coracao"/></span></div><strong>2</strong><small>Exemplos aprovados</small></article>
          <article className={styles.stat}><div className={styles.statHead}><p>Admissões</p><span className={styles.statIcon}><Icon kind="documento"/></span></div><strong>1</strong><small>Em andamento</small></article>
          <article className={styles.stat}><div className={styles.statHead}><p>Carteirinhas</p><span className={styles.statIcon}><Icon kind="cartao"/></span></div><strong>1</strong><small>Exemplo ativo</small></article>
        </section>

        <div className={styles.panels}>
          <section className={styles.panel} aria-labelledby="actions-title">
            <p className={styles.panelKicker}>Acesso rápido</p>
            <h3 id="actions-title">Encontre o que precisa</h3>
            <p>Acompanhe pessoas, organize a Secretaria e conheça as carteirinhas digitais.</p>
            <div className={styles.modules}>
              {modules.map((module) => (
                <a key={module.url} className={styles.module} href={withBasePath(module.url)}>
                  <b>{module.label}</b>
                  <span>{module.description} <span aria-hidden="true">↗</span></span>
                </a>
              ))}
            </div>
          </section>
          <section className={styles.panel} aria-labelledby="journey-title">
            <p className={styles.panelKicker}>Jornada de cuidado</p>
            <h3 id="journey-title">Da primeira visita à membresia</h3>
            <p>O vínculo é construído com acolhimento e responsabilidade. As etapas formais devem respeitar o contrato e as aprovações da liderança.</p>
            <ol className={styles.journey}>
              {["Visitante e acolhimento", "Cadastro e documentação", "Conferência da Secretaria", "Aprovação pastoral", "Carteirinha elegível"].map((label, i) => (
                <li key={label}><span className={styles.step}>{i + 1}</span>{label}</li>
              ))}
            </ol>
          </section>
        </div>
        <p className={styles.bottomNote}>Este painel usa dados fictícios e não representa estatísticas reais da igreja. Os módulos operacionais dependem da API e do banco de dados. <Link href="/status/">Status técnico</Link>.</p>
      </div>
    </AppShell>
  );
}
