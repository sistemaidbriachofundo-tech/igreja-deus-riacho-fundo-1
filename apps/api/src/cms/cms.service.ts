import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canAdministerMinistries } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import {
  assertMinistryScopedWrite,
  filterRowsForMinistryLeader,
  requireMinistryInPilot,
} from "../common/ministry-access";
import { ChannelsService } from "../channels/channels.service";
import type { CommChannel } from "../channels/providers/channel-provider";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { RESERVED_SITE_SLUGS } from "./site-layout.service";

const WORKFLOW = [
  "RASCUNHO",
  "REVISAO",
  "APROVADO",
  "PUBLICADO",
  "ARQUIVADO",
] as const;

type WorkflowStatus = (typeof WORKFLOW)[number];
type ContentKind =
  | "HOME_BLOCK"
  | "PAGE"
  | "NEWS"
  | "BANNER"
  | "MINISTRY_CONTENT";

const ALLOWED_TRANSITIONS: Record<WorkflowStatus, WorkflowStatus[]> = {
  RASCUNHO: ["REVISAO", "ARQUIVADO"],
  REVISAO: ["RASCUNHO", "APROVADO", "ARQUIVADO"],
  APROVADO: ["REVISAO", "PUBLICADO", "ARQUIVADO"],
  PUBLICADO: ["ARQUIVADO", "REVISAO"],
  ARQUIVADO: ["RASCUNHO"],
};

export type CmsInput = {
  kind?: ContentKind;
  slug?: string;
  title?: string;
  summary?: string | null;
  body?: string | null;
  imageUrl?: string | null;
  ministryId?: string | null;
  sortOrder?: number;
  status?: WorkflowStatus;
  note?: string;
  /** Stub F5: enfileira outbox ao publicar (sem WABA/SMTP live). */
  notifyOnPublish?: boolean;
  notifyChannels?: CommChannel[];
  notifyToAddress?: string | null;
  notifyPersonId?: string | null;
};

