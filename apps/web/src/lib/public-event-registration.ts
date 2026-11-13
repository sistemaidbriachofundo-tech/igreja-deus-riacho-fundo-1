import { apiGetPublic, apiPostPublic } from "./api";
import { parsePublishedEvent } from "./portal-live-data";

type Choice = { id: string; name: string; remaining: number | null };
type Modality = Choice & { minPartySize: number; maxPartySize: number };
type Lot = Choice & { modalityId: string | null; priceCents: number; paymentMode: string };

type Catalog = {
  event: NonNullable<ReturnType<typeof parsePublishedEvent>>;
  modalities: Modality[];
  lots: Lot[];
  lodgingOptions: Choice[];
  mealOptions: Choice[];
  transportOptions: Choice[];
};

export type RegistrationReceipt = {
  status: string;
  id: string;
  checkInCode: string;
  guardianAuthStatus?: string;
  paymentIntent: null | { mode: string; amountCents: number; pixCopiaECola?: string; pixTxid?: string };
};

export const validEventSlug = (slug: string) => /^[a-z0-9][a-z0-9-]{1,79}$/.test(slug);
export const validRegistrationCode = (code: string) => /^[a-f0-9]{32}$/i.test(code);

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
      if (row.priceCents > 0 && row.paymentMode !== "CHURCH_PIX") return [];
      return [{ ...choice, modalityId: typeof row.modalityId === "string" ? row.modalityId : null,
        priceCents: row.priceCents, paymentMode: row.priceCents > 0 ? "CHURCH_PIX" : "FREE" }];
    }),
    lodgingOptions: choices("lodgingOptions"), mealOptions: choices("mealOptions"), transportOptions: choices("transportOptions"),
  };
}

export function availableEventLots(lots: Lot[], modalityId: string, partySize: number) {
  return lots.filter(lot => (!lot.modalityId || lot.modalityId === modalityId) &&
    (lot.remaining === null || lot.remaining >= partySize));
}

export async function loadEventRegistration(slug: string) {
  if (!validEventSlug(slug)) return null;
  return parseRegistrationCatalog(await apiGetPublic<unknown>("/public/events/" + slug));
}

export async function registerForEvent(slug: string, fields: {
  displayName: string; notificationEmail: string; modalityId: string; lotId: string; partySize: number;
  isMinor: boolean; guardianDisplayName?: string; guardianAcknowledged?: boolean;
  lodgingOptionId?: string; mealOptionId?: string; transportOptionId?: string;
}) {
  if (!validEventSlug(slug)) throw new Error("Evento inválido.");
  const result = await apiPostPublic<RegistrationReceipt>("/public/events/" + slug + "/registrations", fields);
  if (!result || typeof result.id !== "string" || !validRegistrationCode(result.checkInCode)) throw new Error("Resposta de inscrição inválida.");
  return result;
}

export function loadRegistrationStatus(code: string) {
  if (!validRegistrationCode(code)) throw new Error("Código de inscrição inválido.");
  return apiGetPublic<{ status: string; guardianAuthStatus?: string }>("/public/registrations/" + code);
}
