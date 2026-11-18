"use client";

import { usePublishedResource } from "../lib/use-published-resource";
import s from "../app/home-institutional.module.css";

type Group = { id: string; name: string; schedule: string; address: string; contact: string; photo?: string };

function parseGroups(value: unknown): Group[] | null {
  if (!value || typeof value !== "object" || !("groups" in value) || !Array.isArray(value.groups)) return null;
  return value.groups.flatMap((row: Record<string, unknown> | null) => {
    if (!row || typeof row.id !== "string" || typeof row.name !== "string" ||
      typeof row.meetsAtHint !== "string" || typeof row.meetingAddress !== "string" ||
      typeof row.contactWhatsApp !== "string" || !/^\d{10,15}$/.test(row.contactWhatsApp)) return [];
    return [{
      id: row.id, name: row.name, schedule: row.meetsAtHint, address: row.meetingAddress,
      contact: row.contactWhatsApp,
      photo: typeof row.photoUrl === "string" && /^https:\/\//i.test(row.photoUrl) ? row.photoUrl : undefined,
    }];
  });
}

export function PublishedFriendshipGroups() {
  const { data } = usePublishedResource("/public/groups", parseGroups);
  if (!data?.length) return null;
  return <section className={s.friendship} aria-labelledby="friendship-groups">
    <div className={s.purposesWrap}>
      <h2 id="friendship-groups">Grupos de Amizade</h2>
      <ul>
        {data.map(group => <li key={group.id}>
          {group.photo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.photo} alt="" loading="lazy" />
          )}
          <h3>{group.name}</h3>
          <p>{group.schedule}</p>
          <p>{group.address}</p>
          <a href={"https://wa.me/" + group.contact} target="_blank" rel="noopener noreferrer">Falar com a liderança pelo WhatsApp</a>
        </li>)}
      </ul>
    </div>
  </section>;
}
