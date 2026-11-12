"use client";

import { useState } from "react";
import { youtubeChannelUrl } from "../lib/portal-content";
import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
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
  const layout = usePublishedSiteLayout();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const featured = videos.find(video => video.id === playingId) ?? videos[0];
  if (layout.hidden.includes("videos")) return null;

  return (
    <section className={s.section} id="videos" aria-labelledby="youtube-title">
      <div className={s.inner}>
        <div className={s.heading}>
          <div>
            <h2 id="youtube-title">Cultos e mensagens</h2>
          </div>
          <a className={s.channelLink} href={youtubeChannelUrl} target="_blank" rel="noopener noreferrer">
            Canal no YouTube <span className={s.externalArrow} aria-hidden="true" />
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
                <button className={s.cover} type="button" onClick={() => setPlayingId(featured.id)} aria-label={"Reproduzir " + featured.title}>
                  <VideoThumbnail id={featured.id} featured />
                  <span className={s.play} aria-hidden="true" />
                </button>
              )}
            </div>
            <div className={s.caption}>
              <div>
                <p>{featured.detail} · {featured.date}</p>
                <h3>{featured.title}</h3>
              </div>
              <a href={"https://www.youtube.com/watch?v=" + featured.id} target="_blank" rel="noopener noreferrer" className={s.watchLink}>
                Abrir no YouTube <span className={s.externalArrow} aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className={s.library}>
            <h3>Outras gravações</h3>
            <ul>
              {videos.filter(video => video.id !== featured.id).map(video => (
                <li key={video.id}>
                  <button
                    type="button"
                    className={s.videoOption}
                    onClick={() => setPlayingId(video.id)}
                  >
                    <span className={s.thumbnail}><VideoThumbnail id={video.id} /></span>
                    <span className={s.videoDetails}><strong>{video.title}</strong><small>{video.date}</small></span>
                    <span className={s.optionPlay} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </div>

      </div>
    </section>
  );
}
