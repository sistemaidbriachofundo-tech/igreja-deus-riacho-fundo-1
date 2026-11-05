"use client";

import { useState } from "react";
import Link from "next/link";
import { ministries } from "../lib/portal-content";
import { ministryPhoto } from "../lib/portal-visuals";
import s from "./ministerio-em-foco.module.css";

export function MinisterioEmFoco() {
  const [active, setActive] = useState(0);
  const ministry = ministries[active];
  return (
    <div className={s.experience}>
      <div className={s.photoStage} data-tone={ministry.tone}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img key={ministry.slug} src={ministryPhoto(ministry.slug)} alt="" className={s.photo} loading="lazy" />
        <span className={s.photoFade} aria-hidden="true" />
        <div className={s.photoCaption}><span>0{active + 1} / 05</span><span>IMAGEM ILUSTRATIVA</span></div>
        <div className={s.photoTitle} aria-hidden="true">{ministry.name}</div>
      </div>
      <div className={s.panel}>
        <div className={s.panelTop}>
          <span className={s.eyebrow}>EXPLORE NOSSOS MINISTÉRIOS</span>
          <h3>Uma comunidade.<br/><em>Muitas histórias.</em></h3>
          <p>Escolha uma área e descubra como fazer parte.</p>
        </div>
        <div className={s.tabs} role="tablist" aria-label="Escolha o ministério">
          {ministries.map((item,i) => (
            <button
              key={item.slug}
              type="button"
              role="tab"
              id={`ministry-tab-${i}`}
              aria-selected={active===i}
              aria-controls="ministry-spotlight-panel"
              onClick={() => setActive(i)}
              className={active===i ? s.tabActive : s.tab}
            >
              <span>0{i+1}</span><strong>{item.name}</strong><b aria-hidden="true">↗</b>
            </button>
          ))}
        </div>
        <div role="tabpanel" id="ministry-spotlight-panel" aria-labelledby={`ministry-tab-${active}`} className={s.selection} key={ministry.slug}>
          <p>{ministry.summary}</p>
          <Link className={s.link} href={`/ministerios/${ministry.slug}/`}>Conheça {ministry.name} <span aria-hidden="true">↗</span></Link>
        </div>
      </div>
    </div>
  );
}
