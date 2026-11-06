import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { ChannelRateLimitService } from "./channel-rate-limit.service";
import { ChannelsService } from "./channels.service";
import { MockChannelProvider } from "./providers/mock.provider";
import { NoopChannelProvider } from "./providers/noop.provider";
import type { AuthUser } from "../auth/types/auth-user";

describe("ChannelsService", () => {
  const pilot = {
    organizationId: "org1",
    churchId: "church-rf1",
    organizationSlug: "igreja-de-deus",
    churchSlug: "riacho-fundo-1",
    churchName: "Riacho Fundo I (demo)",
  };

  const secretaria: AuthUser = {
    userId: "u-sec",
    personId: "p-sec",
    email: "ana.demo@example.test",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const membro: AuthUser = {
    userId: "u-mem",
    personId: "p-mem",
    email: "membro@example.test",
    grants: [
      {
        roleCode: "MEMBRO",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  const now = new Date("2026-11-06T12:00:00Z");

  const providers = {
    whatsapp: new MockChannelProvider("whatsapp"),
    email: new NoopChannelProvider("email"),
    push: new MockChannelProvider("push"),
  };

  function withTx(tx: object) {
    return {
      $transaction: jest.fn(async (fn: (t: typeof tx) => Promise<unknown>) =>
        fn(tx),
      ),
    };
  }

  function build(
    prisma: object,
    rate = new ChannelRateLimitService(),
  ) {
    return new ChannelsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      rate,
      providers,
    );
  }

  it("rejects non-admin for templates", async () => {
    const service = build({});
    await expect(
      service.listTemplates(membro),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates and lists templates", async () => {
    const template = {
      id: "t1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "EMAIL",
      code: "welcome",
      name: "Boas-vindas",
      subject: "Olá {{name}}",
      body: "Bem-vindo, {{name}}",
      locale: "pt-BR",
      providerTemplateName: null as string | null,
      variables: ["name"],
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      messageTemplate: { create: jest.fn().mockResolvedValue(template) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      ...withTx(tx),
      messageTemplate: {
        findMany: jest.fn().mockResolvedValue([template]),
      },
    };
    const service = build(prisma);
    const created = await service.createTemplate(secretaria, {
      channel: "EMAIL",
      code: "welcome",
      name: "Boas-vindas",
      subject: "Olá {{name}}",
      body: "Bem-vindo, {{name}}",
      variables: ["name"],
    });
    expect(created.code).toBe("welcome");
    const listed = await service.listTemplates(secretaria, "EMAIL");
    expect(listed.templates).toHaveLength(1);
  });

  it("upserts consent flags and requires them on enqueue", async () => {
    const consent = {
      id: "c1",
      personId: "p1",
      whatsappOptIn: true,
      emailOptIn: false,
      pushOptIn: false,
      purposes: ["TRANSACTIONAL"],
      source: "admin",
      recordedAt: now,
      revokedAt: null as Date | null,
      updatedAt: now,
    };
    const outboxRow = {
      id: "o1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "WHATSAPP",
      status: "PENDING",
      personId: "p1",
      toAddress: "+5561999999999",
      templateId: null as string | null,
      templateCode: null as string | null,
      subject: null as string | null,
      bodyRendered: "oi",
      payload: {},
      consentCheckedAt: now,
      providerMessageId: null as string | null,
      lastError: null as string | null,
      attemptCount: 0,
      nextAttemptAt: now,
      scheduledAt: null as Date | null,
      sentAt: null as Date | null,
      deliveredAt: null as Date | null,
      sourceType: "manual",
      sourceId: null as string | null,
      createdByUserId: "u-sec",
      createdAt: now,
      updatedAt: now,
    };
    const txConsent = {
      communicationConsent: {
        upsert: jest.fn().mockResolvedValue(consent),
      },
      auditLog: { create: jest.fn() },
    };
    const txOutbox = {
      communicationOutbox: { create: jest.fn().mockResolvedValue(outboxRow) },
      outboxDeliveryEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      communicationConsent: {
        findUnique: jest.fn().mockResolvedValue(consent),
      },
      messageTemplate: { findFirst: jest.fn() },
      $transaction: jest
        .fn()
        .mockImplementationOnce(async (fn) => fn(txConsent))
        .mockImplementationOnce(async (fn) => fn(txOutbox)),
    };
    const service = build(prisma);
    await service.upsertConsent(secretaria, "p1", {
      whatsappOptIn: true,
      purposes: ["TRANSACTIONAL"],
    });
    const item = await service.enqueue(secretaria, {
      channel: "WHATSAPP",
      toAddress: "+5561999999999",
      personId: "p1",
      body: "oi",
    });
    expect(item.status).toBe("PENDING");
    expect(item.consentCheckedAt).toBeTruthy();
  });

  it("blocks enqueue without consent", async () => {
    const prisma = {
      person: { findFirst: jest.fn() },
      communicationConsent: {
        findUnique: jest.fn().mockResolvedValue({
          whatsappOptIn: false,
          emailOptIn: false,
          pushOptIn: false,
          revokedAt: null,
        }),
      },
      messageTemplate: { findFirst: jest.fn() },
      $transaction: jest.fn(),
    };
    const service = build(prisma);
    await expect(
      service.enqueue(secretaria, {
        channel: "EMAIL",
        toAddress: "a@example.test",
        personId: "p1",
        body: "x",
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("dispatches with mock provider to DELIVERED", async () => {
    const row = {
      id: "o1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "WHATSAPP",
      status: "PENDING",
      personId: null as string | null,
      toAddress: "+5561",
      templateId: null as string | null,
      templateCode: null as string | null,
      subject: null as string | null,
      bodyRendered: "hello",
      payload: {},
      consentCheckedAt: null as Date | null,
      providerMessageId: null as string | null,
      lastError: null as string | null,
      attemptCount: 0,
      nextAttemptAt: now,
      scheduledAt: null as Date | null,
      sentAt: null as Date | null,
      deliveredAt: null as Date | null,
      sourceType: "manual",
      sourceId: null as string | null,
      createdByUserId: "u-sec",
      createdAt: now,
      updatedAt: now,
      template: null,
    };
    const updated = {
      ...row,
      status: "DELIVERED",
      providerMessageId: "mock_x",
      sentAt: now,
      deliveredAt: now,
      attemptCount: 1,
    };
    const tx = {
      communicationOutbox: {
        update: jest.fn().mockResolvedValue(updated),
      },
      outboxDeliveryEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      communicationOutbox: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn().mockResolvedValue({ ...row, status: "SENDING" }),
      },
      ...withTx(tx),
    };
    const rate = new ChannelRateLimitService();
    const service = build(prisma, rate);
    const result = await service.dispatchOne(secretaria, "o1");
    expect(result.status).toBe("DELIVERED");
  });

  it("marks SENT (not delivered) for noop email provider", async () => {
    const row = {
      id: "o2",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "EMAIL",
      status: "PENDING",
      personId: null as string | null,
      toAddress: "a@example.test",
      templateId: null as string | null,
      templateCode: null as string | null,
      subject: "hi",
      bodyRendered: "body",
      payload: {},
      consentCheckedAt: null as Date | null,
      providerMessageId: null as string | null,
      lastError: null as string | null,
      attemptCount: 0,
      nextAttemptAt: now,
      scheduledAt: null as Date | null,
      sentAt: null as Date | null,
      deliveredAt: null as Date | null,
      sourceType: "manual",
      sourceId: null as string | null,
      createdByUserId: "u-sec",
      createdAt: now,
      updatedAt: now,
      template: null,
    };
    const updated = {
      ...row,
      status: "SENT",
      providerMessageId: "noop_email_o2",
      sentAt: now,
      attemptCount: 1,
    };
    const tx = {
      communicationOutbox: {
        update: jest.fn().mockResolvedValue(updated),
      },
      outboxDeliveryEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      communicationOutbox: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
      },
      ...withTx(tx),
    };
    const service = build(prisma);
    const result = await service.dispatchOne(secretaria, "o2");
    expect(result.status).toBe("SENT");
  });

  it("enforces channel rate limit on dispatch", async () => {
    process.env.CHANNELS_PUSH_RATE_MAX = "1";
    const rate = new ChannelRateLimitService();
    rate.reset();
    expect(rate.tryConsume("PUSH", pilot.churchId)).toBe(true);

    const row = {
      id: "o3",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "PUSH",
      status: "PENDING",
      personId: null,
      toAddress: "device-1",
      templateId: null,
      templateCode: null,
      subject: null,
      bodyRendered: "push",
      payload: {},
      consentCheckedAt: null,
      providerMessageId: null,
      lastError: null,
      attemptCount: 0,
      nextAttemptAt: now,
      scheduledAt: null,
      sentAt: null,
      deliveredAt: null,
      sourceType: "manual",
      sourceId: null,
      createdByUserId: "u-sec",
      createdAt: now,
      updatedAt: now,
      template: null,
    };
    const prisma = {
      communicationOutbox: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
      },
    };
    const service = build(prisma, rate);
    await expect(service.dispatchOne(secretaria, "o3")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    delete process.env.CHANNELS_PUSH_RATE_MAX;
  });

  it("stub notify on CMS publish enqueues EMAIL by default", async () => {
    const outboxRow = {
      id: "o-cms",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "EMAIL",
      status: "PENDING",
      personId: null as string | null,
      toAddress: "cms-notify+c1@example.invalid",
      templateId: null as string | null,
      templateCode: null as string | null,
      subject: "Publicação: Sobre",
      bodyRendered: "stub",
      payload: { notifyOnPublish: true },
      consentCheckedAt: null as Date | null,
      providerMessageId: null as string | null,
      lastError: null as string | null,
      attemptCount: 0,
      nextAttemptAt: now,
      scheduledAt: null as Date | null,
      sentAt: null as Date | null,
      deliveredAt: null as Date | null,
      sourceType: "cms_content",
      sourceId: "c1",
      createdByUserId: "u-sec",
      createdAt: now,
      updatedAt: now,
    };
    const tx = {
      communicationOutbox: { create: jest.fn().mockResolvedValue(outboxRow) },
      outboxDeliveryEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      messageTemplate: { findFirst: jest.fn() },
      ...withTx(tx),
    };
    const service = build(prisma);
    const result = await service.enqueueCmsPublishNotify({
      actor: secretaria,
      contentId: "c1",
      title: "Sobre",
      slug: "sobre-nos",
    });
    expect(result.notified).toBe(1);
    expect(result.outbox[0].sourceType).toBe("cms_content");
  });

  it("returns empty consent when none stored", async () => {
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p9" }) },
      communicationConsent: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = build(prisma);
    const result = await service.getConsent(secretaria, "p9");
    expect(result.consent.whatsappOptIn).toBe(false);
    expect(result.consent.id).toBeNull();
  });

  it("404 on missing outbox", async () => {
    const prisma = {
      communicationOutbox: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const service = build(prisma);
    await expect(service.getOutbox(secretaria, "missing")).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("exposes provider modes without live flags", () => {
    const service = build({});
    const modes = service.providerModes();
    expect(modes.liveWaba).toBe(false);
    expect(modes.whatsapp).toBe("mock");
    expect(modes.email).toBe("noop");
  });
});
