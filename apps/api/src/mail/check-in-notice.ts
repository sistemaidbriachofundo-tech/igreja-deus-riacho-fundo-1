import QRCode from "qrcode";
import type { MailService } from "./mail.service";

export async function queueEventCheckInNotice(
  mail: MailService | undefined,
  input: {
    registrationId: string;
    to: string | null | undefined;
    eventName: string;
    checkInCode: string;
  },
) {
  if (!mail || !input.to) return { queued: false as const };
  const svg = await QRCode.toString(input.checkInCode, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    width: 180,
  });
  if (!svg.includes("<svg") || /<script|onload=|javascript:/i.test(svg)) {
    return { queued: false as const };
  }
  const receipt = await mail.deliverOnce(
    {
      idempotencyKey: `event-checkin:${input.registrationId}`,
      to: input.to,
      subject: "Inscricao confirmada",
      text: [
        `Sua inscricao em ${input.eventName} esta confirmada.`,
        "Apresente este codigo no check-in do evento. Ele vale só para essa inscricao.",
        input.checkInCode,
      ].join("\n"),
      html: `<p>Sua inscrição está confirmada.</p><p>Apresente este QR no check-in do evento.</p>${svg}<p>${input.checkInCode}</p>`,
    },
    { required: false },
  );
  return { queued: true as const, receipt };
}
