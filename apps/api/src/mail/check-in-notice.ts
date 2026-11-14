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
  const qr = await QRCode.toBuffer(input.checkInCode, {
    margin: 4,
    errorCorrectionLevel: "M",
    width: 240,
  });
  const receipt = await mail.deliverOnce(
    {
      idempotencyKey: `event-checkin:${input.registrationId}`,
      to: input.to,
      subject: "Inscrição confirmada",
      text: [
        `Sua inscrição em ${input.eventName} está confirmada.`,
        "Apresente este código no check-in do evento. Ele vale só para essa inscrição.",
        input.checkInCode,
      ].join("\n"),
      html: `<p>Sua inscrição está confirmada.</p><p>Apresente este QR no check-in do evento.</p><img src="cid:check-in-qr" width="240" height="240" alt="QR do check-in" /><p>${input.checkInCode}</p>`,
      attachments: [{ filename: "check-in.png", content: qr, cid: "check-in-qr" }],
    },
    { required: false },
  );
  return { queued: true as const, receipt };
}
