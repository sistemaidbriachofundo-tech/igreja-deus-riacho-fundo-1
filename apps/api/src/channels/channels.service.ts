import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Optional,
  NotFoundException,
} from "@nestjs/common";
import { canManageChannels } from "@idbrf/shared";
import type { Prisma } from "@prisma/client";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { ChannelRateLimitService } from "./channel-rate-limit.service";
import type {
  ChannelProviders,
  CommChannel,
} from "./providers/channel-provider";
import {
  createChannelProviders,
  pickProvider,
} from "./providers/providers.factory";

function asJson(
  value: unknown,
): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

const CHANNELS: CommChannel[] = ["WHATSAPP", "EMAIL", "PUSH"];
const OUTBOX_DISPATCHABLE = new Set(["PENDING", "QUEUED", "FAILED"]);
const MAX_ATTEMPTS = 5;

export type RosterAlertKind =
  | "confirm"
  | "decline"
  | "substitute"
  | "confirm_request";

export type TemplateInput = {
  channel: CommChannel;
  code: string;
  name: string;
  subject?: string | null;
  body: string;
  locale?: string;
  providerTemplateName?: string | null;
  variables?: string[] | null;
  active?: boolean;
};

export type ConsentInput = {
  whatsappOptIn?: boolean;
  emailOptIn?: boolean;
  pushOptIn?: boolean;
  purposes?: string[];
  source?: string | null;
  revoke?: boolean;
};

export type EnqueueInput = {
  channel: CommChannel;
  /** Obrigatório exceto PUSH com personId (resolve token ativo do registry). */
  toAddress?: string | null;
  personId?: string | null;
  templateCode?: string | null;
  subject?: string | null;
  body?: string | null;
  variables?: Record<string, string>;
  payload?: Record<string, unknown>;
  sourceType?: string | null;
  sourceId?: string | null;
  skipConsentCheck?: boolean;
  scheduledAt?: string | null;
};

export type PushPlatform = "ANDROID" | "IOS" | "WEB";

export type RegisterDeviceTokenInput = {
  token: string;
  platform: PushPlatform;
  personId?: string | null;
  deviceLabel?: string | null;
  appId?: string | null;
};

