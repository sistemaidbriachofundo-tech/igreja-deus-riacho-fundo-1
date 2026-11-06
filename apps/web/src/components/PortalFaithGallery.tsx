import Link from "next/link";
import { withBasePath } from "../lib/paths";
import s from "./portal-faith-gallery.module.css";

/**
 * Galeria editorial de quatro cenas ilustrativas fornecidas pelo responsável.
 * Retratos reunidos em um sprite AVIF para reduzir requisições e manter o
 * export estático sem dependência de serviços de imagem de terceiros.
 */
const moments = [
  {
    title: "Louvor",
    subtitle: "Uma expressão de fé",
    alt: "Ilustração de um homem cantando ao microfone, com uma das mãos erguidas e iluminação violeta.",
    position: "0% 50%",
  },
  {
    title: "Juventude",
    subtitle: "Geração com propósito",
    alt: "Ilustração de apresentação de dança de jovens em palco com iluminação roxa e a inscrição CONF2K26.",
    position: "33.333% 50%",
  },
  {
    title: "Oração",
    subtitle: "Caminhar uns com os outros",
    alt: "Ilustração de pessoas reunidas em oração, em atitude de acolhimento e intercessão.",
    position: "66.667% 50%",
  },
  {
    title: "Palavra",
    subtitle: "Uma mensagem que inspira",
    alt: "Ilustração de um homem com microfone, sorrindo e levantando o braço enquanto fala.",
    position: "100% 50%",
  },
] as const;

export function PortalFaithGallery() {
  const imageUrl = withBasePath("/images/retratos-fe-v10.avif");
  return (
    <section id="galeria" className={s.gallery} aria-labelledby="faith-gallery-title">
      <div className={s.inner}>
        <div className={s.head} data-portal-reveal>
          <div className={s.heading}>
            <span className={s.eyebrow}><span className={s.eyebrowDash} /> 03 / EXPRESSÕES DA FÉ</span>
            <h2 id="faith-gallery-title">A fé tem muitas formas<br />de <em>se expressar.</em></h2>
            <p>Louvor, juventude, oração e Palavra. Expressões que traduzem a vida em comunidade e o desejo de caminhar com Deus.</p>
          </div>
          <Link href="/a-igreja/" className={s.more}>Conheça nossa história <span aria-hidden="true">↗</span></Link>
        </div>
        <div className={s.moments}>
          {moments.map((moment, index) => (
            <figure className={s.card} key={moment.title} data-portal-reveal>
              <div
                className={s.image}
                role="img"
                aria-label={moment.alt}
                style={{
                  backgroundImage: `url("${imageUrl}")`,
                  backgroundPosition: moment.position,
                }}
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
