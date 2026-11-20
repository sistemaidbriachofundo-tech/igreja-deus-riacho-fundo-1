import { apiGet, apiGetPublic, apiPost } from "./api";
import { parsePublishedEvent } from "./portal-live-data";

type Choice = { id: string; name: string; remaining: number | null };
type Modality = Choice & { minPartySize: number; maxPartySize: number };
type Lot = Choice & { modalityId: string | null; priceCents: number; paymentMode: "FREE" | "CHURCH_PIX" | "MERCADO_PAGO" };

type Catalog = {
  event: NonNullable<ReturnType<typeof parsePublishedEvent>>;
  modalities: Modality[];
  lots: Lot[];
  lodgingOptions: Choice[];
  mealOptions: Choice[];
  transportOptions: Choice[];
  participantTickets: boolean;
};

type RegistrationStatus = {
  status: string;
  guardianAuthStatus?: string;
  tickets?: { position: number; code: string; checkedInAt?: string | null }[];
};

export type RegistrationReceipt = RegistrationStatus & {
  id: string;
  checkInCode?: string | null;
  paymentIntent: null | { mode: string; amountCents: number; pixCopiaECola?: string; pixTxid?: string; checkoutUrl?: string };
};

export type MemberEventProfile = { name: string; email: string; isMinor: boolean };
export type MemberRegistrationSummary = {
  id: string; status: string; paymentStatus: string; guardianAuthStatus: string; partySize: number;
  event: { name: string; slug: string; startsAt: string; status: string };
};

export function eventAuthHref(path: "/login/" | "/cadastro/" | "/recuperar-senha/", slug?: string | null) {
  return path + eventQuery(slug);
}

export function memberEventsHref(slug?: string | null): `/app/eventos/${string}` {
  return `/app/eventos/${eventQuery(slug)}`;
}

export function eventRegistrationHref(slug: string): `/eventos/inscricao/${string}` {
  return `/eventos/inscricao/${eventQuery(slug)}`;
}

function eventQuery(slug?: string | null) {
  return slug && validEventSlug(slug) ? "?" + new URLSearchParams({ evento: slug }) : "";
}

export function loadMemberRegistrations(token: string) {
  return apiGet<{ profile: MemberEventProfile; registrations: MemberRegistrationSummary[] }>("/member-events/registrations", token);
}

export function loadMemberReceipt(token: string, id: string) {
  return apiGet<RegistrationReceipt & { eventName: string }>("/member-events/registrations/" + encodeURIComponent(id), token);
}

export function cancelMemberRegistration(token: string, id: string) {
  return apiPost<{ id: string; status: "CANCELLED" }>(
    "/member-events/registrations/" + encodeURIComponent(id) + "/cancel", token, {},
  );
}

export const validEventSlug = (slug: string) => /^[a-z0-9][a-z0-9-]{1,79}$/.test(slug);
export const validRegistrationCode = (code: unknown): code is string => typeof code === "string" && /^[a-f0-9]{32}$/i.test(code);

function rows(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(row => row && typeof row === "object") : [];
}

function readChoice(row: Record<string, unknown>): Choice | null {
  if (typeof row.id !== "string" || typeof row.name !== "string") return null;
  return { id: row.id, name: row.name, remaining: typeof row.remaining === "number" ? row.remaining : null };
}

export function parseRegistrationCatalog(value: unknown): Catalog | null {
  const event = parsePublishedEvent(value);
  if (!event || !validEventSlug(event.slug)) return null;
  const raw = value as Record<string, unknown>;
  const choices = (key: string) => rows(raw[key]).flatMap(row => readChoice(row) ?? []);
  return {
    event,
    participantTickets: raw.participantTickets === true,
    modalities: rows(raw.modalities).flatMap(row => {
      const choice = readChoice(row);
      const min = row.minPartySize;
      const max = row.maxPartySize;
      if (!choice || typeof min !== "number" || typeof max !== "number" ||
          !Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min || max > 20) return [];
      return [{ ...choice, minPartySize: min, maxPartySize: max }];
    }),
    lots: rows(raw.lots).flatMap(row => {
      const choice = readChoice(row);
      if (!choice || typeof row.priceCents !== "number" || !Number.isSafeInteger(row.priceCents) || row.priceCents < 0) return [];
      const mode = row.paymentMode;
      if (row.priceCents > 0 && mode !== "CHURCH_PIX" && mode !== "MERCADO_PAGO") return [];
      return [{ ...choice, modalityId: typeof row.modalityId === "string" ? row.modalityId : null,
        priceCents: row.priceCents, paymentMode: row.priceCents === 0 ? "FREE" : mode === "MERCADO_PAGO" ? mode : "CHURCH_PIX" }];
    }),
    lodgingOptions: choices("lodgingOptions"), mealOptions: choices("mealOptions"), transportOptions: choices("transportOptions"),
  };
}

export function availableEventLots(lots: Lot[], modalityId: string, partySize: number) {
  return lots.filter(lot => (!lot.modalityId || lot.modalityId === modalityId) &&
    (lot.remaining === null || lot.remaining >= partySize));
}

export function eventRegistrationChoices(catalog: Catalog) {
  if (catalog.event.registrationOpen === false) return [];
  const hasRoom = (choice: Choice, count: number) => choice.remaining === null || choice.remaining >= count;
  return catalog.modalities.filter(modality => {
    const size = modality.minPartySize;
    return hasRoom(modality, size)
      && availableEventLots(catalog.lots, modality.id, size).length > 0
      && [catalog.lodgingOptions, catalog.mealOptions, catalog.transportOptions].every(list =>
        !list.length || list.some(choice => hasRoom(choice, size)));
  });
}

export async function loadEventRegistration(slug: string) {
  if (!validEventSlug(slug)) return null;
  return parseRegistrationCatalog(await apiGetPublic<unknown>("/public/events/" + slug));
}

export type EventRegistrationFields = {
  displayName: string; notificationEmail: string; modalityId: string; lotId: string; partySize: number;
  isMinor: boolean; guardianDisplayName?: string; guardianAcknowledged?: boolean;
  lodgingOptionId?: string; mealOptionId?: string; transportOptionId?: string;
  participantEmails?: string[];
};

export async function registerForEvent(slug: string, fields: EventRegistrationFields, memberToken: string) {
  if (!validEventSlug(slug)) throw new Error("Evento inválido.");
  if (!memberToken.trim()) throw new Error("Entre na sua conta para se inscrever.");
  const result = await apiPost<RegistrationReceipt>("/member-events/" + slug + "/registrations", memberToken, fields);
  const hasTicketCode = result && validRegistrationCode(result.checkInCode);
  const awaitingTicket = result?.status === "PENDING_PAYMENT" || result?.guardianAuthStatus === "PENDING";
  if (!result || typeof result.id !== "string" || (!hasTicketCode && !awaitingTicket && !result.tickets?.length)) {
    throw new Error("Resposta de inscrição inválida.");
  }
  return result;
}


export function mercadoPagoCheckoutLink(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    if (host !== "mercadopago.com.br" && !host.endsWith(".mercadopago.com.br")) return null;
    return url.href;
  } catch {
    return null;
  }
}
