import { ServiceUnavailableException } from "@nestjs/common";
import { MailService, SmtpMailTransport, TestMailTransport } from "./mail.service";
import { readPublicSmtpConfig } from "./smtp-config";

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
});
