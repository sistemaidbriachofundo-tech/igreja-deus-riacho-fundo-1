import { ServiceUnavailableException } from "@nestjs/common";
import {
  MailService,
  SmtpMailTransport,
  TestMailTransport,
  createMailTransport,
} from "./mail.service";
import { readPublicSmtpConfig } from "./smtp-config";
import { queueEventCheckInNotice } from "./check-in-notice";

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(() => ({
    sendMail: jest.fn().mockResolvedValue({ messageId: "smtp-1" }),
  })),
}));

describe("e-mail do piloto", () => {
  it("não devolve a senha SMTP e recusa configuração incompleta", () => {
    expect(() => readPublicSmtpConfig({ SMTP_HOST: "smtp.hostinger.com", SMTP_PASSWORD: "segredo-da-igreja" }))
      .toThrow(ServiceUnavailableException);
    expect(() => readPublicSmtpConfig({
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_PORT: "587",
      SMTP_USER: "igreja",
      SMTP_FROM: "nao-responda@example.test",
      SMTP_PASSWORD: "   ",
    })).toThrow(/SMTP_PASSWORD/);
    try {
      readPublicSmtpConfig({
        SMTP_HOST: "smtp.hostinger.com",
        SMTP_PORT: "587",
        SMTP_USER: "igreja",
        SMTP_FROM: "nao-responda@example.test",
        SMTP_PASSWORD: "segredo-da-igreja",
      });
    } catch (error) {
      expect(String(error)).not.toContain("segredo-da-igreja");
    }
    const config = readPublicSmtpConfig({
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_PORT: "587",
      SMTP_USER: "igreja",
      SMTP_FROM: "nao-responda@example.test",
      SMTP_PASSWORD: "segredo-da-igreja",
    });
    expect(config).toEqual({
      host: "smtp.hostinger.com",
      port: 587,
      user: "igreja",
      from: "nao-responda@example.test",
    });
    expect(JSON.stringify(config)).not.toContain("segredo");
  });

  it("não envia pelo transporte de teste em produção", async () => {
    const previous = process.env.IDBRF_RUNTIME_STAGE;
    process.env.IDBRF_RUNTIME_STAGE = "production";
    try {
      await expect(new TestMailTransport().send({
        idempotencyKey: "k",
        to: "pessoa@example.test",
        subject: "teste",
        text: "nao",
      })).rejects.toThrow(/produção/);
    } finally {
      if (previous === undefined) delete process.env.IDBRF_RUNTIME_STAGE;
      else process.env.IDBRF_RUNTIME_STAGE = previous;
    }
  });

  it("não abre SMTP enquanto o envio live está desligado", async () => {
    const transport = new SmtpMailTransport({
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_PORT: "587",
      SMTP_USER: "igreja",
      SMTP_FROM: "nao-responda@example.test",
      SMTP_PASSWORD: "segredo-da-igreja",
    });
    await expect(transport.send({
      idempotencyKey: "k1",
      to: "pessoa@example.test",
      subject: "teste",
      text: "sem rede",
    })).rejects.toThrow(/desligado/);
  });

  it("reenvia de forma idempotente no transporte de teste e não grava o corpo", async () => {
    const transport = new TestMailTransport();
    const rows = new Map<string, { status: string; providerMessageId: string | null; toAddress: string; subject: string }>();
    const db = {
      mailDelivery: {
        findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) => rows.get(where.idempotencyKey) ?? null),
        upsert: jest.fn(async ({ where, create }: { where: { idempotencyKey: string }; create: { toAddress: string; subject: string } }) => {
          rows.set(where.idempotencyKey, { status: "PENDING", providerMessageId: null, ...create });
        }),
        update: jest.fn(async ({ where, data }: { where: { idempotencyKey: string }; data: { status: string; providerMessageId?: string } }) => {
          const row = rows.get(where.idempotencyKey);
          if (row) Object.assign(row, data);
        }),
      },
    };
    const mail = new MailService(db as never, transport);
    const message = {
      idempotencyKey: "access-invite:1",
      to: "pessoa@example.test",
      subject: "Ative seu acesso",
      text: "link com token secreto",
    };
    const first = await mail.deliverOnce(message);
    const second = await mail.deliverOnce(message);
    expect(first.status).toBe("SENT");
    expect(second.idempotentReplay).toBe(true);
    expect(transport.sent).toHaveLength(1);
    expect(JSON.stringify([...rows.values()])).not.toContain("token secreto");
  });

  it("recusa destino fora de example.test, envio pendente e falha com segredo", async () => {
    await expect(new TestMailTransport().send({
      idempotencyKey: "k", to: "pessoa@igreja.org", subject: "x", text: "y",
    })).rejects.toThrow(/fictícias/);
    expect(createMailTransport({ EMAIL_TRANSPORT: "smtp" })).toBeInstanceOf(SmtpMailTransport);
    expect(createMailTransport({}).name).toBe("test");

    const rows = new Map<string, { status: string; lastError?: string | null; providerMessageId: string | null }>();
    const db = {
      mailDelivery: {
        findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) => rows.get(where.idempotencyKey) ?? null),
        upsert: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) => {
          rows.set(where.idempotencyKey, { status: "PENDING", providerMessageId: null });
        }),
        update: jest.fn(async ({ where, data }: { where: { idempotencyKey: string }; data: { status: string; lastError?: string } }) => {
          Object.assign(rows.get(where.idempotencyKey) ?? {}, data);
        }),
      },
    };
    const failing = { name: "test" as const, send: jest.fn().mockRejectedValue(new Error("token=segredo")) };
    const mail = new MailService(db as never, failing);
    rows.set("busy", { status: "PENDING", providerMessageId: null });
    await expect(mail.deliverOnce({
      idempotencyKey: "busy", to: "pessoa@example.test", subject: "a", text: "b",
    })).rejects.toThrow(/andamento/);
    await expect(mail.deliverOnce({
      idempotencyKey: "busy", to: "pessoa@example.test", subject: "a", text: "b",
    }, { required: false })).resolves.toMatchObject({ status: "FAILED" });
    const failed = await mail.deliverOnce({
      idempotencyKey: "nova", to: "pessoa@example.test", subject: "a".repeat(200), text: "b",
    }, { required: false });
    expect(failed.status).toBe("FAILED");
    expect(rows.get("nova")?.lastError).toBe("falha de envio");
    failing.send.mockRejectedValueOnce("quebra");
    await expect(mail.deliverOnce({
      idempotencyKey: "outra", to: "pessoa@example.test", subject: "a", text: "b",
    })).rejects.toBe("quebra");
  });

  it("envia por SMTP só quando o ambiente autorizado liga o envio", async () => {
    const env = {
      EMAIL_TRANSPORT: "smtp",
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_PORT: "465",
      SMTP_USER: "igreja",
      SMTP_FROM: "nao-responda@example.test",
      SMTP_PASSWORD: "segredo-da-igreja",
      SMTP_SEND_ENABLED: "1",
    };
    const transport = new SmtpMailTransport(env);
    await expect(transport.send({
      idempotencyKey: "convite",
      to: "pessoa@example.test",
      subject: "Ative",
      text: "link",
    })).resolves.toEqual({ providerMessageId: "smtp-1" });
    const nodemailer = await import("nodemailer");
    (nodemailer.createTransport as jest.Mock).mockReturnValueOnce({
      sendMail: jest.fn().mockResolvedValue({}),
    });
    await expect(transport.send({
      idempotencyKey: "sem-id", to: "pessoa@example.test", subject: "Ative", text: "link",
    })).resolves.toEqual({ providerMessageId: "smtp:sem-id" });
  });

  it("não enfileira aviso sem destino e monta o QR quando há e-mail de teste", async () => {
    expect(await queueEventCheckInNotice(undefined, {
      registrationId: "r", to: null, eventName: "Encontro", checkInCode: "abc",
    })).toEqual({ queued: false });
    const mail = { deliverOnce: jest.fn().mockResolvedValue({ status: "SENT" }) };
    const queued = await queueEventCheckInNotice(mail as never, {
      registrationId: "r1", to: "pessoa@example.test", eventName: "Encontro", checkInCode: "abc123def456",
    });
    expect(queued.queued).toBe(true);
    expect(mail.deliverOnce.mock.calls[0][0].html).toContain("<svg");
    expect(mail.deliverOnce.mock.calls[0][0].idempotencyKey).toBe("event-checkin:r1");
  });
});
