import Link from "next/link";
import { APP_NAME } from "@idbrf/shared";
import { withBasePath } from "../lib/paths";

function BrandMark({ className }: { className?: string }) {
  return (
    <span className={className ?? "brand-mark"} aria-hidden="true">
      <svg viewBox="0 0 24 24" focusable="false">
        <path
          fill="currentColor"
          d="M10.2 3.2h3.6v6.4h6v3.6h-6v7.6h-3.6v-7.6h-6V9.6h6z"
        />
      </svg>
    </span>
  );
}

export default function HomePage() {
  return (
    <div className="site">
      <a className="skip-link" href="#conteudo">
        Ir para o conteúdo
      </a>

      <header className="site-header">
        <Link className="site-brand" href="/">
          <BrandMark className="brand-mark brand-mark--header" />
          <span className="site-brand-text">
            <span className="site-brand-name">Igreja de Deus</span>
            <span className="site-brand-place">no Riacho Fundo I</span>
          </span>
        </Link>
        <nav className="site-nav" aria-label="Seções da página">
          <a href="#bem-vindo">Bem-vindo</a>
          <a href="#culto">Culto</a>
          <a href="#contato">Contato</a>
        </nav>
      </header>

      <main id="conteudo">
        <section className="hero" aria-label="Apresentação">
          <div className="hero-atmosphere" aria-hidden="true">
            <span className="hero-glow" />
            <span className="hero-cross">
              <svg viewBox="0 0 120 160" focusable="false">
                <path
                  fill="currentColor"
                  d="M48 8h24v48h32v24H72v72H48V80H16V56h32z"
                />
              </svg>
            </span>
            <span className="hero-haze" />
          </div>

          <div className="hero-content">
            <p className="hero-brand">
              <BrandMark className="brand-mark brand-mark--hero" />
              <span className="hero-brand-copy">
                <span className="hero-brand-name">Igreja de Deus</span>
                <span className="hero-brand-place">no Riacho Fundo I</span>
              </span>
            </p>

            <h1 className="hero-title">
              Uma casa de fé, família e comunhão
            </h1>
            <p className="hero-lede">
              Bem-vindo à nossa congregação — um espaço acolhedor para
              adorar a Deus e caminhar juntos.
            </p>

            <div className="hero-actions">
              <a className="btn btn-primary" href="#culto">
                Próximo culto
              </a>
              <a className="btn btn-secondary" href="#contato">
                Fale conosco
              </a>
            </div>
          </div>
        </section>

        <section
          id="bem-vindo"
          className="section section-welcome"
          aria-labelledby="welcome-heading"
        >
          <div className="section-inner">
            <p className="section-kicker">Bem-vindo</p>
            <h2 id="welcome-heading">Você é bem-vindo aqui</h2>
            <p>
              Somos a Igreja de Deus no Riacho Fundo I. Vivemos fé, família,
              cuidado, comunhão e missão — com simplicidade e coração aberto a
              quem chega.
            </p>
          </div>
        </section>

        <section
          id="culto"
          className="section section-service"
          aria-labelledby="service-heading"
        >
          <div className="section-inner">
            <p className="section-kicker">Culto</p>
            <h2 id="service-heading">Próximo culto</h2>
            <p>
              Em breve publicaremos horários e avisos desta semana. Enquanto
              isso, venha conosco — há lugar para você.
            </p>
            <p className="service-placeholder" role="status">
              Horário a confirmar · Riacho Fundo I
            </p>
          </div>
        </section>

        <section
          id="contato"
          className="section section-contact"
          aria-labelledby="contact-heading"
        >
          <div className="section-inner">
            <p className="section-kicker">Contato</p>
            <h2 id="contact-heading">Fale com a igreja</h2>
            <p>
              Quer conhecer a congregação, pedir oração ou saber mais sobre
              nossos encontros? Entre em contato — teremos alegria em
              receber você.
            </p>
            <p className="contact-note">
              Canais de atendimento serão publicados em breve.
            </p>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <p className="site-footer-brand">{APP_NAME}</p>
          <p className="site-footer-meta">
            Fé · Família · Cuidado · Comunhão · Missão
          </p>
          <p className="site-footer-links">
            <Link href="/status/">Status do projeto</Link>
            {" · "}
            <a href={withBasePath("/app/secretaria/")}>Área interna</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
