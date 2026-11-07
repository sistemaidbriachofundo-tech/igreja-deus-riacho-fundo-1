import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  canAccessChurch,
  canManageMemberships,
  hasAccess,
  ROLE_CODES,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

const ASSET_STATUSES = ["ACTIVE", "MAINTENANCE", "LOST", "DISPOSED"] as const;
type AssetStatus = (typeof ASSET_STATUSES)[number];

const MAX_NOTE = 280;

/**
 * RF-030 — Patrimônio mínimo (registro + responsável/localização/situação/histórico).
 * Multi-igreja só via grants já existentes (`canAccessChurch`).
 */
@Injectable()
export class AssetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async create(
    actor: AuthUser,
    input: {
      name: string;
      code?: string;
      description?: string;
      location?: string;
      responsiblePersonId?: string;
      status?: string;
      acquiredAt?: string;
      churchId?: string;
    },
  ) {
    const scope = await this.resolveChurchScope(actor, input.churchId);
    this.assertManage(actor, scope.organizationId, scope.churchId);

    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException("name é obrigatório");
    }
    const code = input.code?.trim() || null;
    const status = input.status
      ? this.requireStatus(input.status)
      : ("ACTIVE" as AssetStatus);

    if (input.responsiblePersonId) {
      await this.requirePerson(
        input.responsiblePersonId,
        scope.organizationId,
      );
    }

    const acquiredAt = this.parseOptionalDate(input.acquiredAt, "acquiredAt");

    return this.prisma.$transaction(async (tx) => {
      const asset = await tx.churchAsset.create({
        data: {
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          name,
          code,
          description: input.description?.trim() || null,
          location: input.location?.trim() || null,
          responsiblePersonId: input.responsiblePersonId ?? null,
          status,
          acquiredAt,
        },
      });
      await tx.churchAssetHistory.create({
        data: {
          assetId: asset.id,
          kind: "CREATED",
          toStatus: status,
          toLocation: asset.location,
          toResponsiblePersonId: asset.responsiblePersonId,
          actorUserId: actor.userId,
          note: "Cadastro inicial",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "asset.create",
          resourceType: "church_asset",
          resourceId: asset.id,
          organizationId: scope.organizationId,
          churchId: scope.churchId,
          metadata: { name, code, status },
        },
      });
      return this.toAssetDto(asset);
    });
  }

  async list(
    actor: AuthUser,
    filters: { churchId?: string; status?: string } = {},
  ) {
    const scope = await this.resolveChurchScope(actor, filters.churchId);
    this.assertManage(actor, scope.organizationId, scope.churchId);

    const status = filters.status
      ? this.requireStatus(filters.status)
      : undefined;

    const rows = await this.prisma.churchAsset.findMany({
      where: {
        organizationId: scope.organizationId,
        churchId: scope.churchId,
        ...(status ? { status } : {}),
      },
      orderBy: [{ name: "asc" }],
    });

    return {
      organizationId: scope.organizationId,
      churchId: scope.churchId,
      assets: rows.map((row) => this.toAssetDto(row)),
    };
  }

  async getById(actor: AuthUser, assetId: string) {
    const asset = await this.requireAssetForActor(actor, assetId);
    return this.toAssetDto(asset);
  }

  async update(
    actor: AuthUser,
    assetId: string,
    input: {
      name?: string;
      description?: string;
      location?: string;
      responsiblePersonId?: string | null;
      status?: string;
      acquiredAt?: string | null;
      note?: string;
    },
  ) {
    const current = await this.requireAssetForActor(actor, assetId);
    this.assertManage(actor, current.organizationId, current.churchId);

    if (input.responsiblePersonId) {
      await this.requirePerson(
        input.responsiblePersonId,
        current.organizationId,
      );
    }

    const nextStatus = input.status
      ? this.requireStatus(input.status)
      : undefined;
    const nextName = input.name !== undefined ? input.name.trim() : undefined;
    if (nextName !== undefined && !nextName) {
      throw new BadRequestException("name não pode ser vazio");
    }

    const nextLocation =
      input.location !== undefined
        ? input.location.trim() || null
        : undefined;
    const nextDescription =
      input.description !== undefined
        ? input.description.trim() || null
        : undefined;
    const nextResponsible =
      input.responsiblePersonId !== undefined
        ? input.responsiblePersonId
        : undefined;
    const nextAcquired =
      input.acquiredAt !== undefined
        ? input.acquiredAt === null || input.acquiredAt === ""
          ? null
          : this.parseOptionalDate(input.acquiredAt, "acquiredAt")
        : undefined;

    const note = this.normalizeNote(input.note);

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.churchAsset.update({
        where: { id: current.id },
        data: {
          ...(nextName !== undefined ? { name: nextName } : {}),
          ...(nextDescription !== undefined
            ? { description: nextDescription }
            : {}),
          ...(nextLocation !== undefined ? { location: nextLocation } : {}),
          ...(nextResponsible !== undefined
            ? { responsiblePersonId: nextResponsible }
            : {}),
          ...(nextStatus !== undefined ? { status: nextStatus } : {}),
          ...(nextAcquired !== undefined ? { acquiredAt: nextAcquired } : {}),
        },
      });

      const historyKinds: Array<{
        kind:
          | "STATUS_CHANGE"
          | "LOCATION_CHANGE"
          | "RESPONSIBLE_CHANGE"
          | "UPDATED"
          | "NOTE";
        fromStatus?: AssetStatus | null;
        toStatus?: AssetStatus | null;
        fromLocation?: string | null;
        toLocation?: string | null;
        fromResponsiblePersonId?: string | null;
        toResponsiblePersonId?: string | null;
        note?: string | null;
      }> = [];

      if (nextStatus !== undefined && nextStatus !== current.status) {
        historyKinds.push({
          kind: "STATUS_CHANGE",
          fromStatus: current.status as AssetStatus,
          toStatus: nextStatus,
        });
      }
      if (
        nextLocation !== undefined &&
        nextLocation !== current.location
      ) {
        historyKinds.push({
          kind: "LOCATION_CHANGE",
          fromLocation: current.location,
          toLocation: nextLocation,
        });
      }
      if (
        nextResponsible !== undefined &&
        nextResponsible !== current.responsiblePersonId
      ) {
        historyKinds.push({
          kind: "RESPONSIBLE_CHANGE",
          fromResponsiblePersonId: current.responsiblePersonId,
          toResponsiblePersonId: nextResponsible,
        });
      }
      if (
        (nextName !== undefined && nextName !== current.name) ||
        (nextDescription !== undefined &&
          nextDescription !== current.description) ||
        (nextAcquired !== undefined &&
          (nextAcquired?.getTime() ?? null) !==
            (current.acquiredAt?.getTime() ?? null))
      ) {
        historyKinds.push({ kind: "UPDATED", note });
      } else if (note && historyKinds.length === 0) {
        historyKinds.push({ kind: "NOTE", note });
      } else if (note && historyKinds.length > 0) {
        historyKinds[0] = { ...historyKinds[0], note };
      }

      for (const event of historyKinds) {
        await tx.churchAssetHistory.create({
          data: {
            assetId: current.id,
            kind: event.kind,
            note: event.note ?? null,
            fromStatus: event.fromStatus ?? null,
            toStatus: event.toStatus ?? null,
            fromLocation: event.fromLocation ?? null,
            toLocation: event.toLocation ?? null,
            fromResponsiblePersonId: event.fromResponsiblePersonId ?? null,
            toResponsiblePersonId: event.toResponsiblePersonId ?? null,
            actorUserId: actor.userId,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "asset.update",
          resourceType: "church_asset",
          resourceId: current.id,
          organizationId: current.organizationId,
          churchId: current.churchId,
          metadata: {
            status: updated.status,
            location: updated.location,
            responsiblePersonId: updated.responsiblePersonId,
          },
        },
      });

      return this.toAssetDto(updated);
    });
  }

  async addNote(actor: AuthUser, assetId: string, note: string) {
    const current = await this.requireAssetForActor(actor, assetId);
    this.assertManage(actor, current.organizationId, current.churchId);
    const normalized = this.normalizeNote(note);
    if (!normalized) {
      throw new BadRequestException("note é obrigatório");
    }

    return this.prisma.$transaction(async (tx) => {
      const event = await tx.churchAssetHistory.create({
        data: {
          assetId: current.id,
          kind: "NOTE",
          note: normalized,
          actorUserId: actor.userId,
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "asset.history.note",
          resourceType: "church_asset",
          resourceId: current.id,
          organizationId: current.organizationId,
          churchId: current.churchId,
          metadata: { historyId: event.id },
        },
      });
      return this.toHistoryDto(event);
    });
  }

  async listHistory(actor: AuthUser, assetId: string) {
    const current = await this.requireAssetForActor(actor, assetId);
    this.assertManage(actor, current.organizationId, current.churchId);

    const rows = await this.prisma.churchAssetHistory.findMany({
      where: { assetId: current.id },
      orderBy: { recordedAt: "desc" },
    });

    return {
      assetId: current.id,
      history: rows.map((row) => this.toHistoryDto(row)),
    };
  }

  private async resolveChurchScope(actor: AuthUser, churchId?: string) {
    const pilot = await this.pilot.getPilotChurch();
    const organizationId = actor.organizationId ?? pilot.organizationId;
    const resolvedChurchId = churchId ?? actor.churchId ?? pilot.churchId;

    if (
      !canAccessChurch(actor.grants, {
        organizationId,
        churchId: resolvedChurchId,
      })
    ) {
      throw new ForbiddenException(
        "Sem grant para a congregação solicitada",
      );
    }

    const church = await this.prisma.church.findFirst({
      where: { id: resolvedChurchId, organizationId },
      select: { id: true, organizationId: true },
    });
    if (!church) {
      throw new NotFoundException("Congregação não encontrada");
    }

    return {
      organizationId: church.organizationId,
      churchId: church.id,
    };
  }

  private assertManage(
    actor: AuthUser,
    organizationId: string,
    churchId: string,
  ): void {
    const ok =
      canManageMemberships(actor.grants, { organizationId, churchId }) ||
      hasAccess(actor.grants, {
        roleCodes: [ROLE_CODES.PASTOR, ROLE_CODES.TESOURARIA],
        organizationId,
        churchId,
      });
    if (!ok) {
      throw new ForbiddenException(
        "Sem permissão para patrimônio nesta congregação",
      );
    }
  }

  private async requireAssetForActor(actor: AuthUser, assetId: string) {
    const asset = await this.prisma.churchAsset.findFirst({
      where: { id: assetId },
    });
    if (!asset) {
      throw new NotFoundException("Bem patrimonial não encontrado");
    }
    if (
      !canAccessChurch(actor.grants, {
        organizationId: asset.organizationId,
        churchId: asset.churchId,
      })
    ) {
      throw new ForbiddenException(
        "Sem grant para a congregação do bem",
      );
    }
    return asset;
  }

  private async requirePerson(personId: string, organizationId: string) {
    const person = await this.prisma.person.findFirst({
      where: { id: personId, organizationId },
      select: { id: true },
    });
    if (!person) {
      throw new BadRequestException("Pessoa não encontrada neste escopo");
    }
    return person;
  }

  private requireStatus(status: string): AssetStatus {
    if ((ASSET_STATUSES as readonly string[]).includes(status)) {
      return status as AssetStatus;
    }
    throw new BadRequestException(`status inválido: ${status}`);
  }

  private parseOptionalDate(value: string | undefined, field: string) {
    if (!value) return null;
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`${field} inválido`);
    }
    return d;
  }

  private normalizeNote(note?: string) {
    if (note === undefined || note === null) return null;
    const trimmed = note.trim();
    if (!trimmed) return null;
    if (trimmed.length > MAX_NOTE) {
      throw new BadRequestException(`note máx. ${MAX_NOTE} caracteres`);
    }
    return trimmed;
  }

  private toAssetDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    code: string | null;
    name: string;
    description: string | null;
    location: string | null;
    responsiblePersonId: string | null;
    status: string;
    acquiredAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      code: row.code,
      name: row.name,
      description: row.description,
      location: row.location,
      responsiblePersonId: row.responsiblePersonId,
      status: row.status as AssetStatus,
      acquiredAt: row.acquiredAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toHistoryDto(row: {
    id: string;
    assetId: string;
    kind: string;
    note: string | null;
    fromStatus: string | null;
    toStatus: string | null;
    fromLocation: string | null;
    toLocation: string | null;
    fromResponsiblePersonId: string | null;
    toResponsiblePersonId: string | null;
    actorUserId: string | null;
    recordedAt: Date;
    createdAt: Date;
  }) {
    return {
      id: row.id,
      assetId: row.assetId,
      kind: row.kind,
      note: row.note,
      fromStatus: row.fromStatus,
      toStatus: row.toStatus,
      fromLocation: row.fromLocation,
      toLocation: row.toLocation,
      fromResponsiblePersonId: row.fromResponsiblePersonId,
      toResponsiblePersonId: row.toResponsiblePersonId,
      actorUserId: row.actorUserId,
      recordedAt: row.recordedAt.toISOString(),
      createdAt: row.createdAt.toISOString(),
    };
  }
}
