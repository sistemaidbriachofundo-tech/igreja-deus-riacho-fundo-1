import { withBasePath } from "../lib/paths";
import s from "./portal-video-showcase.module.css";

const youtube = "https://www.youtube.com/@IDBRiachoFundo1";

export function PortalVideoShowcase() {
  return (
    <section className={s.section} aria-labelledby="youtube-title">
      <div className={s.media} aria-hidden="true">
        {/* Fotografia existente, usada apenas na composição editorial. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath("/images/adoracao-oficial.jpg")} alt="" loading="lazy" className={s.photo} />
        {/* Ilustração vetorial original, sem referência a vídeos não verificados. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={withBasePath("/images/portal-video-art.svg")} alt="" loading="lazy" className={s.art} />
      </div>
      <div className={s.inner}>
        <div className={s.copy}>
          <span className={s.kicker}><span /> IGREJA DE DEUS · EM VÍDEO</span>
          <h2 id="youtube-title">A mensagem continua <em>com você.</em></h2>
          <p>Continue conectado à nossa comunidade por meio do canal oficial da IDB Riacho Fundo I. Mensagens, celebrações e conteúdos para acompanhar de onde estiver.</p>
          <div className={s.actions}>
            <a href={youtube} target="_blank" rel="noopener noreferrer" className={s.primary}>
              <span className={s.play} aria-hidden="true">▶</span> Visitar nosso YouTube <span aria-hidden="true">↗</span>
            </a>
            <a href={youtube + "/videos"} target="_blank" rel="noopener noreferrer" className={s.secondary}>Explorar os vídeos <span aria-hidden="true">↗</span></a>
          </div>
          <p className={s.disclosure}>Fotografia ilustrativa. A lista de vídeos é apresentada diretamente pelo YouTube para evitar conteúdos desatualizados.</p>
        </div>
        <a className={s.channelCard} href={youtube} target="_blank" rel="noopener noreferrer" aria-label="Abrir canal oficial IDB Riacho Fundo I no YouTube">
          <span className={s.platform}><span className={s.platformMark}>▶</span> YOUTUBE OFICIAL</span>
          <strong>IDB<br/>Riacho Fundo I</strong>
          <span className={s.channelFoot}>Conheça nosso canal <span aria-hidden="true">↗</span></span>
        </a>
      </div>
    </section>
  );
}
