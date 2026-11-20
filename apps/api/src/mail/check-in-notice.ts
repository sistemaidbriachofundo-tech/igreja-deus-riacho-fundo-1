import QRCode from "qrcode";
import type { MailService } from "./mail.service";

export async function queueEventCheckInNotice(
  mail: MailService | undefined,
  input: {
    registrationId: string;
    to: string | null | undefined;
    eventName: string;
    checkInCode: string;
    tickets?: { position: number; code: string }[];
  },
) {
  if (!mail || !input.to) return { queued: false as const };
  const codes = input.tickets?.length ? input.tickets : [{ position: 1, code: input.checkInCode }];
  const attachments = await Promise.all(codes.map(async ticket => ({
    filename: codes.length === 1 ? "check-in.png" : `check-in-${ticket.position}.png`,
    cid: codes.length === 1 ? "check-in-qr" : `check-in-qr-${ticket.position}`,
    content: await QRCode.toBuffer(ticket.code, { margin: 4, errorCorrectionLevel: "M", width: 240 }),
  })));
  const receipt = await mail.deliverOnce(
    {
      idempotencyKey: `event-checkin:${input.registrationId}`,
      to: input.to,
      subject: "Inscrição confirmada",
      text: [
        `Sua inscrição em ${input.eventName} está confirmada.`,
        "Apresente cada ingresso individual no check-in do evento.",
        ...codes.map(ticket => `Ingresso ${ticket.position}: ${ticket.code}`),
      ].join("\n"),
      html: "<p>Sua inscrição está confirmada.</p>" + codes.map((ticket, index) =>
        `<p>Ingresso ${ticket.position}</p><img src="cid:${attachments[index].cid}" width="240" height="240" alt="QR do check-in" /><p>${ticket.code}</p>`,
      ).join(""),
      attachments,
    },
    { required: false },
  );
  return { queued: true as const, receipt };
}

export async function queueParticipantTicketNotices(
  mail: MailService | undefined,
  input: { eventName: string; tickets: Array<{ id: string; position: number; code: string; email: string }> },
) {
  if (!mail) return { queued: false as const, count: 0 };
  let count = 0;
  for (const ticket of input.tickets) {
    const content = await QRCode.toBuffer(ticket.code, { margin: 4, errorCorrectionLevel: "M", width: 240 });
    await mail.deliverOnce({
      idempotencyKey: `event-ticket:${ticket.id}`,
      to: ticket.email,
      subject: "Seu ingresso",
      text: `Seu ingresso para ${input.eventName} está confirmado.\nApresente este QR no dia do evento.\nIngresso ${ticket.position}: ${ticket.code}`,
      html: `<p>Seu ingresso para ${input.eventName} está confirmado.</p><img src="cid:ingresso-${ticket.position}" width="240" height="240" alt="QR do ingresso" /><p>${ticket.code}</p>`,
      attachments: [{ filename: `ingresso-${ticket.position}.png`, cid: `ingresso-${ticket.position}`, content }],
    }, { required: false });
    count += 1;
  }
  return { queued: true as const, count };
}
