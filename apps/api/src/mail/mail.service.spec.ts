import { ServiceUnavailableException } from "@nestjs/common";
import {
  MailService,
  SmtpMailTransport,
  TestMailTransport,
  createMailTransport,
} from "./mail.service";
import { assertLiveSmtpRecipient, readPublicSmtpConfig } from "./smtp-config";
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
        create: jest.fn(async ({ data }: { data: { idempotencyKey: string; toAddress: string; subject: string } }) => {
          if (rows.has(data.idempotencyKey)) throw Object.assign(new Error("duplicate"), { code: "P2002" });
          rows.set(data.idempotencyKey, { status: "PENDING", providerMessageId: null, ...data });
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
    const [first, concurrent] = await Promise.all([
      mail.deliverOnce(message),
      mail.deliverOnce(message, { required: false }),
    ]);
    expect(concurrent.status).toBe("FAILED");
    const second = await mail.deliverOnce(message);
    expect(first.status).toBe("SENT");
    expect(second.idempotentReplay).toBe(true);
    expect(transport.sent).toHaveLength(1);
    expect(JSON.stringify([...rows.values()])).not.toContain("token secreto");
  });

  it("recusa destino fora de example.test e não grava segredo na falha", async () => {
    await expect(new TestMailTransport().send({
      idempotencyKey: "k", to: "pessoa@igreja.org", subject: "x", text: "y",
    })).rejects.toThrow(/fictícias/);
    expect(createMailTransport({ EMAIL_TRANSPORT: "smtp" })).toBeInstanceOf(SmtpMailTransport);
    expect(createMailTransport({}).name).toBe("test");

    const rows = new Map<string, { status: string; lastError?: string | null; providerMessageId: string | null }>();
    const db = {
      mailDelivery: {
        findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) => rows.get(where.idempotencyKey) ?? null),
        create: jest.fn(async ({ data }: { data: { idempotencyKey: string } }) => {
          rows.set(data.idempotencyKey, { status: "PENDING", providerMessageId: null });
        }),
        update: jest.fn(async ({ where, data }: { where: { idempotencyKey: string }; data: { status: string; lastError?: string } }) => {
          Object.assign(rows.get(where.idempotencyKey) ?? {}, data);
        }),
        updateMany: jest.fn(async () => ({ count: 1 })),
      },
    };
    const failing = { name: "test" as const, send: jest.fn().mockRejectedValue(new Error("token=segredo")) };
    const mail = new MailService(db as never, failing);
    rows.set("busy", { status: "PENDING", providerMessageId: null });
    await expect(mail.deliverOnce({
      idempotencyKey: "busy", to: "pessoa@example.test", subject: "a", text: "b",
    })).rejects.toThrow(/andamento/);
    const failed = await mail.deliverOnce({
      idempotencyKey: "nova", to: "pessoa@example.test", subject: "a".repeat(200), text: "b",
    }, { required: false });
    expect(failed.status).toBe("FAILED");
    expect(rows.get("nova")?.lastError).toBe("falha de envio");
  });

  it("envia por SMTP só no DEV e só para a caixa de teste", async () => {
    const env = {
      EMAIL_TRANSPORT: "smtp",
      IDBRF_RUNTIME_STAGE: "qa",
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_PORT: "465",
      SMTP_USER: "igreja",
      SMTP_FROM: "nao-responda@example.test",
      SMTP_PASSWORD: "segredo-da-igreja",
      SMTP_SEND_ENABLED: "1",
      SMTP_ALLOWED_RECIPIENTS: " Caixa.Teste@example.test ",
    };
    const transport = new SmtpMailTransport(env);
    const nodemailer = await import("nodemailer");
    const sendMail = jest.fn().mockResolvedValue({ messageId: "smtp-1" });
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    await expect(transport.send({
      idempotencyKey: "convite",
      to: "caixa.teste@example.test",
      subject: "Ative",
      text: "link",
    })).resolves.toEqual({ providerMessageId: "smtp-1" });
    expect(sendMail).toHaveBeenCalledTimes(1);
    sendMail.mockResolvedValueOnce({});
    await expect(transport.send({
      idempotencyKey: "sem-id", to: "caixa.teste@example.test", subject: "Ative", text: "link",
    })).resolves.toEqual({ providerMessageId: "smtp:sem-id" });

    (nodemailer.createTransport as jest.Mock).mockClear();
    await expect(transport.send({
      idempotencyKey: "fora", to: "pessoa@example.test", subject: "Ative", text: "link",
    })).rejects.toThrow(/caixa de teste/);
    await expect(new SmtpMailTransport({ ...env, IDBRF_RUNTIME_STAGE: "hml" }).send({
      idempotencyKey: "hml", to: "caixa.teste@example.test", subject: "Ative", text: "link",
    })).rejects.toThrow(/HML e produção/);
    await expect(new SmtpMailTransport({ ...env, IDBRF_RUNTIME_STAGE: "production" }).send({
      idempotencyKey: "prod", to: "caixa.teste@example.test", subject: "Ative", text: "link",
    })).rejects.toThrow(/HML e produção/);
    await expect(new SmtpMailTransport({ ...env, SMTP_ALLOWED_RECIPIENTS: "" }).send({
      idempotencyKey: "vazio", to: "caixa.teste@example.test", subject: "Ative", text: "link",
    })).rejects.toThrow(/SMTP_ALLOWED_RECIPIENTS/);
    await expect(new SmtpMailTransport({ ...env, SMTP_ALLOWED_RECIPIENTS: "Nome <caixa.teste@example.test>" }).send({
      idempotencyKey: "nome", to: "caixa.teste@example.test", subject: "Ative", text: "link",
    })).rejects.toThrow(/SMTP_ALLOWED_RECIPIENTS/);
    expect(nodemailer.createTransport).not.toHaveBeenCalled();
    expect(() => assertLiveSmtpRecipient({ ...env, IDBRF_RUNTIME_STAGE: "dev" }, "caixa.teste@example.test"))
      .toThrow(/IDBRF_RUNTIME_STAGE=qa/);
  });

  it("não enfileira aviso sem destino e anexa o QR quando há e-mail de teste", async () => {
    expect(await queueEventCheckInNotice(undefined, {
      registrationId: "r", to: null, eventName: "Encontro", checkInCode: "abc",
    })).toEqual({ queued: false });
    const mail = { deliverOnce: jest.fn().mockResolvedValue({ status: "SENT" }) };
    const queued = await queueEventCheckInNotice(mail as never, {
      registrationId: "r1", to: "pessoa@example.test", eventName: "Encontro", checkInCode: "abc123def456",
    });
    expect(queued.queued).toBe(true);
    const sent = mail.deliverOnce.mock.calls[0][0];
    expect(sent.html).toContain("cid:check-in-qr");
    expect(sent.attachments[0].cid).toBe("check-in-qr");
    expect(sent.idempotencyKey).toBe("event-checkin:r1");
  });
});
