import Link from "next/link";
import { APP_NAME } from "@idbrf/shared";
import { withBasePath } from "../lib/paths";

const INSTAGRAM_URL = "https://www.instagram.com/idbriacho_/";
const INSTAGRAM_HANDLE = "@idbriacho_";

function BrandMark({ className }: { className?: string }) {
  return (
    <span className={className ?? "brand-mark"} aria-hidden="true">
      <svg viewBox="0 0 48 48" focusable="false">
        <path
          fill="currentColor"
          d="M22.2 6h3.6v14.2H40v3.6H25.8V42h-3.6V23.8H8v-3.6h14.2z"
        />
        <path
          fill="currentColor"
          opacity="0.92"
          d="M31.2 11.2c2.6 2.1 4.4 5.1 4.4 8.4 0 2.2-.8 4-2.1 5.4-1.1-3.4-3.2-6.2-6.1-8.1 1.1-1.9 2.5-3.8 3.8-5.7z"
        />
      </svg>
    </span>
  );
}

function InstagramIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className="icon-ig">
      <path
        fill="currentColor"
        d="M12 7.2A4.8 4.8 0 1 0 12 16.8 4.8 4.8 0 0 0 12 7.2Zm0 7.9a3.1 3.1 0 1 1 0-6.2 3.1 3.1 0 0 1 0 6.2Zm6.1-8.2a1.12 1.12 0 1 1-2.24 0 1.12 1.12 0 0 1 2.24 0ZM12 3.5c-2.3 0-2.6 0-3.5.05-.9.04-1.5.2-2.04.41a4.1 4.1 0 0 0-1.5 1.5c-.22.53-.37 1.14-.41 2.04C4.5 8.4 4.5 8.7 4.5 11s0 2.6.05 3.5c.04.9.2 1.5.41 2.04a4.1 4.1 0 0 0 1.5 1.5c.53.22 1.14.37 2.04.41.9.05 1.2.05 3.5.05s2.6 0 3.5-.05c.9-.04 1.5-.2 2.04-.41a4.1 4.1 0 0 0 1.5-1.5c.22-.53.37-1.14.41-2.04.05-.9.05-1.2.05-3.5s0-2.6-.05-3.5c-.04-.9-.2-1.5-.41-2.04a4.1 4.1 0 0 0-1.5-1.5c-.53-.22-1.14-.37-2.04-.41C14.6 3.5 14.3 3.5 12 3.5Zm0 1.53c2.26 0 2.53 0 3.42.05.83.04 1.28.18 1.58.3.4.15.68.34.98.64.3.3.49.58.64.98.12.3.26.75.3 1.58.04.89.05 1.16.05 3.42s0 2.53-.05 3.42c-.04.83-.18 1.28-.3 1.58-.15.4-.34.68-.64.98-.3.3-.58.49-.98.64-.3.12-.75.26-1.58.3-.89.04-1.16.05-3.42.05s-2.53 0-3.42-.05c-.83-.04-1.28-.18-1.58-.3a2.6 2.6 0 0 1-.98-.64 2.6 2.6 0 0 1-.64-.98c-.12-.3-.26-.75-.3-1.58-.04-.89-.05-1.16-.05-3.42s0-2.53.05-3.42c.04-.83.18-1.28.3-1.58.15-.4.34-.68.64-.98.3-.3.58-.49.98-.64.3-.12.75-.26 1.58-.3.89-.04 1.16-.05 3.42-.05Z"
      />
    </svg>
  );
}

export default function HomePage() {
  const heroSrc = withBasePath("/images/hero-worship.jpg");
  const welcomeSrc = withBasePath("/images/welcome-gathering.jpg");
  const cultoSrc = withBasePath("/images/culto-light.jpg");

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
          <a href="#cultos">Cultos</a>
          <a href="#contato">Contato</a>
          <a
            className="site-nav-ig"
            href={INSTAGRAM_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            Instagram
          </a>
        </nav>
      </header>

      <main id="conteudo">
        <section className="hero" aria-label="Apresentação">
          <div className="hero-media" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="hero-photo"
              src={heroSrc}
              alt=""
              width={2400}
              height={1600}
              fetchPriority="high"
            />
            <span className="hero-veil" />
            <span className="hero-grain" />
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
              Uma igreja para Deus, pelas famílias
            </h1>
            <p className="hero-lede">
              Casa de adoração e comunhão no Riacho Fundo I — venha
              caminhar conosco.
            </p>

            <div className="hero-actions">
              <a className="btn btn-primary" href="#cultos">
                Nossos cultos
              </a>
              <a
                className="btn btn-secondary"
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                <InstagramIcon />
                {INSTAGRAM_HANDLE}
              </a>
            </div>
          </div>
        </section>

        <section
          id="bem-vindo"
          className="section section-welcome"
          aria-labelledby="welcome-heading"
        >
          <div className="section-split">
            <div className="section-copy">
              <p className="section-kicker">Comunidade</p>
              <h2 id="welcome-heading">Acolher para conectar</h2>
              <p>
                Somos a Igreja de Deus no Riacho Fundo I. Vivemos fé,
                família, cuidado, comunhão e missão — com coração aberto a
                quem chega.
              </p>
            </div>
            <figure className="section-visual">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={welcomeSrc}
                alt="Interior de templo iluminado, atmosfera de culto"
                width={1600}
                height={1064}
                loading="lazy"
              />
            </figure>
          </div>
        </section>

        <section
          id="cultos"
          className="section section-service"
          aria-labelledby="service-heading"
        >
          <div className="section-split section-split--reverse">
            <div className="section-copy">
              <p className="section-kicker">Cultos</p>
              <h2 id="service-heading">Encontros para adorar juntos</h2>
              <p>
                Nossos cultos são momentos de adoração, Palavra e comunhão.
                Os horários e avisos da semana são publicados no Instagram
                da congregação.
              </p>
              <ul className="service-list">
                <li>
                  <span className="service-label">Culto de adoração</span>
                  <span className="service-detail">
                    Confira data e horário em {INSTAGRAM_HANDLE}
                  </span>
                </li>
                <li>
                  <span className="service-label">Família e juventude</span>
                  <span className="service-detail">
                    Encontros e programações especiais anunciados no feed
                  </span>
                </li>
              </ul>
              <a
                className="text-link"
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ver programação no Instagram →
              </a>
            </div>
            <figure className="section-visual section-visual--tall">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cultoSrc}
                alt="Velas acesas em clima de oração e culto"
                width={1600}
                height={2400}
                loading="lazy"
              />
            </figure>
          </div>
        </section>

        <section
          id="contato"
          className="section section-contact"
          aria-labelledby="contact-heading"
        >
          <div className="section-inner section-inner--wide">
            <p className="section-kicker">Contato</p>
            <h2 id="contact-heading">Fale com a congregação</h2>
            <p>
              Quer conhecer a igreja, pedir oração ou saber do próximo
              encontro? Fale conosco pelo Instagram — teremos alegria em
              receber você.
            </p>
            <a
              className="contact-ig"
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              <InstagramIcon />
              <span>
                <strong>Instagram {INSTAGRAM_HANDLE}</strong>
                <span className="contact-ig-url">
                  instagram.com/idbriacho_
                </span>
              </span>
            </a>
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
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Instagram
            </a>
            {" · "}
            <Link href="/status/">Status do projeto</Link>
            {" · "}
            <a href={withBasePath("/app/secretaria/")}>Área interna</a>
          </p>
        </div>
      </footer>
    </div>
  );
}
