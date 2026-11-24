import { ConflictException } from "@nestjs/common";
import {
  classifyParticipationOverlap,
  participationStillBlocks,
  type HeldParticipation,
} from "./participation-identity";

export type ParticipationKeyStore = {
  findMany(args: {
    where: { eventId: string; identityKey: { in: string[] } };
    select: { registrationId: true; identityKey: true };
  }): Promise<Array<{ registrationId: string; identityKey: string }>>;
  deleteMany?(args: { where: { registrationId: string | { in: string[] } } }): Promise<unknown>;
  createMany?(args: {
    data: Array<{
      organizationId: string;
      churchId: string;
      eventId: string;
      registrationId: string;
      identityKey: string;
    }>;
  }): Promise<unknown>;
};

type RegistrationRow = {
  id: string;
  status: string;
  paymentStatus: string;
  registrantPersonId: string | null;
};

export function participationStore(client: object | null | undefined): ParticipationKeyStore | null {
  if (!client || typeof client !== "object" || !("eventParticipationKey" in client)) return null;
  const store = (client as { eventParticipationKey?: ParticipationKeyStore }).eventParticipationKey;
  return store && typeof store.findMany === "function" ? store : null;
}

export async function loadParticipationConflict(
  client: object,
  eventId: string,
  incoming: string[],
  eventStatus: string,
): Promise<{ kind: "none" | "full" | "partial"; matches: HeldParticipation[]; staleRegistrationIds: string[] }> {
  const empty = { kind: "none" as const, matches: [] as HeldParticipation[], staleRegistrationIds: [] as string[] };
  const store = participationStore(client);
  if (!store || !incoming.length) return empty;
  const links = await store.findMany({
    where: { eventId, identityKey: { in: incoming } },
    select: { registrationId: true, identityKey: true },
  });
  if (!links.length) return empty;
  const reader = (client as {
    eventRegistration?: { findMany(args: unknown): Promise<RegistrationRow[]> };
  }).eventRegistration;
  if (!reader?.findMany) return empty;
  const rows = await reader.findMany({
    where: { id: { in: [...new Set(links.map(link => link.registrationId))] } },
    select: { id: true, status: true, paymentStatus: true, registrantPersonId: true },
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  const stale: string[] = [];
  const grouped = new Map<string, HeldParticipation>();
  for (const link of links) {
    const row = byId.get(link.registrationId);
    if (!row || !participationStillBlocks({
      status: row.status, paymentStatus: row.paymentStatus, eventStatus,
    })) {
      stale.push(link.registrationId);
      continue;
    }
    const held = grouped.get(link.registrationId) ?? {
      registrationId: link.registrationId,
      registrantPersonId: row?.registrantPersonId ?? null,
      status: row?.status ?? "CONFIRMED",
      keys: [],
    };
    held.keys.push(link.identityKey);
    grouped.set(link.registrationId, held);
  }
  const classified = classifyParticipationOverlap(incoming, [...grouped.values()]);
  return { ...classified, staleRegistrationIds: [...new Set(stale)] };
}

export function registrationDuplicateException(input: {
  overlap: "FULL" | "PARTIAL";
  owned: { id: string; status: string } | null;
}) {
  const full = input.overlap === "FULL";
  const message = full
    ? input.owned
      ? "Esta participação já está inscrita neste evento. Abra a inscrição anterior; não há nova cobrança."
      : "Já existe uma inscrição ativa para esta participação. Nada foi cobrado de novo."
    : "Parte dos participantes já está inscrita. Envie só quem ainda não participa; a cobrança anterior permanece.";
  return new ConflictException({
    code: full ? "EVENT_REGISTRATION_DUPLICATE" : "EVENT_REGISTRATION_PARTIAL_OVERLAP",
    message,
    overlap: input.overlap,
    ...(input.owned ? { existing: { id: input.owned.id, status: input.owned.status } } : {}),
  });
}

export function participationConstraint(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("meta" in error)) return false;
  const target = (error as { meta?: { target?: unknown } }).meta?.target;
  const text = Array.isArray(target) ? target.join(" ") : String(target ?? "");
  return text.includes("identity_key") || text.includes("identityKey") || text.includes("event_participation");
}