@Injectable()
export class CmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    private readonly channels: ChannelsService,
  ) {}

  async create(actor: AuthUser, input: CmsInput) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertCmsWrite(actor, pilot, input.ministryId ?? null);

    const kind = input.kind;
    const title = input.title?.trim();
    const slug = input.slug?.trim().toLowerCase();
    if (!kind || !isKind(kind)) {
      throw new BadRequestException("kind inválido");
    }
    if (slug && RESERVED_SITE_SLUGS.includes(slug as (typeof RESERVED_SITE_SLUGS)[number])) throw new BadRequestException("Use a Central de Gestão do Site para editar a Home");
    if (!title || !slug) {
      throw new BadRequestException("title e slug são obrigatórios");
    }
    if (kind === "MINISTRY_CONTENT" && !input.ministryId) {
      throw new BadRequestException(
        "ministryId obrigatório para MINISTRY_CONTENT",
      );
    }
    if (input.ministryId) {
      await requireMinistryInPilot(this.prisma, input.ministryId, pilot);
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.cmsContent.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ministryId: input.ministryId ?? null,
          kind,
          slug,
          title,
          summary: input.summary ?? null,
          body: input.body ?? null,
          imageUrl: input.imageUrl ?? null,
          sortOrder: input.sortOrder ?? 0,
          status: "RASCUNHO",
          createdByUserId: actor.userId,
          updatedByUserId: actor.userId,
        },
      });
      await tx.cmsContentRevision.create({
        data: {
          contentId: row.id,
          fromStatus: "RASCUNHO",
          toStatus: "RASCUNHO",
          actorUserId: actor.userId,
          note: "create",
          snapshot: this.snapshot(row),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "cms.create",
          resourceType: "cms_content",
          resourceId: row.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: { slug, kind },
        },
      });
      return this.toDto(row);
    });
  }

  async list(actor: AuthUser, kind?: string) {
    const pilot = await this.pilot.getPilotChurch();
    if (
      !canAdministerMinistries(actor.grants, pilot) &&
      !actor.grants.some((g) => g.roleCode === "LIDER_MINISTERIO")
    ) {
      throw new ForbiddenException("Sem permissão CMS");
    }

    const rows = await this.prisma.cmsContent.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(kind && isKind(kind) ? { kind } : {}),
      },
      orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }],
    });

    const visible = filterRowsForMinistryLeader(rows, actor, pilot)
      .filter(row => !RESERVED_SITE_SLUGS.includes(row.slug as (typeof RESERVED_SITE_SLUGS)[number]));

    return {
      churchId: pilot.churchId,
      contents: visible.map((r) => this.toDto(r)),
    };
  }

  async get(actor: AuthUser, contentId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const row = await this.requireContent(contentId, pilot);
    if (RESERVED_SITE_SLUGS.includes(row.slug as (typeof RESERVED_SITE_SLUGS)[number])) throw new NotFoundException("Use a Central de Gestão do Site");
    this.assertCmsWrite(actor, pilot, row.ministryId);
    const revisions = await this.prisma.cmsContentRevision.findMany({
      where: { contentId },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return {
      ...this.toDto(row),
      revisions: revisions.map((r) => ({
        id: r.id,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        actorUserId: r.actorUserId,
        note: r.note,
        snapshot: r.snapshot,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async patch(actor: AuthUser, contentId: string, input: CmsInput) {
    const pilot = await this.pilot.getPilotChurch();
    const existing = await this.requireContent(contentId, pilot);
    if (RESERVED_SITE_SLUGS.includes(existing.slug as (typeof RESERVED_SITE_SLUGS)[number])) throw new BadRequestException("Use a Central de Gestão do Site");
    this.assertCmsWrite(actor, pilot, existing.ministryId);

    const data: Record<string, unknown> = {
      updatedByUserId: actor.userId,
    };
    if (input.title !== undefined) {
      const title = input.title?.trim();
      if (!title) throw new BadRequestException("title inválido");
      data.title = title;
    }
    if (input.slug !== undefined) {
      if (!canAdministerMinistries(actor.grants, pilot)) {
        throw new ForbiddenException("Só secretaria/pastor altera slug");
      }
      const slug = input.slug?.trim().toLowerCase();
      if (!slug) throw new BadRequestException("slug inválido");
      if (RESERVED_SITE_SLUGS.includes(slug as (typeof RESERVED_SITE_SLUGS)[number])) throw new BadRequestException("Slug reservado ao editor visual");
      data.slug = slug;
    }
    if (input.summary !== undefined) data.summary = input.summary;
    if (input.body !== undefined) data.body = input.body;
    if (input.imageUrl !== undefined) data.imageUrl = input.imageUrl;
    if (input.sortOrder !== undefined) data.sortOrder = input.sortOrder ?? 0;
    if (input.kind !== undefined) {
      if (!isKind(input.kind)) throw new BadRequestException("kind inválido");
      data.kind = input.kind;
    }
    if (input.ministryId !== undefined) {
      if (input.ministryId) {
        await requireMinistryInPilot(this.prisma, input.ministryId, pilot);
        this.assertCmsWrite(actor, pilot, input.ministryId);
      }
      data.ministryId = input.ministryId;
    }

    let nextStatus: WorkflowStatus | undefined;
    if (input.status !== undefined) {
      nextStatus = input.status;
      if (!WORKFLOW.includes(nextStatus)) {
        throw new BadRequestException("status inválido");
      }
      const allowed = ALLOWED_TRANSITIONS[existing.status as WorkflowStatus];
      if (!allowed.includes(nextStatus)) {
        throw new BadRequestException(
          `Transição inválida: ${existing.status} → ${nextStatus}`,
        );
      }
      data.status = nextStatus;
      if (nextStatus === "PUBLICADO" && existing.status !== "PUBLICADO") {
        data.publishedAt = new Date();
      }
      if (nextStatus === "RASCUNHO" || nextStatus === "ARQUIVADO") {
        if (nextStatus === "RASCUNHO") data.publishedAt = null;
      }
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.cmsContent.update({
        where: { id: contentId },
        data,
      });
      await tx.cmsContentRevision.create({
        data: {
          contentId,
          fromStatus: existing.status,
          toStatus: (nextStatus ?? existing.status) as WorkflowStatus,
          actorUserId: actor.userId,
          note: input.note ?? (nextStatus ? "status" : "patch"),
          snapshot: this.snapshot(updated),
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "cms.patch",
          resourceType: "cms_content",
          resourceId: contentId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            fields: Object.keys(data),
            status: nextStatus ?? null,
            notifyOnPublish: Boolean(input.notifyOnPublish),
          },
        },
      });
      return updated;
    });

    const dto = this.toDto(row);
    if (
      input.notifyOnPublish &&
      nextStatus === "PUBLICADO" &&
      existing.status !== "PUBLICADO"
    ) {
      const notify = await this.channels.enqueueCmsPublishNotify({
        actor,
        contentId: row.id,
        title: row.title,
        slug: row.slug,
        channels: input.notifyChannels,
        toAddress: input.notifyToAddress,
        personId: input.notifyPersonId,
      });
      return { ...dto, notifyOnPublish: notify };
    }
    return dto;
  }

  async advance(actor: AuthUser, contentId: string, toStatus: WorkflowStatus) {
    return this.patch(actor, contentId, { status: toStatus });
  }

  private assertCmsWrite(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    ministryId: string | null,
  ): void {
    assertMinistryScopedWrite(actor, pilot, ministryId, {
      missingMinistry:
        "Líder só edita conteúdo vinculado ao próprio ministério",
      forbidden: "Sem permissão neste conteúdo/ministério",
    });
  }

  private async requireContent(
    contentId: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const row = await this.prisma.cmsContent.findFirst({
      where: {
        id: contentId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) throw new NotFoundException("Conteúdo não encontrado");
    return row;
  }

  private snapshot(row: {
    id: string;
    kind: string;
    slug: string;
    title: string;
    summary: string | null;
    body: string | null;
    imageUrl: string | null;
    ministryId: string | null;
    sortOrder: number;
    status: string;
  }) {
    return {
      id: row.id,
      kind: row.kind,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      body: row.body,
      imageUrl: row.imageUrl,
      ministryId: row.ministryId,
      sortOrder: row.sortOrder,
      status: row.status,
    };
  }

  private toDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    ministryId: string | null;
    kind: string;
    slug: string;
    title: string;
    summary: string | null;
    body: string | null;
    imageUrl: string | null;
    sortOrder: number;
    status: string;
    publishedAt: Date | null;
    createdByUserId: string | null;
    updatedByUserId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      ministryId: row.ministryId,
      kind: row.kind,
      slug: row.slug,
      title: row.title,
      summary: row.summary,
      body: row.body,
      imageUrl: row.imageUrl,
      sortOrder: row.sortOrder,
      status: row.status,
      publishedAt: row.publishedAt?.toISOString() ?? null,
      createdByUserId: row.createdByUserId,
      updatedByUserId: row.updatedByUserId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function isKind(value: string): value is ContentKind {
  return [
    "HOME_BLOCK",
    "PAGE",
    "NEWS",
    "BANNER",
    "MINISTRY_CONTENT",
  ].includes(value);
}
