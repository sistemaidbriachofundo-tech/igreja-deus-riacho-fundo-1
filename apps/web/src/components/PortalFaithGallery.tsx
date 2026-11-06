"use client";

import Link from "next/link";
import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import { withBasePath } from "../lib/paths";
import s from "./portal-faith-gallery.module.css";

/**
 * Galeria editorial de quatro cenas ilustrativas fornecidas pelo responsável.
 * Cada fotografia foi otimizada em WebP e armazenada neste repositório.
 * O export estático não depende de servidores externos para exibi-las.
 */
const moments = [
  {
    title: "Louvor",
    subtitle: "Uma expressão de fé",
    alt: "Ilustração de um homem cantando ao microfone, com uma das mãos erguidas e iluminação violeta.",
    file: "/images/galeria-louvor.webp",
  },
  {
    title: "Juventude",
    subtitle: "Geração com propósito",
    alt: "Ilustração de apresentação de dança de jovens em palco com iluminação roxa e a inscrição CONF2K26.",
    file: "/images/galeria-juventude.webp",
  },
  {
    title: "Oração",
    subtitle: "Caminhar uns com os outros",
    alt: "Ilustração de pessoas reunidas em oração, em atitude de acolhimento e intercessão.",
    file: "/images/galeria-oracao.webp",
  },
  {
    title: "Palavra",
    subtitle: "Uma mensagem que inspira",
    alt: "Ilustração de um homem com microfone, sorrindo e levantando o braço enquanto fala.",
    file: "/images/galeria-palavra.webp",
  },
] as const;

export function PortalFaithGallery() {
  const site = usePublishedSiteLayout();
  return (
    <section id="galeria" className={s.gallery} data-appearance={site.appearance} aria-labelledby="faith-gallery-title">
      <div className={s.inner}>
        <div className={s.head} data-portal-reveal>
          <div className={s.heading}>
            <span className={s.eyebrow}><span className={s.eyebrowDash} /> GALERIA / EXPRESSÕES DA FÉ</span>
            <h2 id="faith-gallery-title">{site.gallery.title}<br/><em>{site.gallery.accent}</em></h2>
            <p>{site.gallery.description}</p>
          </div>
          <Link href="/a-igreja/" className={s.more}>Conheça nossa história <span aria-hidden="true">↗</span></Link>
        </div>
        <div className={s.moments}>
          {site.gallery.items.map((moment, index) => (
            <figure className={s.card} key={moment.title} data-portal-reveal>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={s.image}
                src={moment.imageUrl.startsWith("/") ? withBasePath(moment.imageUrl) : moment.imageUrl}
                alt={moment.alt}
                width={850}
                height={1060}
                loading="lazy"
                decoding="async"
              />
              <figcaption className={s.caption}>
                <span className={s.index}>0{index + 1}</span>
                <div><strong>{moment.title}</strong><small>{moment.subtitle}</small></div>
              </figcaption>
            </figure>
          ))}
        </div>
        <div className={s.after}>
          <p><span aria-hidden="true">✳</span> Imagens ilustrativas fornecidas para a identidade visual do portal; não são registro de programação ou evento confirmado.</p>
          <Link href="/visita/">Planeje sua visita <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </section>
  );
}
