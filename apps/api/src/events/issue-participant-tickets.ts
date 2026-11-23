import { randomBytes } from "node:crypto";
import { queueEventCheckInNotice, queueParticipantTicketNotices } from "../mail/check-in-notice";
import type { MailService } from "../mail/mail.service";

type TicketRow = {
  id: string;
  position: number;
  code: string;
  participantEmail: string | null;
};

type RegistrationRow = {
  id: string;
  status: string;
  paymentStatus: string;
  isMinor: boolean;
  guardianAuthStatus: string;
  partySize: number;
  displayName: string;
  notificationEmail: string | null;
  checkInCode: string;
  participantRoster: unknown;
  event: { name: string; ticketPolicy: string | null } | null;
  tickets: TicketRow[];
};

type TicketStore = {
  eventRegistration: {
    findUnique(args: { where: { id: string }; include?: unknown }): Promise<RegistrationRow | null>;
  };
  eventParticipantTicket: {
    createMany(args: { data: Array<Record<string, unknown>>; skipDuplicates?: boolean }): Promise<{ count: number }>;
    findMany(args: { where: { registrationId: string }; orderBy?: { position: "asc" }; select?: unknown }): Promise<TicketRow[]>;
  };
};

export type IssuedTickets = {
  issued: number;
  emailed: number;
  held: "guardian" | "unpaid" | null;
};

const CONFIRMED = new Set(["CONFIRMED", "CHECKED_IN"]);
const PAID = new Set(["CONFIRMED_MOCK", "CONFIRMED_PIX", "CONFIRMED_GATEWAY"]);

/**
 * Emite um QR por participante somente depois do pagamento confirmado
 * e, para menor, da autorização do responsável. Reenvio usa a mesma chave.
 */
export async function issueConfirmedParticipantTickets(
  prisma: TicketStore,
  mail: MailService | undefined,
  registrationId: string,
): Promise<IssuedTickets> {
  const registration = await prisma.eventRegistration.findUnique({
    where: { id: registrationId },
    include: {
      event: { select: { name: true, ticketPolicy: true } },
      tickets: {
        orderBy: { position: "asc" },
        select: { id: true, position: true, code: true, participantEmail: true },
      },
    },
  });
  if (!registration) return { issued: 0, emailed: 0, held: null };
  if (!CONFIRMED.has(registration.status) || !PAID.has(registration.paymentStatus)) {
    return { issued: 0, emailed: 0, held: "unpaid" };
  }
  if (registration.isMinor && registration.guardianAuthStatus !== "AUTHORIZED" && registration.guardianAuthStatus !== "NOT_REQUIRED") {
    return { issued: 0, emailed: 0, held: "guardian" };
  }

  const eventName = registration.event?.name || "evento";
  const participantMode = registration.event?.ticketPolicy === "PARTICIPANT";
  let tickets = registration.tickets;
  if (tickets.length === 0 && (participantMode || registration.partySize > 1)) {
    const people = roster(registration);
    await prisma.eventParticipantTicket.createMany({
      data: people.map((person, index) => ({
        registrationId: registration.id,
        position: index + 1,
        code: randomBytes(16).toString("hex"),
        participantName: person.name,
        participantEmail: participantMode ? person.email : null,
      })),
      skipDuplicates: true,
    });
    tickets = await prisma.eventParticipantTicket.findMany({
      where: { registrationId: registration.id },
      orderBy: { position: "asc" },
      select: { id: true, position: true, code: true, participantEmail: true },
    });
  }

  if (participantMode) {
    const addressed = tickets.flatMap(ticket => {
      const email = deliverable(ticket.participantEmail);
      return email ? [{ id: ticket.id, position: ticket.position, code: ticket.code, email }] : [];
    });
    if (addressed.length === 0) return { issued: tickets.length, emailed: 0, held: null };
    const queued = await queueParticipantTicketNotices(mail, { eventName, tickets: addressed });
    return { issued: tickets.length, emailed: queued.queued ? queued.count : 0, held: null };
  }

  const notice = await queueEventCheckInNotice(mail, {
    registrationId: registration.id,
    to: deliverable(registration.notificationEmail),
    eventName,
    checkInCode: registration.checkInCode,
    tickets: tickets.map(ticket => ({ position: ticket.position, code: ticket.code })),
  });
  return { issued: tickets.length, emailed: notice.queued ? 1 : 0, held: null };
}

function roster(registration: RegistrationRow): Array<{ name: string; email: string | null }> {
  const parsed = Array.isArray(registration.participantRoster)
    ? registration.participantRoster.flatMap(item => {
      if (!item || typeof item !== "object") return [];
      const name = "name" in item && typeof item.name === "string" ? item.name.trim() : "";
      const email = "email" in item && typeof item.email === "string" ? item.email.trim().toLowerCase() : null;
      return name.length >= 2 ? [{ name, email }] : [];
    })
    : [];
  if (parsed.length > 0) return parsed;
  const size = Number.isInteger(registration.partySize) && registration.partySize > 0 ? registration.partySize : 1;
  return Array.from({ length: size }, (_, index) => ({
    name: index === 0 ? registration.displayName : `${registration.displayName} ${index + 1}`,
    email: index === 0 ? registration.notificationEmail : null,
  }));
}

function deliverable(email: string | null): string | null {
  if (!email) return null;
  const normalized = email.trim().toLowerCase();
  if (process.env.EMAIL_TRANSPORT === "smtp") return normalized;
  return normalized.endsWith("@example.test") ? normalized : null;
}
