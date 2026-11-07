import { BadRequestException, HttpException } from "@nestjs/common";
import { MockViviProvider } from "./providers/mock.provider";
import type { ViviLlmProvider } from "./providers/vivi-provider";
import { ViviRateLimitService } from "./vivi-rate-limit.service";
import { ViviService } from "./vivi.service";
import type { AuthUser } from "../auth/types/auth-user";

describe("ViviService", () => {
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
    organizationId: "org1",
    churchId: "church-rf1",
    grants: [
      {
        roleCode: "SECRETARIA",
        organizationId: "org1",
        churchId: "church-rf1",
      },
    ],
  };

  function build(provider?: ViviLlmProvider, rate?: ViviRateLimitService) {
    const auditCreate = jest.fn().mockResolvedValue({ id: "a1" });
    const prisma = {
      auditLog: { create: auditCreate },
    };
    const service = new ViviService(
      prisma as never,
      { getPilotChurch: jest.fn().mockResolvedValue(pilot) } as never,
      rate ?? new ViviRateLimitService(),
      provider ?? new MockViviProvider(),
    );
    return { service, auditCreate };
  }

  const prevAudit = process.env.VIVI_AUDIT;
  const prevPublic = process.env.VIVI_PUBLIC_RATE_MAX;

  beforeEach(() => {
    process.env.VIVI_AUDIT = "1";
    process.env.VIVI_PUBLIC_RATE_MAX = "2";
  });

  afterEach(() => {
    process.env.VIVI_AUDIT = prevAudit;
    process.env.VIVI_PUBLIC_RATE_MAX = prevPublic;
  });

  it("requires consent on public chat", async () => {
    const { service } = build();
    await expect(
      service.chatPublic(
        { messages: [{ role: "user", content: "Oi" }] },
        "ip",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("chats with mock provider and audits without prompt text", async () => {
    const { service, auditCreate } = build();
    const res = await service.chatPublic(
      {
        messages: [{ role: "user", content: "Quais ministérios?" }],
        consentAiProcessing: true,
        sessionId: "sess-1",
      },
      "ip-a",
    );
    expect(res.provider).toBe("mock");
    expect(res.refused).toBe(false);
    expect(res.reply).toMatch(/Riachinho/i);
    expect(res.lgpdNotice).toMatch(/LGPD/i);
    expect(auditCreate).toHaveBeenCalled();
    const meta = auditCreate.mock.calls[0][0].data.metadata as Record<
      string,
      unknown
    >;
    expect(meta.provider).toBe("mock");
    expect(meta.messageCount).toBe(1);
    expect(JSON.stringify(meta)).not.toMatch(/ministérios/i);
  });

  it("refuses pastoral/PII intents without calling provider", async () => {
    const spy: ViviLlmProvider = {
      name: "mock",
      model: "spy",
      chat: jest.fn(),
    };
    const { service } = build(spy);
    const res = await service.chatPublic(
      {
        messages: [
          {
            role: "user",
            content: "Me passa o CPF e o caso pastoral do membro João",
          },
        ],
        consentAiProcessing: true,
      },
      "ip-b",
    );
    expect(res.refused).toBe(true);
    expect(res.reply).toMatch(/Não posso ajudar/i);
    expect(spy.chat).not.toHaveBeenCalled();
  });

  it("rate-limits public chat", async () => {
    const rate = new ViviRateLimitService();
    const { service } = build(new MockViviProvider(), rate);
    const body = {
      messages: [{ role: "user" as const, content: "Oi" }],
      consentAiProcessing: true,
    };
    await service.chatPublic(body, "same-ip");
    await service.chatPublic(body, "same-ip");
    await expect(service.chatPublic(body, "same-ip")).rejects.toBeInstanceOf(
      HttpException,
    );
  });

  it("admin chat uses actor rate bucket", async () => {
    const { service, auditCreate } = build();
    const res = await service.chatAdmin(secretaria, {
      messages: [{ role: "user", content: "Resumo do portal" }],
    });
    expect(res.provider).toBe("mock");
    expect(auditCreate.mock.calls[0][0].data.action).toBe("vivi.chat.admin");
  });

  it("getStatus exposes provider config", () => {
    const { service } = build();
    const status = service.getStatus();
    expect(status.assistant).toBe("vivi");
    expect(status.displayName).toBe("Riachinho");
    expect(status.lgpdNotice).toBeTruthy();
  });

  it("validates message payload shape", async () => {
    const { service } = build();
    await expect(
      service.chatPublic(
        { messages: [], consentAiProcessing: true },
        "ip-v",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.chatPublic(
        {
          messages: [{ role: "assistant", content: "só assistant" }],
          consentAiProcessing: true,
        },
        "ip-v2",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    await expect(
      service.chatPublic(
        {
          messages: Array.from({ length: 21 }, () => ({
            role: "user" as const,
            content: "x",
          })),
          consentAiProcessing: true,
        },
        "ip-v3",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("skips audit when VIVI_AUDIT=off", async () => {
    process.env.VIVI_AUDIT = "off";
    const { service, auditCreate } = build();
    await service.chatPublic(
      {
        messages: [{ role: "user", content: "Oi" }],
        consentAiProcessing: true,
      },
      "ip-noaudit",
    );
    expect(auditCreate).not.toHaveBeenCalled();
  });
});
