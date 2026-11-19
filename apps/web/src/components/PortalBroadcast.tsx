"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { withBasePath } from "../lib/paths";
import { usePublishedResource } from "../lib/use-published-resource";
import s from "./portal-broadcast.module.css";

type Broadcast = { id: string; title: string; embeddable: boolean };
type LiveState = { broadcast: Broadcast | null };
const Context = createContext<{ video: Broadcast; test: boolean } | null>(null);
const validId = /^[a-zA-Z0-9_-]{11}$/;

function parseLive(payload: unknown): LiveState | null {
  if (!payload || typeof payload !== "object" || !("broadcast" in payload)) return null;
  const { broadcast } = payload;
  if (broadcast === null) return { broadcast };
  if (!broadcast || typeof broadcast !== "object" || !("id" in broadcast) || !("title" in broadcast) || !("embeddable" in broadcast)) return null;
  const { id, title, embeddable } = broadcast;
  return typeof id === "string" && validId.test(id) && typeof title === "string" && title.trim() && typeof embeddable === "boolean"
    ? { broadcast: { id, title, embeddable } }
    : null;
}

export function PortalBroadcastProvider({ children }: { children: ReactNode }) {
  const { data } = usePublishedResource("/public/youtube-live", parseLive);
  const [testId, setTestId] = useState<string>();
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_YOUTUBE_LIVE_TEST !== "1") return;
    const requested = new URLSearchParams(window.location.search).get("teste-live");
    if (requested && validId.test(requested)) setTestId(requested);
  }, []);
  const value = testId ? { test: true, video: { id: testId, title: "Culto da Família · teste de transmissão", embeddable: true } }
    : data?.broadcast ? { test: false, video: data.broadcast } : null;
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function PortalBroadcastHeaderLink({ home }: { home: boolean }) {
  const state = useContext(Context);
  if (!state) return <a className={s.headerLink} data-broadcast-indicator
    href={home ? "#videos" : withBasePath("/#videos")} aria-label="Ao vivo: assistir aos cultos online">
    Ao vivo
  </a>;
  const target = "#culto-ao-vivo";
  const href = home ? target : withBasePath(state.test ? `/?teste-live=${state.video.id}${target}` : `/${target}`);
  return <a className={s.headerLink} href={href} data-broadcast-indicator data-test={state.test || undefined}
    aria-label={state.test ? "Abrir teste de transmissão" : "Ao vivo: assistir ao culto"}>
    <span className={s.light} aria-hidden="true" /> {state.test ? "Teste" : "Ao vivo"}
  </a>;
}

export function PortalBroadcastHeroLink() {
  const state = useContext(Context);
  if (!state) return null;
  return <a className={s.heroLink} href="#culto-ao-vivo">
    <span className={s.light} aria-hidden="true" /> {state.test ? "Assistir ao teste" : "Assistir ao culto ao vivo"}
    <span aria-hidden="true">↓</span>
  </a>;
}

export function PortalBroadcastSection() {
  const state = useContext(Context);
  const [playingId, setPlayingId] = useState<string>();
  const section = useRef<HTMLElement>(null);
  const visible = state !== null;
  useEffect(() => {
    const target = section.current;
    // When coming from another page the section appears after the live status loads.
    if (!target || window.location.hash !== "#culto-ao-vivo") return;
    target.scrollIntoView();
    target.focus({ preventScroll: true });
  }, [visible]);
  if (!state) return null;
  const { video, test } = state;

  return <section ref={section} className={s.section} id="culto-ao-vivo" tabIndex={-1} aria-labelledby="portal-broadcast-title">
    <div className={s.inner}>
      <div className={s.heading}>
        <div>
          <p className={s.status}><span className={s.light} aria-hidden="true" />{test ? "Teste no DEV" : "Ao vivo"}</p>
          <h2 id="portal-broadcast-title">{video.title}</h2>
        </div>
        <a className={s.channel} href={"https://www.youtube.com/watch?v=" + video.id} target="_blank" rel="noopener noreferrer">
          Abrir no YouTube <span aria-hidden="true">↗</span>
        </a>
      </div>
      {video.embeddable && <div className={s.player}>
        {playingId === video.id ? <iframe
          title={video.title}
          src={"https://www.youtube-nocookie.com/embed/" + video.id + "?autoplay=1&playsinline=1"}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          ref={frame => frame?.focus()}
        /> : <button type="button" className={s.play} onClick={() => setPlayingId(video.id)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={"https://i.ytimg.com/vi/" + video.id + "/hqdefault.jpg"} alt="" loading="lazy" />
          <span><i aria-hidden="true" /> {test ? "Reproduzir teste" : "Reproduzir culto ao vivo"}</span>
        </button>}
      </div>}
    </div>
  </section>;
}