@Injectable()
export class ChannelsService {
  private readonly providers: ChannelProviders;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly rateLimits: ChannelRateLimitService,
    @Optional() providers?: ChannelProviders,
  ) {
    this.providers = providers ?? createChannelProviders();
  }

  providerModes() {
    const push = this.providers.push;
    return {
      whatsapp: this.providers.whatsapp.mode,
      email: this.providers.email.mode,
      push: push.mode,
      pushAdapter: push.name,
      liveWaba: false,
      liveSmtp: false,
      livePush: false,
      liveFcm: false,
      notes: [
        "Providers mock/noop apenas — sem WABA/SMTP/FCM live nesta fatia",
        "Push usa stub FCM (PUSH_PROVIDER=mock|noop); device tokens em /channels/device-tokens",
        "Defina WHATSAPP_PROVIDER / EMAIL_PROVIDER / PUSH_PROVIDER = mock|noop",
      ],
    };
  }

  async createTemplate(actor: AuthUser, input: TemplateInput) {
    const pilot = await this.requireChannelsAdmin(actor);
    this.assertChannel(input.channel);
    const code = input.code?.trim().toLowerCase();
    const name = input.name?.trim();
    const body = input.body?.trim();
    if (!code || !name || !body) {
      throw new BadRequestException("code, name e body são obrigatórios");
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.messageTemplate.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          channel: input.channel,
          code,
          name,
          subject: input.subject ?? null,
          body,
          locale: input.locale?.trim() || "pt-BR",
          providerTemplateName: input.providerTemplateName ?? null,
          variables: asJson(input.variables ?? []),
          active: input.active ?? true,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "channels.template.create",
          resourceType: "message_template",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { channel: row.channel, code: row.code },
        },
      });
      return this.templateDto(row);
    });
  }

  async listTemplates(actor: AuthUser, channel?: string) {
    const pilot = await this.requireChannelsAdmin(actor);
    const rows = await this.prisma.messageTemplate.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(channel && isChannel(channel) ? { channel } : {}),
      },
      orderBy: [{ channel: "asc" }, { code: "asc" }],
    });
    return {
      churchId: pilot.churchId,
      templates: rows.map((r) => this.templateDto(r)),
    };
  }

  async patchTemplate(
    actor: AuthUser,
    templateId: string,
    input: Partial<TemplateInput>,
  ) {
    const pilot = await this.requireChannelsAdmin(actor);
    const existing = await this.prisma.messageTemplate.findFirst({
      where: {
        id: templateId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!existing) throw new NotFoundException("Template não encontrado");

    const data: Record<string, unknown> = {};
    if (input.name !== undefined) {
      const name = input.name?.trim();
      if (!name) throw new BadRequestException("name inválido");
      data.name = name;
    }
    if (input.body !== undefined) {
      const body = input.body?.trim();
      if (!body) throw new BadRequestException("body inválido");
      data.body = body;
    }
    if (input.subject !== undefined) data.subject = input.subject;
    if (input.locale !== undefined) data.locale = input.locale?.trim() || "pt-BR";
    if (input.providerTemplateName !== undefined) {
      data.providerTemplateName = input.providerTemplateName;
    }
    if (input.variables !== undefined) {
      data.variables = asJson(input.variables ?? []);
    }
    if (input.active !== undefined) data.active = input.active;

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.messageTemplate.update({
        where: { id: templateId },
        data,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "channels.template.patch",
          resourceType: "message_template",
          resourceId: templateId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { fields: Object.keys(data) },
        },
      });
      return this.templateDto(row);
    });
  }

  async getConsent(actor: AuthUser, personId: string) {
    const pilot = await this.requireConsentAccess(actor, personId);
    await this.requirePerson(personId, pilot);
    const row = await this.prisma.communicationConsent.findUnique({
      where: {
        churchId_personId: { churchId: pilot.churchId, personId },
      },
    });
    return {
      personId,
      churchId: pilot.churchId,
      consent: row ? this.consentDto(row) : this.emptyConsent(personId),
    };
  }

  async upsertConsent(actor: AuthUser, personId: string, input: ConsentInput) {
    const pilot = await this.requireConsentAccess(actor, personId);
    await this.requirePerson(personId, pilot);

    const revoke = input.revoke === true;
    const selfService = actor.personId === personId;
    const data = {
      whatsappOptIn: revoke ? false : Boolean(input.whatsappOptIn),
      emailOptIn: revoke ? false : Boolean(input.emailOptIn),
      pushOptIn: revoke ? false : Boolean(input.pushOptIn),
      purposes: asJson(revoke ? [] : (input.purposes ?? [])),
      source: input.source ?? (selfService ? "self" : "admin"),
      revokedAt: revoke ? new Date() : null,
      recordedAt: new Date(),
    };

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.communicationConsent.upsert({
        where: {
          churchId_personId: { churchId: pilot.churchId, personId },
        },
        create: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          personId,
          ...data,
        },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: revoke ? "channels.consent.revoke" : "channels.consent.upsert",
          resourceType: "communication_consent",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            personId,
            whatsappOptIn: row.whatsappOptIn,
            emailOptIn: row.emailOptIn,
            pushOptIn: row.pushOptIn,
          },
        },
      });
      return this.consentDto(row);
    });
  }

  async registerDeviceToken(actor: AuthUser, input: RegisterDeviceTokenInput) {
    const token = input.token?.trim();
    if (!token || token.length < 8) {
      throw new BadRequestException("token inválido (mín. 8 chars)");
    }
    this.assertPushPlatform(input.platform);
    const targetPersonId = (input.personId?.trim() || actor.personId) as string;
    const pilot = await this.requireConsentAccess(actor, targetPersonId);
    await this.requirePerson(targetPersonId, pilot);

    const now = new Date();
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.pushDeviceToken.findUnique({
        where: {
          churchId_token: { churchId: pilot.churchId, token },
        },
      });
      const row = existing
        ? await tx.pushDeviceToken.update({
            where: { id: existing.id },
            data: {
              personId: targetPersonId,
              platform: input.platform,
              provider: "FCM",
              deviceLabel: input.deviceLabel?.trim() || existing.deviceLabel,
              appId: input.appId?.trim() || existing.appId,
              lastSeenAt: now,
              revokedAt: null,
            },
          })
        : await tx.pushDeviceToken.create({
            data: {
              organizationId: pilot.organizationId,
              churchId: pilot.churchId,
              personId: targetPersonId,
              token,
              platform: input.platform,
              provider: "FCM",
              deviceLabel: input.deviceLabel?.trim() || null,
              appId: input.appId?.trim() || null,
              lastSeenAt: now,
            },
          });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: existing
            ? "channels.device_token.refresh"
            : "channels.device_token.register",
          resourceType: "push_device_token",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            personId: targetPersonId,
            platform: row.platform,
            provider: row.provider,
            tokenSuffix: token.slice(-6),
          },
        },
      });
      return this.deviceTokenDto(row);
    });
  }

  async listDeviceTokens(
    actor: AuthUser,
    query: { personId?: string; includeRevoked?: boolean } = {},
  ) {
    const targetPersonId = (query.personId?.trim() || actor.personId) as string;
    const pilot = await this.requireConsentAccess(actor, targetPersonId);
    const rows = await this.prisma.pushDeviceToken.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        personId: targetPersonId,
        ...(query.includeRevoked ? {} : { revokedAt: null }),
      },
      orderBy: { lastSeenAt: "desc" },
      take: 50,
    });
    return {
      personId: targetPersonId,
      churchId: pilot.churchId,
      liveFcm: false,
      tokens: rows.map((r) => this.deviceTokenDto(r, { includeToken: false })),
    };
  }

  async revokeDeviceToken(actor: AuthUser, tokenId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const row = await this.prisma.pushDeviceToken.findFirst({
      where: {
        id: tokenId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) throw new NotFoundException("Device token não encontrado");
    await this.requireConsentAccess(actor, row.personId);
    if (row.revokedAt) return this.deviceTokenDto(row);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.pushDeviceToken.update({
        where: { id: tokenId },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "channels.device_token.revoke",
          resourceType: "push_device_token",
          resourceId: tokenId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            personId: row.personId,
            tokenSuffix: row.token.slice(-6),
          },
        },
      });
      return this.deviceTokenDto(updated);
    });
  }

  async enqueue(actor: AuthUser, input: EnqueueInput) {
    const pilot = await this.requireChannelsAdmin(actor);
    this.assertChannel(input.channel);

    let toAddress = input.toAddress?.trim() || "";
    if (!toAddress) {
      if (input.channel === "PUSH" && input.personId) {
        const resolved = await this.resolveLatestPushToken(
          pilot.churchId,
          input.personId,
        );
        if (!resolved) {
          throw new BadRequestException({
            message: "Nenhum device token ativo para a pessoa",
            code: "DEVICE_TOKEN_REQUIRED",
          });
        }
        toAddress = resolved.token;
      } else {
        throw new BadRequestException("toAddress obrigatório");
      }
    }

    return this.enqueueResolved(actor, pilot, { ...input, toAddress });
  }

  /** Fan-out PUSH: um outbox por token ativo (admin canais). */
  async enqueuePushFanout(
    actor: AuthUser,
    input: Omit<EnqueueInput, "channel" | "toAddress"> & {
      personId: string;
    },
  ) {
    const pilot = await this.requireChannelsAdmin(actor);
    const personId = input.personId.trim();
    if (!personId) {
      throw new BadRequestException("personId obrigatório para push-fanout");
    }
    const tokens = await this.prisma.pushDeviceToken.findMany({
      where: {
        churchId: pilot.churchId,
        personId,
        revokedAt: null,
      },
      orderBy: { lastSeenAt: "desc" },
      take: 20,
    });
    if (tokens.length === 0) {
      throw new BadRequestException({
        message: "Nenhum device token ativo para a pessoa",
        code: "DEVICE_TOKEN_REQUIRED",
      });
    }
    const created = [];
    for (const device of tokens) {
      const item = await this.enqueueResolved(actor, pilot, {
        ...input,
        channel: "PUSH",
        personId,
        toAddress: device.token,
        payload: {
          ...(input.payload ?? {}),
          deviceTokenId: device.id,
          platform: device.platform,
          pushProvider: "FCM",
          liveFcm: false,
        },
      });
      created.push(item);
    }
    return {
      fanout: true as const,
      liveFcm: false,
      notified: created.length,
      outbox: created,
    };
  }

  private async enqueueResolved(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    input: EnqueueInput & { toAddress: string },
  ) {
    const toAddress = input.toAddress.trim();

    const rendered = await this.resolveTemplateContent(pilot.churchId, input);
    let consentCheckedAt: Date | null = null;
    if (input.personId && !input.skipConsentCheck) {
      const ok = await this.hasChannelConsent(
        pilot.churchId,
        input.personId,
        input.channel,
      );
      if (!ok) {
        throw new ForbiddenException({
          message: "Sem consentimento opt-in para este canal",
          code: "CONSENT_REQUIRED",
        });
      }
      consentCheckedAt = new Date();
    }

    const scheduledAt = input.scheduledAt
      ? new Date(input.scheduledAt)
      : null;
    if (scheduledAt && Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException("scheduledAt inválido");
    }

    return this.persistOutbox(actor, pilot, {
      channel: input.channel,
      toAddress,
      personId: input.personId ?? null,
      ...rendered,
      payload: input.payload ?? {},
      consentCheckedAt,
      scheduledAt,
      sourceType: input.sourceType ?? "manual",
      sourceId: input.sourceId ?? null,
      system: false,
    });
  }

  /**
   * Stub CMS: enfileira notificações opcionais ao publicar (sem envio live).
   * Não bloqueia a publicação se falhar — retorna lista vazia em erro soft.
   */
  async enqueueCmsPublishNotify(params: {
    actor: AuthUser;
    contentId: string;
    title: string;
    slug: string;
    channels?: CommChannel[];
    toAddress?: string | null;
    personId?: string | null;
  }) {
    const channels = (params.channels?.length
      ? params.channels
      : (["EMAIL"] as CommChannel[])
    ).filter(isChannel);
    const created = [];
    for (const channel of channels) {
      const toAddress =
        params.toAddress?.trim() ||
        defaultStubAddress(channel, params.personId ?? "cms");
      try {
        const item = await this.enqueue(params.actor, {
          channel,
          toAddress,
          personId: params.personId ?? null,
          skipConsentCheck: true,
          templateCode: null,
          subject: `Publicação: ${params.title}`,
          body: `Conteúdo "${params.title}" (${params.slug}) foi publicado. (stub notify-on-publish — sem envio live)`,
          sourceType: "cms_content",
          sourceId: params.contentId,
          payload: { notifyOnPublish: true, slug: params.slug },
        });
        created.push(item);
      } catch {
        // Soft-fail: publicação CMS não depende do canal.
      }
    }
    return { notified: created.length, outbox: created };
  }

  /**
   * RF-015 — alerta de escala via outbox mock (sem WABA live).
   * Idempotente: reusa PENDING/QUEUED/SENDING com mesmo sourceType+sourceId+channel.
   * Soft-fail seguro para líderes (não exige canManageChannels).
   */
  async enqueueRosterAlert(params: {
    actor: AuthUser;
    assignmentId: string;
    kind: RosterAlertKind;
    personId: string;
    rosterTitle?: string | null;
    channel?: CommChannel;
    toAddress?: string | null;
  }) {
    const channel = (params.channel ?? "EMAIL") as CommChannel;
    if (!isChannel(channel)) {
      return { notified: 0, outbox: [] as ReturnType<ChannelsService["outboxDto"]>[], reused: false };
    }
    const sourceType = "roster_assignment";
    const sourceId = `${params.assignmentId}:${params.kind}`;
    try {
      const pilot = await this.pilot.getPilotChurch();
      const existing = await this.prisma.communicationOutbox.findFirst({
        where: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          sourceType,
          sourceId,
          channel,
          status: { in: ["PENDING", "QUEUED", "SENDING"] },
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        return {
          notified: 0,
          outbox: [this.outboxDto(existing)],
          reused: true,
        };
      }

      const toAddress =
        params.toAddress?.trim() ||
        defaultStubAddress(channel, params.personId);
      const copy = rosterAlertCopy(params.kind, params.rosterTitle ?? null);
      const item = await this.enqueueSystem(params.actor, pilot, {
        channel,
        toAddress,
        personId: params.personId,
        skipConsentCheck: true,
        subject: copy.subject,
        body: copy.body,
        sourceType,
        sourceId,
        payload: {
          rosterAlert: true,
          kind: params.kind,
          assignmentId: params.assignmentId,
          liveWaba: false,
        },
      });
      return { notified: 1, outbox: [item], reused: false };
    } catch {
      return { notified: 0, outbox: [], reused: false };
    }
  }

  /**
   * RF-015 — reenvio idempotente por sourceType+sourceId.
   * PENDING/QUEUED/SENDING → devolve o existente; caso contrário clona novo PENDING.
   */
  async resendOutbox(
    actor: AuthUser,
    input: {
      sourceType: string;
      sourceId: string;
      channel?: CommChannel;
    },
  ) {
    const pilot = await this.requireChannelsAdmin(actor);
    const sourceType = input.sourceType?.trim();
    const sourceId = input.sourceId?.trim();
    if (!sourceType || !sourceId) {
      throw new BadRequestException("sourceType e sourceId são obrigatórios");
    }
    const channelFilter =
      input.channel && isChannel(input.channel) ? input.channel : undefined;

    const latest = await this.prisma.communicationOutbox.findFirst({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        sourceType,
        sourceId,
        ...(channelFilter ? { channel: channelFilter } : {}),
      },
      orderBy: { createdAt: "desc" },
    });
    if (!latest) {
      throw new NotFoundException({
        code: "OUTBOX_SOURCE_NOT_FOUND",
        message: "Nenhum outbox com este sourceType/sourceId",
      });
    }

    if (["PENDING", "QUEUED", "SENDING"].includes(latest.status)) {
      return {
        reused: true,
        outbox: this.outboxDto(latest),
      };
    }

    const created = await this.enqueueSystem(actor, pilot, {
      channel: latest.channel as CommChannel,
      toAddress: latest.toAddress,
      personId: latest.personId,
      skipConsentCheck: true,
      templateCode: latest.templateCode,
      subject: latest.subject,
      body: latest.bodyRendered,
      sourceType,
      sourceId,
      payload: {
        ...((latest.payload as Record<string, unknown>) ?? {}),
        resendOf: latest.id,
      },
    });
    return { reused: false, outbox: created };
  }

  /** Enfileira sem exigir canManageChannels (uso interno CMS/roster). */
  private async enqueueSystem(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    input: EnqueueInput,
  ) {
    this.assertChannel(input.channel);
    const toAddress = input.toAddress?.trim();
    if (!toAddress) throw new BadRequestException("toAddress obrigatório");
    const rendered = await this.resolveTemplateContent(pilot.churchId, input);
    return this.persistOutbox(actor, pilot, {
      channel: input.channel,
      toAddress,
      personId: input.personId ?? null,
      ...rendered,
      payload: input.payload ?? {},
      consentCheckedAt: null,
      scheduledAt: null,
      sourceType: input.sourceType ?? "system",
      sourceId: input.sourceId ?? null,
      system: true,
    });
  }

  private async resolveTemplateContent(
    churchId: string,
    input: EnqueueInput,
  ): Promise<{
    templateId: string | null;
    templateCode: string | null;
    subject: string | null;
    body: string;
  }> {
    let templateId: string | null = null;
    const templateCode: string | null =
      input.templateCode?.trim().toLowerCase() ?? null;
    let subject = input.subject ?? null;
    let body = input.body?.trim() ?? "";

    if (templateCode) {
      const template = await this.prisma.messageTemplate.findFirst({
        where: {
          churchId,
          channel: input.channel,
          code: templateCode,
          active: true,
        },
      });
      if (!template) {
        throw new BadRequestException(`Template inativo/ausente: ${templateCode}`);
      }
      templateId = template.id;
      const rawSubject = subject ?? template.subject;
      subject = rawSubject
        ? renderTemplate(rawSubject, input.variables ?? {})
        : null;
      body = renderTemplate(template.body, input.variables ?? {});
    }

    if (!body) throw new BadRequestException("body ou templateCode obrigatório");
    return { templateId, templateCode, subject, body };
  }

  private async persistOutbox(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    data: {
      channel: CommChannel;
      toAddress: string;
      personId: string | null;
      templateId: string | null;
      templateCode: string | null;
      subject: string | null;
      body: string;
      payload: Record<string, unknown>;
      consentCheckedAt: Date | null;
      scheduledAt: Date | null;
      sourceType: string;
      sourceId: string | null;
      system: boolean;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.communicationOutbox.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          channel: data.channel,
          status: "PENDING",
          personId: data.personId,
          toAddress: data.toAddress,
          templateId: data.templateId,
          templateCode: data.templateCode,
          subject: data.subject,
          bodyRendered: data.body,
          payload: asJson(data.payload),
          consentCheckedAt: data.consentCheckedAt,
          scheduledAt: data.scheduledAt,
          nextAttemptAt: data.scheduledAt ?? new Date(),
          sourceType: data.sourceType,
          sourceId: data.sourceId,
          createdByUserId: actor.userId,
        },
      });
      await tx.outboxDeliveryEvent.create({
        data: {
          outboxId: row.id,
          status: "PENDING",
          providerResponse: asJson({
            enqueued: true,
            ...(data.system ? { system: true } : {}),
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "channels.outbox.enqueue",
          resourceType: "communication_outbox",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            channel: row.channel,
            templateCode: data.templateCode,
            ...(data.system
              ? {
                  system: true,
                  sourceType: row.sourceType,
                  sourceId: row.sourceId,
                }
              : {}),
          },
        },
      });
      return this.outboxDto(row);
    });
  }

  async listOutbox(
    actor: AuthUser,
    query: { status?: string; channel?: string; limit?: number },
  ) {
    const pilot = await this.requireChannelsAdmin(actor);
    const take = Math.min(Math.max(query.limit ?? 50, 1), 200);
    const rows = await this.prisma.communicationOutbox.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(query.status ? { status: query.status as never } : {}),
        ...(query.channel && isChannel(query.channel)
          ? { channel: query.channel }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take,
    });
    return {
      churchId: pilot.churchId,
      outbox: rows.map((r) => this.outboxDto(r)),
    };
  }

  async getOutbox(actor: AuthUser, outboxId: string) {
    const pilot = await this.requireChannelsAdmin(actor);
    const row = await this.prisma.communicationOutbox.findFirst({
      where: {
        id: outboxId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) throw new NotFoundException("Outbox não encontrado");
    const events = await this.prisma.outboxDeliveryEvent.findMany({
      where: { outboxId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      ...this.outboxDto(row),
      deliveryEvents: events.map((e) => ({
        id: e.id,
        status: e.status,
        providerResponse: e.providerResponse,
        errorMessage: e.errorMessage,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }

  async dispatchOne(actor: AuthUser, outboxId: string) {
    const pilot = await this.requireChannelsAdmin(actor);
    const row = await this.prisma.communicationOutbox.findFirst({
      where: {
        id: outboxId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
      include: { template: true },
    });
    if (!row) throw new NotFoundException("Outbox não encontrado");
    if (!OUTBOX_DISPATCHABLE.has(row.status)) {
      throw new BadRequestException(
        `Status ${row.status} não é despachável`,
      );
    }
    if (row.scheduledAt && row.scheduledAt.getTime() > Date.now()) {
      throw new BadRequestException("Ainda agendado — tente mais tarde");
    }

    if (!this.rateLimits.tryConsume(row.channel as CommChannel, pilot.churchId)) {
      await this.prisma.communicationOutbox.update({
        where: { id: outboxId },
        data: {
          status: "QUEUED",
          lastError: "RATE_LIMITED",
          nextAttemptAt: new Date(Date.now() + 30_000),
        },
      });
      throw new BadRequestException({
        message: "Rate limit do canal atingido",
        code: "CHANNEL_RATE_LIMITED",
      });
    }

    const provider = pickProvider(this.providers, row.channel as CommChannel);
    await this.prisma.communicationOutbox.update({
      where: { id: outboxId },
      data: { status: "SENDING", attemptCount: { increment: 1 } },
    });

    const result = await provider.send({
      outboxId: row.id,
      channel: row.channel as CommChannel,
      toAddress: row.toAddress,
      subject: row.subject,
      body: row.bodyRendered,
      templateCode: row.templateCode,
      providerTemplateName: row.template?.providerTemplateName ?? null,
      payload: (row.payload as Record<string, unknown>) ?? null,
    });

    const now = new Date();
    if (!result.ok) {
      const attempts = row.attemptCount + 1;
      const dead = attempts >= MAX_ATTEMPTS;
      const status = dead ? "DEAD" : "FAILED";
      return this.prisma.$transaction(async (tx) => {
        const updated = await tx.communicationOutbox.update({
          where: { id: outboxId },
          data: {
            status,
            lastError: result.errorMessage ?? "provider_failed",
            nextAttemptAt: dead
              ? null
              : new Date(now.getTime() + attempts * 60_000),
          },
        });
        await tx.outboxDeliveryEvent.create({
          data: {
            outboxId,
            status,
            providerResponse: asJson(result.raw ?? {}),
            errorMessage: result.errorMessage ?? "provider_failed",
          },
        });
        return this.outboxDto(updated);
      });
    }

    const status = result.delivered ? "DELIVERED" : "SENT";
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.communicationOutbox.update({
        where: { id: outboxId },
        data: {
          status,
          providerMessageId: result.providerMessageId ?? null,
          lastError: null,
          sentAt: now,
          deliveredAt: result.delivered ? now : null,
          nextAttemptAt: null,
        },
      });
      await tx.outboxDeliveryEvent.create({
        data: {
          outboxId,
          status,
          providerResponse: asJson({
            ...(result.raw ?? {}),
            providerMode: provider.mode,
            providerName: provider.name,
          }),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "channels.outbox.dispatch",
          resourceType: "communication_outbox",
          resourceId: outboxId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { status, provider: provider.name, mode: provider.mode },
        },
      });
      return this.outboxDto(updated);
    });
  }

  async dispatchPending(actor: AuthUser, limit = 20) {
    const pilot = await this.requireChannelsAdmin(actor);
    const take = Math.min(Math.max(limit, 1), 50);
    const rows = await this.prisma.communicationOutbox.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        status: { in: ["PENDING", "QUEUED", "FAILED"] },
        OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }],
      },
      orderBy: { createdAt: "asc" },
      take,
    });
    const results = [];
    for (const row of rows) {
      try {
        results.push(await this.dispatchOne(actor, row.id));
      } catch (err) {
        results.push({
          id: row.id,
          error: err instanceof Error ? err.message : "dispatch_failed",
        });
      }
    }
    return { processed: results.length, results };
  }

  async rateLimitStatus(actor: AuthUser) {
    const pilot = await this.requireChannelsAdmin(actor);
    return {
      churchId: pilot.churchId,
      providers: this.providerModes(),
      limits: CHANNELS.map((ch) =>
        this.rateLimits.snapshot(ch, pilot.churchId),
      ),
    };
  }

  private async hasChannelConsent(
    churchId: string,
    personId: string,
    channel: CommChannel,
  ): Promise<boolean> {
    const row = await this.prisma.communicationConsent.findUnique({
      where: { churchId_personId: { churchId, personId } },
    });
    if (!row || row.revokedAt) return false;
    if (channel === "WHATSAPP") return row.whatsappOptIn;
    if (channel === "EMAIL") return row.emailOptIn;
    return row.pushOptIn;
  }

  private async requireChannelsAdmin(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    if (!canManageChannels(actor.grants, pilot)) {
      throw new ForbiddenException("Sem permissão de canais (secretaria/pastor)");
    }
    return pilot;
  }

  /** Consent: self (personId === actor) ou admin canais. */
  private async requireConsentAccess(actor: AuthUser, personId: string) {
    const pilot = await this.pilot.getPilotChurch();
    if (actor.personId === personId) return pilot;
    if (!canManageChannels(actor.grants, pilot)) {
      throw new ForbiddenException("Sem permissão de canais (secretaria/pastor)");
    }
    return pilot;
  }

  private async resolveLatestPushToken(churchId: string, personId: string) {
    return this.prisma.pushDeviceToken.findFirst({
      where: { churchId, personId, revokedAt: null },
      orderBy: { lastSeenAt: "desc" },
    });
  }

  private assertPushPlatform(
    platform: string,
  ): asserts platform is PushPlatform {
    if (!["ANDROID", "IOS", "WEB"].includes(platform)) {
      throw new BadRequestException("platform inválido (ANDROID|IOS|WEB)");
    }
  }

  private async requirePerson(
    personId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId: pilot.organizationId },
    });
    if (!person) throw new NotFoundException("Pessoa não encontrada");
    return person;
  }

  private assertChannel(channel: string): asserts channel is CommChannel {
    if (!isChannel(channel)) {
      throw new BadRequestException("channel inválido");
    }
  }

  private templateDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    channel: string;
    code: string;
    name: string;
    subject: string | null;
    body: string;
    locale: string;
    providerTemplateName: string | null;
    variables: unknown;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      channel: row.channel,
      code: row.code,
      name: row.name,
      subject: row.subject,
      body: row.body,
      locale: row.locale,
      providerTemplateName: row.providerTemplateName,
      variables: row.variables,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private consentDto(row: {
    id: string;
    personId: string;
    whatsappOptIn: boolean;
    emailOptIn: boolean;
    pushOptIn: boolean;
    purposes: unknown;
    source: string | null;
    recordedAt: Date;
    revokedAt: Date | null;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      personId: row.personId,
      whatsappOptIn: row.whatsappOptIn,
      emailOptIn: row.emailOptIn,
      pushOptIn: row.pushOptIn,
      purposes: row.purposes,
      source: row.source,
      recordedAt: row.recordedAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private emptyConsent(personId: string) {
    return {
      id: null,
      personId,
      whatsappOptIn: false,
      emailOptIn: false,
      pushOptIn: false,
      purposes: [],
      source: null,
      recordedAt: null,
      revokedAt: null,
      updatedAt: null,
    };
  }

  private deviceTokenDto(
    row: {
      id: string;
      organizationId: string;
      churchId: string;
      personId: string;
      token: string;
      platform: string;
      provider: string;
      deviceLabel: string | null;
      appId: string | null;
      lastSeenAt: Date;
      revokedAt: Date | null;
      createdAt: Date;
      updatedAt: Date;
    },
    opts: { includeToken?: boolean } = {},
  ) {
    const includeToken = opts.includeToken !== false;
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      personId: row.personId,
      tokenSuffix: row.token.slice(-8),
      ...(includeToken ? { token: row.token } : {}),
      platform: row.platform,
      provider: row.provider,
      deviceLabel: row.deviceLabel,
      appId: row.appId,
      lastSeenAt: row.lastSeenAt.toISOString(),
      revokedAt: row.revokedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      liveFcm: false,
    };
  }

  private outboxDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    channel: string;
    status: string;
    personId: string | null;
    toAddress: string;
    templateId: string | null;
    templateCode: string | null;
    subject: string | null;
    bodyRendered: string;
    payload: unknown;
    consentCheckedAt: Date | null;
    providerMessageId: string | null;
    lastError: string | null;
    attemptCount: number;
    nextAttemptAt: Date | null;
    scheduledAt: Date | null;
    sentAt: Date | null;
    deliveredAt: Date | null;
    sourceType: string | null;
    sourceId: string | null;
    createdByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      channel: row.channel,
      status: row.status,
      personId: row.personId,
      toAddress: row.toAddress,
      templateId: row.templateId,
      templateCode: row.templateCode,
      subject: row.subject,
      bodyRendered: row.bodyRendered,
      payload: row.payload,
      consentCheckedAt: row.consentCheckedAt?.toISOString() ?? null,
      providerMessageId: row.providerMessageId,
      lastError: row.lastError,
      attemptCount: row.attemptCount,
      nextAttemptAt: row.nextAttemptAt?.toISOString() ?? null,
      scheduledAt: row.scheduledAt?.toISOString() ?? null,
      sentAt: row.sentAt?.toISOString() ?? null,
      deliveredAt: row.deliveredAt?.toISOString() ?? null,
      sourceType: row.sourceType,
      sourceId: row.sourceId,
      createdByUserId: row.createdByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function isChannel(value: string): value is CommChannel {
  return CHANNELS.includes(value as CommChannel);
}

function renderTemplate(
  template: string,
  variables: Record<string, string>,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => {
    return variables[key] ?? "";
  });
}

