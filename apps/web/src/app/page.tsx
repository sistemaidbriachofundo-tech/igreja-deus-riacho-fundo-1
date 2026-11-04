import Link from "next/link";
import { APP_NAME } from "@idbrf/shared";
import { withBasePath } from "../lib/paths";

const INSTAGRAM_URL = "https://www.instagram.com/idbriacho_/";

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

/**
 * Portal público (DAS) — estrutura de produto, não revista Instagram.
 * Fotos oficiais só como atmosfera; IA dos módulos = protótipo v5 (F2).
 */
export default function HomePage() {
  const heroSrc = withBasePath("/images/hero-oficial.jpg");
  const communitySrc = withBasePath("/images/comunidade-oficial.jpg");
  const worshipSrc = withBasePath("/images/adoracao-oficial.jpg");

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
        <nav className="site-nav" aria-label="Portal">
          <a href="#congregacao">A congregação</a>
          <a href="#acesso">Acesso</a>
          <a href={withBasePath("/app/")}>Área interna</a>
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
              width={928}
              height={1192}
              fetchPriority="high"
            />
            <span className="hero-veil" />
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
              Portal da congregação piloto — fé, família, cuidado, comunhão e
              missão.
            </p>

            <div className="hero-actions">
              <a className="btn btn-primary" href={withBasePath("/app/")}>
                Entrar na área interna
              </a>
              <a
                className="btn btn-secondary"
                href={withBasePath("/app/membros/carteirinha/")}
              >
                Minha carteirinha
              </a>
            </div>
          </div>
        </section>

        <section
          id="congregacao"
          className="section section-congregation"
          aria-labelledby="congregation-heading"
        >
          <div className="section-split">
            <div className="section-copy">
              <p className="section-kicker">Portal público · DAS</p>
              <h2 id="congregation-heading">Riacho Fundo I</h2>
              <p>
                Unidade piloto da Igreja de Deus. Este site é a face pública da
                plataforma de gestão — cadastro único, secretaria e carteirinha
                digital sob a identidade da congregação.
              </p>
            </div>
            <figure className="section-visual">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={communitySrc}
                alt="Comunidade da Igreja de Deus no Riacho Fundo I"
                width={932}
                height={1180}
                loading="lazy"
              />
            </figure>
          </div>
        </section>

        <section
          id="acesso"
          className="section section-access"
          aria-labelledby="access-heading"
        >
          <div className="section-inner section-inner--wide">
            <p className="section-kicker">Protótipo v5 · Principal</p>
            <h2 id="access-heading">Módulos deste ciclo (F2)</h2>
            <p className="section-lede">
              Nomenclatura e fluxos do protótipo navegável — só o recorte de
              pessoas, secretaria e carteirinha.
            </p>

            <ul className="access-grid">
              <li>
                <a className="access-tile" href={withBasePath("/app/")}>
                  <span className="access-tile-label">Visão geral</span>
                  <span className="access-tile-desc">
                    Painel de entrada da área interna
                  </span>
                </a>
              </li>
              <li>
                <a className="access-tile" href={withBasePath("/app/membros/")}>
                  <span className="access-tile-label">Membros e famílias</span>
                  <span className="access-tile-desc">
                    Cadastro único e vínculos (piloto RF1)
                  </span>
                </a>
              </li>
              <li>
                <a
                  className="access-tile"
                  href={withBasePath("/app/secretaria/")}
                >
                  <span className="access-tile-label">Secretaria</span>
                  <span className="access-tile-desc">
                    Admissão, emissão e revogação de carteirinha
                  </span>
                </a>
              </li>
              <li>
                <a
                  className="access-tile"
                  href={withBasePath("/app/membros/carteirinha/")}
                >
                  <span className="access-tile-label">Carteirinhas</span>
                  <span className="access-tile-desc">
                    Carteirinha digital com QR opaco
                  </span>
                </a>
              </li>
            </ul>
          </div>
        </section>

        <section
          id="comunhao"
          className="section section-atmosphere"
          aria-labelledby="atmosphere-heading"
        >
          <div className="section-split section-split--reverse">
            <div className="section-copy">
              <p className="section-kicker">Comunhão</p>
              <h2 id="atmosphere-heading">Casa de adoração</h2>
              <p>
                Fotografia real da congregação — a atmosfera do culto, não um
                template genérico. Programação e avisos seguem os canais
                oficiais.
              </p>
              <p className="section-note">
                Instagram{" "}
                <a
                  href={INSTAGRAM_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  @idbriacho_
                </a>
              </p>
            </div>
            <figure className="section-visual">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={worshipSrc}
                alt="Adoração na Igreja de Deus no Riacho Fundo I"
                width={932}
                height={1180}
                loading="lazy"
              />
            </figure>
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
            <a href={withBasePath("/app/")}>Área interna</a>
            {" · "}
            <Link href="/status/">Status do projeto</Link>
            {" · "}
            <a href={INSTAGRAM_URL} target="_blank" rel="noopener noreferrer">
              Instagram
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
