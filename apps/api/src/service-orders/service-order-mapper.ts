import type { ServiceOrderDto } from "@idbrf/shared";

export type ServiceOrderRow = {
  id: string;
  title: string;
  serviceAt: Date;
  notes: string | null;
  status: "DRAFT" | "APPROVED" | "PUBLISHED";
  updatedAt: Date;
  revision?: number;
  kind?: string | null;
  items: Array<{
    id: string;
    position: number;
    title: string;
    minutes: number | null;
    responsible: string | null;
    roleKey?: string | null;
    responsiblePersonId?: string | null;
    equipment?: string | null;
    itemNotes?: string | null;
    alert?: string | null;
  }>;
};

export function mapServiceOrder(row: ServiceOrderRow): ServiceOrderDto {
  let cursor = row.serviceAt.getTime();
  const items = [...row.items].sort((left, right) => left.position - right.position).map((item) => {
    const startsAt = new Date(cursor).toISOString();
    if (item.minutes) cursor += item.minutes * 60_000;
    return {
      id: item.id,
      position: item.position,
      title: item.title,
      minutes: item.minutes,
      responsible: item.responsible,
      roleKey: item.roleKey ?? null,
      responsiblePersonId: item.responsiblePersonId ?? null,
      equipment: item.equipment ?? null,
      notes: item.itemNotes ?? null,
      alert: item.alert ?? null,
      startsAt,
    };
  });
  return {
    id: row.id,
    title: row.title,
    serviceAt: row.serviceAt.toISOString(),
    notes: row.notes,
    items,
    status: row.status,
    updatedAt: row.updatedAt.toISOString(),
    revision: row.revision ?? 1,
    kind: row.kind === "SPECIAL" ? "SPECIAL" : "REGULAR",
    readPath: `/app/pastoral/ordem-de-culto/?ordem=${encodeURIComponent(row.id)}`,
  };
}