function defaultStubAddress(channel: CommChannel, seed: string): string {
  if (channel === "EMAIL") return `cms-notify+${seed}@example.invalid`;
  if (channel === "WHATSAPP") return `+550000000000`;
  return `device-stub-${seed}`;
}

function rosterAlertCopy(
  kind: RosterAlertKind,
  rosterTitle: string | null,
): { subject: string; body: string } {
  const title = rosterTitle?.trim() || "escala";
  switch (kind) {
    case "confirm":
      return {
        subject: `Escala confirmada: ${title}`,
        body: `Confirmação registrada para "${title}". (stub RF-015 — outbox mock, sem WABA live)`,
      };
    case "decline":
      return {
        subject: `Escala recusada: ${title}`,
        body: `Recusa registrada para "${title}". (stub RF-015 — outbox mock, sem WABA live)`,
      };
    case "substitute":
      return {
        subject: `Substituição na escala: ${title}`,
        body: `Substituição registrada em "${title}". (stub RF-015 — outbox mock, sem WABA live)`,
      };
    case "confirm_request":
    default:
      return {
        subject: `Confirme sua escala: ${title}`,
        body: `Você foi designado(a) em "${title}". Confirme ou recuse no app. (stub RF-015 — outbox mock, sem WABA live)`,
      };
  }
}
