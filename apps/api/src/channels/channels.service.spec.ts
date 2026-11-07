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

  it("rejects createTemplate without required fields or invalid channel", async () => {
    const service = build({ $transaction: jest.fn() });
    await expect(
      service.createTemplate(secretaria, {
        channel: "EMAIL",
        code: " ",
        name: "x",
        body: "y",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createTemplate(secretaria, {
        channel: "SMS" as never,
        code: "a",
        name: "b",
        body: "c",
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("patches template fields and 404s when missing", async () => {
    const template = {
      id: "t1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "EMAIL",
      code: "welcome",
      name: "Boas",
      subject: "Oi",
      body: "Olá {{name}}",
      locale: "pt-BR",
      providerTemplateName: null as string | null,
      variables: ["name"],
      active: true,
      createdAt: now,
      updatedAt: now,
    };
    const updated = { ...template, name: "Novo", active: false, locale: "pt-BR" };
    const tx = {
      messageTemplate: { update: jest.fn().mockResolvedValue(updated) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      messageTemplate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(template)
          .mockResolvedValueOnce(null),
      },
      ...withTx(tx),
    };
    const service = build(prisma);
    const result = await service.patchTemplate(secretaria, "t1", {
      name: " Novo ",
      body: " Olá {{name}} ",
      subject: "Oi",
      locale: "  ",
      providerTemplateName: "meta_welcome",
      variables: ["name"],
      active: false,
    });
    expect(result.name).toBe("Novo");
    await expect(
      service.patchTemplate(secretaria, "missing", { name: "x" }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("rejects empty name/body on patchTemplate", async () => {
    const prisma = {
      messageTemplate: {
        findFirst: jest.fn().mockResolvedValue({
          id: "t1",
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
        }),
      },
      $transaction: jest.fn(),
    };
    const service = build(prisma);
    await expect(
      service.patchTemplate(secretaria, "t1", { name: "  " }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.patchTemplate(secretaria, "t1", { body: "" }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("enqueues from template with variable rendering", async () => {
    const template = {
      id: "t1",
      subject: "Olá {{name}}",
      body: "Bem-vindo, {{name}} — {{missing}}",
      providerTemplateName: "welcome_v1",
    };
    const outboxRow = {
      id: "o-tpl",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "EMAIL",
      status: "PENDING",
      personId: null as string | null,
      toAddress: "a@example.test",
      templateId: "t1",
      templateCode: "welcome",
      subject: "Olá Ana",
      bodyRendered: "Bem-vindo, Ana — ",
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
    };
    const tx = {
      communicationOutbox: { create: jest.fn().mockResolvedValue(outboxRow) },
      outboxDeliveryEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      messageTemplate: { findFirst: jest.fn().mockResolvedValue(template) },
      ...withTx(tx),
    };
    const service = build(prisma);
    const item = await service.enqueue(secretaria, {
      channel: "EMAIL",
      toAddress: "a@example.test",
      templateCode: "welcome",
      variables: { name: "Ana" },
      skipConsentCheck: true,
    });
    expect(item.bodyRendered).toContain("Ana");
    expect(tx.communicationOutbox.create).toHaveBeenCalled();
  });

  it("rejects missing template, empty body, and invalid scheduledAt", async () => {
    const prisma = {
      messageTemplate: { findFirst: jest.fn().mockResolvedValue(null) },
      $transaction: jest.fn(),
    };
    const service = build(prisma);
    await expect(
      service.enqueue(secretaria, {
        channel: "EMAIL",
        toAddress: "a@example.test",
        templateCode: "ghost",
        skipConsentCheck: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.enqueue(secretaria, {
        channel: "EMAIL",
        toAddress: "a@example.test",
        skipConsentCheck: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.enqueue(secretaria, {
        channel: "EMAIL",
        toAddress: "a@example.test",
        body: "x",
        scheduledAt: "not-a-date",
        skipConsentCheck: true,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists and gets outbox with delivery events", async () => {
    const row = {
      id: "o1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "EMAIL",
      status: "PENDING",
      personId: null as string | null,
      toAddress: "a@example.test",
      templateId: null as string | null,
      templateCode: null as string | null,
      subject: null as string | null,
      bodyRendered: "hi",
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
    };
    const prisma = {
      communicationOutbox: {
        findMany: jest.fn().mockResolvedValue([row]),
        findFirst: jest.fn().mockResolvedValue(row),
      },
      outboxDeliveryEvent: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "e1",
            status: "PENDING",
            providerResponse: { enqueued: true },
            errorMessage: null,
            createdAt: now,
          },
        ]),
      },
    };
    const service = build(prisma);
    const listed = await service.listOutbox(secretaria, {
      status: "PENDING",
      channel: "EMAIL",
      limit: 10,
    });
    expect(listed.outbox).toHaveLength(1);
    const detail = await service.getOutbox(secretaria, "o1");
    expect(detail.deliveryEvents).toHaveLength(1);
  });

  it("rejects dispatch for non-dispatchable or future-scheduled items", async () => {
    const base = {
      id: "o1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "EMAIL",
      personId: null,
      toAddress: "a@example.test",
      templateId: null,
      templateCode: null,
      subject: null,
      bodyRendered: "x",
      payload: {},
      consentCheckedAt: null,
      providerMessageId: null,
      lastError: null,
      attemptCount: 0,
      nextAttemptAt: now,
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
        findFirst: jest
          .fn()
          .mockResolvedValueOnce({ ...base, status: "SENT", scheduledAt: null })
          .mockResolvedValueOnce({
            ...base,
            status: "PENDING",
            scheduledAt: new Date(Date.now() + 60_000),
          }),
      },
    };
    const service = build(prisma);
    await expect(service.dispatchOne(secretaria, "o1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.dispatchOne(secretaria, "o1")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it("marks FAILED when provider returns ok=false", async () => {
    const failing = {
      whatsapp: {
        name: "whatsapp",
        mode: "mock" as const,
        send: jest.fn().mockResolvedValue({
          ok: false,
          errorMessage: "boom",
          raw: { err: true },
        }),
      },
      email: providers.email,
      push: providers.push,
    };
    const row = {
      id: "o-fail",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "WHATSAPP",
      status: "PENDING",
      personId: null as string | null,
      toAddress: "+5561",
      templateId: null as string | null,
      templateCode: null as string | null,
      subject: null as string | null,
      bodyRendered: "hi",
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
    const updated = { ...row, status: "FAILED", lastError: "boom", attemptCount: 1 };
    const tx = {
      communicationOutbox: { update: jest.fn().mockResolvedValue(updated) },
      outboxDeliveryEvent: { create: jest.fn() },
    };
    const prisma = {
      communicationOutbox: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
      },
      ...withTx(tx),
    };
    const service = new ChannelsService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      new ChannelRateLimitService(),
      failing as never,
    );
    const result = await service.dispatchOne(secretaria, "o-fail");
    expect(result.status).toBe("FAILED");
  });

  it("dispatchPending processes rows and captures errors", async () => {
    const okRow = {
      id: "o-ok",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "PUSH",
      status: "PENDING",
      personId: null as string | null,
      toAddress: "device-1",
      templateId: null as string | null,
      templateCode: null as string | null,
      subject: null as string | null,
      bodyRendered: "push",
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
    const delivered = {
      ...okRow,
      status: "DELIVERED",
      providerMessageId: "mock",
      sentAt: now,
      deliveredAt: now,
      attemptCount: 1,
    };
    const tx = {
      communicationOutbox: { update: jest.fn().mockResolvedValue(delivered) },
      outboxDeliveryEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      communicationOutbox: {
        findMany: jest.fn().mockResolvedValue([okRow, { id: "o-bad" }]),
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(okRow)
          .mockResolvedValueOnce(null),
        update: jest.fn(),
      },
      ...withTx(tx),
    };
    const service = build(prisma);
    const result = await service.dispatchPending(secretaria, 2);
    expect(result.processed).toBe(2);
    expect(result.results[0]).toMatchObject({ status: "DELIVERED" });
    expect(result.results[1]).toMatchObject({ id: "o-bad" });
  });

  it("returns rate limit status snapshot", async () => {
    const service = build({});
    const status = await service.rateLimitStatus(secretaria);
    expect(status.churchId).toBe(pilot.churchId);
    expect(status.limits).toHaveLength(3);
    expect(status.providers.liveWaba).toBe(false);
  });

  it("404 when consent person is missing; push consent path", async () => {
    const prismaMissing = {
      person: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    await expect(
      build(prismaMissing).getConsent(secretaria, "ghost"),
    ).rejects.toBeInstanceOf(NotFoundException);

    const prisma = {
      messageTemplate: { findFirst: jest.fn() },
      communicationConsent: {
        findUnique: jest.fn().mockResolvedValue({
          whatsappOptIn: false,
          emailOptIn: false,
          pushOptIn: true,
          revokedAt: null,
        }),
      },
      $transaction: jest.fn(async (fn) =>
        fn({
          communicationOutbox: {
            create: jest.fn().mockResolvedValue({
              id: "o-push",
              organizationId: pilot.organizationId,
              churchId: pilot.churchId,
              channel: "PUSH",
              status: "PENDING",
              personId: "p1",
              toAddress: "device",
              templateId: null,
              templateCode: null,
              subject: null,
              bodyRendered: "p",
              payload: {},
              consentCheckedAt: now,
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
            }),
          },
          outboxDeliveryEvent: { create: jest.fn() },
          auditLog: { create: jest.fn() },
        }),
      ),
    };
    const item = await build(prisma).enqueue(secretaria, {
      channel: "PUSH",
      toAddress: "device",
      personId: "p1",
      body: "p",
    });
    expect(item.channel).toBe("PUSH");
  });

  it("cms notify stub covers whatsapp/push addresses and soft-fails", async () => {
    const makeRow = (channel: string, id: string) => ({
      id,
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel,
      status: "PENDING",
      personId: null as string | null,
      toAddress: "x",
      templateId: null as string | null,
      templateCode: null as string | null,
      subject: "Publicação: T",
      bodyRendered: "stub",
      payload: {},
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
    });
    let creates = 0;
    const tx = {
      communicationOutbox: {
        create: jest.fn().mockImplementation(async () => {
          creates += 1;
          if (creates === 2) throw new Error("soft");
          return makeRow(creates === 1 ? "WHATSAPP" : "PUSH", `o${creates}`);
        }),
      },
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
      title: "T",
      slug: "t",
      channels: ["WHATSAPP", "PUSH"],
    });
    expect(result.notified).toBe(1);
  });

  it("revokes consent flags", async () => {
    const revoked = {
      id: "c1",
      personId: "p1",
      whatsappOptIn: false,
      emailOptIn: false,
      pushOptIn: false,
      purposes: [],
      source: "admin",
      recordedAt: now,
      revokedAt: now,
      updatedAt: now,
    };
    const tx = {
      communicationConsent: { upsert: jest.fn().mockResolvedValue(revoked) },
      auditLog: { create: jest.fn() },
    };
    const prisma = {
      person: { findFirst: jest.fn().mockResolvedValue({ id: "p1" }) },
      ...withTx(tx),
    };
    const service = build(prisma);
    const result = await service.upsertConsent(secretaria, "p1", {
      revoke: true,
    });
    expect(result.revokedAt).toBeTruthy();
    expect(result.whatsappOptIn).toBe(false);
  });

  it("enqueues roster alert idempotently for PENDING source", async () => {
    const pending = {
      id: "o-roster",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "EMAIL",
      status: "PENDING",
      personId: "p-mem",
      toAddress: "cms-notify+p-mem@example.invalid",
      templateId: null,
      templateCode: null,
      subject: "Confirme",
      bodyRendered: "body",
      payload: {},
      consentCheckedAt: null,
      providerMessageId: null,
      lastError: null,
      attemptCount: 0,
      nextAttemptAt: now,
      scheduledAt: null,
      sentAt: null,
      deliveredAt: null,
      sourceType: "roster_assignment",
      sourceId: "a1:confirm",
      createdByUserId: "u-lider",
      createdAt: now,
      updatedAt: now,
    };
    const prismaReuse = {
      communicationOutbox: { findFirst: jest.fn().mockResolvedValue(pending) },
    };
    const reused = await build(prismaReuse).enqueueRosterAlert({
      actor: membro,
      assignmentId: "a1",
      kind: "confirm",
      personId: "p-mem",
      rosterTitle: "Culto",
    });
    expect(reused.reused).toBe(true);
    expect(reused.outbox[0].id).toBe("o-roster");

    const createdRow = { ...pending, id: "o-new", status: "PENDING" };
    const tx = {
      communicationOutbox: { create: jest.fn().mockResolvedValue(createdRow) },
      outboxDeliveryEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const prismaCreate = {
      communicationOutbox: { findFirst: jest.fn().mockResolvedValue(null) },
      messageTemplate: { findFirst: jest.fn() },
      ...withTx(tx),
    };
    const created = await build(prismaCreate).enqueueRosterAlert({
      actor: membro,
      assignmentId: "a1",
      kind: "confirm",
      personId: "p-mem",
      rosterTitle: "Culto",
    });
    expect(created.notified).toBe(1);
    expect(created.reused).toBe(false);
    expect(tx.communicationOutbox.create).toHaveBeenCalled();
  });

  it("resends outbox idempotently (reuse PENDING, clone SENT)", async () => {
    const pending = {
      id: "o1",
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      channel: "EMAIL",
      status: "PENDING",
      personId: "p-mem",
      toAddress: "a@example.invalid",
      templateId: null,
      templateCode: null,
      subject: "x",
      bodyRendered: "body",
      payload: {},
      consentCheckedAt: null,
      providerMessageId: null,
      lastError: null,
      attemptCount: 0,
      nextAttemptAt: now,
      scheduledAt: null,
      sentAt: null,
      deliveredAt: null,
      sourceType: "roster_assignment",
      sourceId: "a1:decline",
      createdByUserId: "u-sec",
      createdAt: now,
      updatedAt: now,
    };
    const sent = { ...pending, id: "o2", status: "SENT", sentAt: now };
    const cloned = { ...pending, id: "o3", status: "PENDING" };

    const reuse = await build({
      communicationOutbox: { findFirst: jest.fn().mockResolvedValue(pending) },
    }).resendOutbox(secretaria, {
      sourceType: "roster_assignment",
      sourceId: "a1:decline",
    });
    expect(reuse.reused).toBe(true);

    const tx = {
      communicationOutbox: { create: jest.fn().mockResolvedValue(cloned) },
      outboxDeliveryEvent: { create: jest.fn() },
      auditLog: { create: jest.fn() },
    };
    const clone = await build({
      communicationOutbox: { findFirst: jest.fn().mockResolvedValue(sent) },
      messageTemplate: { findFirst: jest.fn() },
      ...withTx(tx),
    }).resendOutbox(secretaria, {
      sourceType: "roster_assignment",
      sourceId: "a1:decline",
      channel: "EMAIL",
    });
    expect(clone.reused).toBe(false);
    expect(clone.outbox.id).toBe("o3");

    await expect(
      build({
        communicationOutbox: { findFirst: jest.fn().mockResolvedValue(null) },
      }).resendOutbox(secretaria, {
        sourceType: "roster_assignment",
        sourceId: "missing",
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
