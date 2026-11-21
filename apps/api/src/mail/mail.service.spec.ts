import { ServiceUnavailableException } from "@nestjs/common";
import { MailService, SmtpMailTransport, TestMailTransport } from "./mail.service";
import { readPublicSmtpConfig } from "./smtp-config";

jest.mock("nodemailer", () => ({
  createTransport: jest.fn(),
}));

import { createTransport } from "nodemailer";

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

  it("restringe envio real no DEV aos destinatários explícitos do QA", async () => {
    const env = {
      SMTP_HOST: "smtp.hostinger.com", SMTP_PORT: "587", SMTP_USER: "igreja",
      SMTP_FROM: "nao-responda@example.test", SMTP_PASSWORD: "teste",
      SMTP_SEND_ENABLED: "1", SMTP_ALLOWED_RECIPIENTS: "permitido@example.test",
    };
    const message = { idempotencyKey: "k2", to: "pessoa@example.test", subject: "Teste", text: "Sem rede" };
    await expect(new SmtpMailTransport({ ...env, IDBRF_RUNTIME_STAGE: "qa" }).send(message))
      .rejects.toThrow(/destinatário não está autorizado/);
    await expect(new SmtpMailTransport({ ...env, IDBRF_RUNTIME_STAGE: "hml" }).send(message))
      .rejects.toThrow(/ambiente QA/);
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

  it("trata autenticação, timeout e recusa SMTP sem marcar o envio e permite repetir", async () => {
    const sendMail = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error("535 authentication failed"), { responseCode: 535 }))
      .mockRejectedValueOnce(Object.assign(new Error("socket hang up"), { code: "ETIMEDOUT" }))
      .mockRejectedValueOnce(Object.assign(new Error("550 5.1.1 user unknown"), { responseCode: 550 }))
      .mockResolvedValueOnce({ messageId: "<qa-probe@smtp.hostinger.com>" });
    (createTransport as jest.Mock).mockReturnValue({ sendMail });
    const env = {
      IDBRF_RUNTIME_STAGE: "qa",
      SMTP_HOST: "smtp.hostinger.com",
      SMTP_PORT: "587",
      SMTP_USER: "igreja",
      SMTP_FROM: "nao-responda@example.test",
      SMTP_PASSWORD: "segredo-da-igreja",
      SMTP_SEND_ENABLED: "1",
      SMTP_ALLOWED_RECIPIENTS: "permitido@example.test",
    };
    const message = {
      idempotencyKey: "access-invite:falha",
      to: "permitido@example.test",
      subject: "Redefina sua senha",
      text: "link com token=segredo-nao-persistir",
    };
    const rows = new Map<string, { status: string; providerMessageId: string | null; lastError: string | null; attemptCount: number }>();
    const db = {
      mailDelivery: {
        findUnique: jest.fn(async ({ where }: { where: { idempotencyKey: string } }) => rows.get(where.idempotencyKey) ?? null),
        create: jest.fn(async ({ data }: { data: { idempotencyKey: string } }) => {
          rows.set(data.idempotencyKey, { status: "PENDING", providerMessageId: null, lastError: null, attemptCount: 1 });
        }),
        updateMany: jest.fn(async ({ where, data }: { where: { idempotencyKey: string; status: string }; data: { status: string; attemptCount: { increment: number } } }) => {
          const row = rows.get(where.idempotencyKey);
          if (!row || row.status !== where.status) return { count: 0 };
          row.status = data.status;
          row.attemptCount += data.attemptCount.increment;
          row.lastError = null;
          return { count: 1 };
        }),
        update: jest.fn(async ({ where, data }: { where: { idempotencyKey: string }; data: { status: string; providerMessageId?: string | null; lastError?: string | null } }) => {
          const row = rows.get(where.idempotencyKey);
          if (row) Object.assign(row, data);
        }),
      },
    };
    const previousPassword = process.env.SMTP_PASSWORD;
    process.env.SMTP_PASSWORD = "segredo-da-igreja";
    const mail = new MailService(db as never, new SmtpMailTransport(env));
    try {
      await expect(mail.deliverOnce(message)).rejects.toThrow(/535/);
      expect(rows.get(message.idempotencyKey)?.status).toBe("FAILED");
      expect(rows.get(message.idempotencyKey)?.providerMessageId ?? null).toBeNull();
      await expect(mail.deliverOnce(message)).rejects.toThrow(/ETIMEDOUT|hang up/);
      expect(rows.get(message.idempotencyKey)?.status).toBe("FAILED");
      await expect(mail.deliverOnce(message)).rejects.toThrow(/550/);
      expect(rows.get(message.idempotencyKey)?.status).toBe("FAILED");
      expect(JSON.stringify([...rows.values()])).not.toContain("token=segredo");
      expect(JSON.stringify([...rows.values()])).not.toContain("segredo-da-igreja");
      const sent = await mail.deliverOnce(message);
      expect(sent).toMatchObject({ status: "SENT", idempotentReplay: false, providerMessageId: "<qa-probe@smtp.hostinger.com>" });
      expect(rows.get(message.idempotencyKey)?.status).toBe("SENT");
      expect(sendMail).toHaveBeenCalledTimes(4);
      const options = (createTransport as jest.Mock).mock.calls[0][0];
      expect(options).toMatchObject({
        host: "smtp.hostinger.com",
        port: 587,
        secure: false,
        requireTLS: true,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        tls: { minVersion: "TLSv1.2" },
      });
      expect(JSON.stringify({ host: options.host, port: options.port })).not.toContain("segredo-da-igreja");
    } finally {
      if (previousPassword === undefined) delete process.env.SMTP_PASSWORD;
      else process.env.SMTP_PASSWORD = previousPassword;
    }
  });

  it("não abre conexão quando o erro do provedor contém a senha", async () => {
    const rows = new Map<string, { status: string; lastError: string | null }>();
    const db = {
      mailDelivery: {
        findUnique: jest.fn(async () => null),
        create: jest.fn(async ({ data }: { data: { idempotencyKey: string } }) => {
          rows.set(data.idempotencyKey, { status: "PENDING", lastError: null });
        }),
        update: jest.fn(async ({ data }: { data: { status: string; lastError?: string | null } }) => {
          const row = rows.values().next().value;
          if (row) Object.assign(row, data);
        }),
      },
    };
    const previous = process.env.SMTP_PASSWORD;
    process.env.SMTP_PASSWORD = "segredo-da-igreja";
    const transport = {
      name: "smtp" as const,
      send: jest.fn(async () => { throw new Error("falha smtp segredo-da-igreja"); }),
    };
    try {
      const mail = new MailService(db as never, transport);
      await expect(mail.deliverOnce({
        idempotencyKey: "event-checkin:reg1",
        to: "permitido@example.test",
        subject: "Inscrição confirmada",
        text: "ingresso",
      })).rejects.toThrow(/segredo-da-igreja/);
      expect([...rows.values()][0]).toMatchObject({ status: "FAILED", lastError: "falha de envio" });
    } finally {
      if (previous === undefined) delete process.env.SMTP_PASSWORD;
      else process.env.SMTP_PASSWORD = previous;
    }
  });
});
