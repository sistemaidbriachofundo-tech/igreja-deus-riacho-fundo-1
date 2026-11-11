"use client";

import { usePublishedSiteLayout } from "../lib/use-published-site-layout";
import { resolveSitePhoto } from "../lib/site-layout";
import s from "./portal-faith-gallery.module.css";

export function PortalFaithGallery() {
  const site = usePublishedSiteLayout();
  if (site.hidden.includes("galeria")) return null;
  return (
    <section id="galeria" className={s.gallery} data-appearance={site.appearance} aria-labelledby="faith-gallery-title">
      <div className={s.inner}>
        <div className={s.head} data-portal-reveal>
          <div className={s.heading}>
            <p className={s.eyebrow}>Galeria</p>
            <h2 id="faith-gallery-title">{site.gallery.title}<br/><em>{site.gallery.accent}</em></h2>
            <p>{site.gallery.description}</p>
          </div>
        </div>
        <div className={s.moments}>
          {site.gallery.items.map((moment, index) => (
            <figure className={s.card} key={index} data-crop={moment.imageUrl.startsWith("/images/riacho/") && index > 0}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                className={s.image}
                src={resolveSitePhoto(moment.imageUrl)}
                alt={moment.alt}
                width={850}
                height={1060}
                loading="lazy"
                decoding="async"
              />
              <figcaption className={s.caption}>
                <div><strong>{moment.title}</strong><small>{moment.subtitle}</small></div>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
