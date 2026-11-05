"use client";

import { useMemo, useState } from "react";
import type { PortalEvent } from "../lib/portal-content";
import { EventCard, portalStyles as s } from "./PublicPortal";

const filters = [
  { slug: "todos", title: "Todos" },
  { slug: "jovens", title: "Jovens" },
  { slug: "homens", title: "Homens" },
  { slug: "adolescentes", title: "Adolescentes" },
  { slug: "mulheres", title: "Mulheres" },
  { slug: "atmosfera", title: "Atmosfera" },
] as const;

type FilterKey = (typeof filters)[number]["slug"];

export function EventFilter({ events }: { events: PortalEvent[] }) {
  const [filter, setFilter] = useState<FilterKey>("todos");
  const visible = useMemo(
    () => filter === "todos" ? events : events.filter((event) => event.ministry === filter),
    [events, filter],
  );

  return (
    <div>
      <div className={s.filterBar} role="group" aria-label="Filtrar eventos por ministério">
        {filters.map(({ slug, title }) => (
          <button
            key={slug}
            type="button"
            aria-pressed={filter === slug}
            className={filter === slug ? s.filterActive : s.filterPill}
            onClick={() => setFilter(slug)}
          >
            {title}
          </button>
        ))}
      </div>
      <p className={s.filterResult} aria-live="polite">
        {visible.length === 1 ? "1 encontro demonstrativo" : `${visible.length} encontros demonstrativos`}
      </p>
      <div className={s.eventList}>
        {visible.map((event) => <EventCard key={event.id} event={event} />)}
      </div>
    </div>
  );
}
