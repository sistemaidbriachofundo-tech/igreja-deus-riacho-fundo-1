"use client";

import { useState } from "react";
import { instagramUrl, youtubeChannelUrl } from "../lib/portal-content";
import s from "./portal-video-showcase.module.css";

const videos = [
  { id: "lTjvE8G_YAE", title: "Culto de Santa Ceia", date: "08/11/2026", detail: "Culto da noite" },
  { id: "0UfdJJmBU6o", title: "Quinta do Encontro", date: "05/11/2026", detail: "Culto de quinta" },
  { id: "ssdJz_f7ZGs", title: "Som de Gerações", date: "01/11/2026", detail: "Culto de adoração · Pr. Édson Soares" },
];

function VideoThumbnail({ id, featured = false }: { id: string; featured?: boolean }) {
  const file = featured ? "maxresdefault.jpg" : "mqdefault.jpg";
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={"https://i.ytimg.com/vi/" + id + "/" + file} alt="" width={featured ? 1280 : 320} height={featured ? 720 : 180} loading="lazy" decoding="async" />
  );
}

export function PortalVideoShowcase() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const featured = videos.find(video => video.id === playingId) ?? videos[0];

  return (
    <section className={s.section} id="videos" aria-labelledby="youtube-title">
      <div className={s.inner}>
        <div className={s.heading}>
          <div>
            <p className={s.kicker}>Canal oficial</p>
            <h2 id="youtube-title">Igreja <em>em vídeo.</em></h2>
            <p>Assista aos cultos e às mensagens da Igreja de Deus no Riacho Fundo I.</p>
          </div>
          <a className={s.channelLink} href={youtubeChannelUrl} target="_blank" rel="noopener noreferrer">
            Visitar canal no YouTube <span aria-hidden="true">↗</span>
          </a>
        </div>

        <div className={s.showcase}>
          <div className={s.featured}>
            <div className={s.screen}>
              {playingId ? (
                <iframe
                  key={playingId}
                  ref={frame => frame?.focus()}
                  src={"https://www.youtube-nocookie.com/embed/" + playingId + "?autoplay=1"}
                  title={featured.title + " no YouTube"}
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <button className={s.cover} type="button" onClick={() => setPlayingId(featured.id)} aria-label={"Assistir a " + featured.title}>
                  <VideoThumbnail id={featured.id} featured />
                  <span className={s.play} aria-hidden="true">▶</span>
                </button>
              )}
            </div>
            <div className={s.caption}>
              <div>
                <p>{featured.detail} · {featured.date}</p>
                <h3>{featured.title}</h3>
              </div>
              <a href={"https://www.youtube.com/watch?v=" + featured.id} target="_blank" rel="noopener noreferrer" className={s.watchLink}>
                Abrir no YouTube <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>

          <div className={s.library}>
            <h3>Gravações do canal</h3>
            <ul>
              {videos.map(video => (
                <li key={video.id}>
                  <button
                    type="button"
                    className={s.videoOption}
                    aria-current={video.id === featured.id ? "true" : undefined}
                    onClick={() => setPlayingId(video.id)}
                  >
                    <span className={s.thumbnail}><VideoThumbnail id={video.id} /></span>
                    <span className={s.videoDetails}><strong>{video.title}</strong><small>{video.date}</small></span>
                    <span className={s.optionPlay} aria-hidden="true">▶</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={s.instagram}>
          <div>
            <h3>Acompanhe a igreja no Instagram</h3>
            <p>Veja avisos, fotos e momentos da nossa comunidade.</p>
          </div>
          <a href={instagramUrl} target="_blank" rel="noopener noreferrer">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
              <rect x="3" y="3" width="18" height="18" rx="5" />
              <circle cx="12" cy="12" r="4" />
              <circle cx="17.5" cy="6.5" r=".8" fill="currentColor" stroke="none" />
            </svg>
            @idbriacho_ <span aria-hidden="true">↗</span>
          </a>
        </div>
      </div>
    </section>
  );
}
