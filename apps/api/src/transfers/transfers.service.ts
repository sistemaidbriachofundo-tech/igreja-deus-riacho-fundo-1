import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { canManageTransfers } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

@Injectable()
export class TransfersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  private assertManage(actor: AuthUser, organizationId: string, churchId: string) {
    if (!canManageTransfers(actor.grants, { organizationId, churchId })) {
      throw new ForbiddenException("Sem permissão para transferências");
    }
  }

  async list(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);
    const rows = await this.prisma.membershipTransfer.findMany({
      where: {
        organizationId: pilot.organizationId,
        OR: [{ fromChurchId: pilot.churchId }, { toChurchId: pilot.churchId }],
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { churchId: pilot.churchId, transfers: rows.map((r) => this.toDto(r)) };
  }

  async getById(actor: AuthUser, transferId: string) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);
    const row = await this.prisma.membershipTransfer.findFirst({
      where: {
        id: transferId,
        organizationId: pilot.organizationId,
        OR: [{ fromChurchId: pilot.churchId }, { toChurchId: pilot.churchId }],
      },
    });
    if (!row) throw new NotFoundException("Transferência não encontrada");
    return this.toDto(row);
  }

  /**
   * Inicia transferência: mesma person_id; destino deve existir na org.
   * Origem = piloto; destino = outra church da mesma org.
   */
  async create(
    actor: AuthUser,
    input: { personId: string; toChurchId: string; notes?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);

    if (!input.toChurchId || input.toChurchId === pilot.churchId) {
      throw new BadRequestException("toChurchId deve ser outra congregação da org");
    }

    const dest = await this.prisma.church.findFirst({
      where: { id: input.toChurchId, organizationId: pilot.organizationId },
    });
    if (!dest) {
      throw new BadRequestException("Congregação destino inválida neste escopo");
    }

    const membership = await this.prisma.churchMembership.findFirst({
      where: {
        personId: input.personId,
        churchId: pilot.churchId,
        organizationId: pilot.organizationId,
        status: "ACTIVE",
      },
    });
    if (!membership) {
      throw new NotFoundException("Membresia ACTIVE na origem não encontrada");
    }

    const open = await this.prisma.membershipTransfer.findFirst({
      where: {
        personId: input.personId,
        status: { in: ["DRAFT", "AWAITING_ORIGIN", "AWAITING_DESTINATION"] },
      },
    });
    if (open) {
      throw new ConflictException({
        message: "Já existe transferência aberta para esta pessoa",
        code: "TRANSFER_ALREADY_OPEN",
      });
    }

    const row = await this.prisma.membershipTransfer.create({
      data: {
        personId: input.personId,
        organizationId: pilot.organizationId,
        fromChurchId: pilot.churchId,
        toChurchId: dest.id,
        fromMembershipId: membership.id,
        status: "AWAITING_ORIGIN",
        notes: input.notes?.trim() || null,
        requestedByUserId: actor.userId,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action: "transfer.create",
        resourceType: "membership_transfer",
        resourceId: row.id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: { personId: input.personId, toChurchId: dest.id },
      },
    });

    return this.toDto(row);
  }

  async advance(
    actor: AuthUser,
    transferId: string,
    input: { decision: "APPROVE" | "REJECT"; rejectionReason?: string },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    this.assertManage(actor, pilot.organizationId, pilot.churchId);

    const row = await this.prisma.membershipTransfer.findFirst({
      where: {
        id: transferId,
        organizationId: pilot.organizationId,
      },
    });
    if (!row) throw new NotFoundException("Transferência não encontrada");
    if (["COMPLETED", "CANCELLED", "REJECTED"].includes(row.status)) {
      throw new ConflictException({
        message: "Transferência já encerrada",
        code: "TRANSFER_CLOSED",
      });
    }

    if (input.decision === "REJECT") {
      const updated = await this.prisma.membershipTransfer.update({
        where: { id: row.id },
        data: {
          status: "REJECTED",
          rejectionReason: input.rejectionReason?.trim() || "Rejeitada",
        },
      });
      await this.audit(actor, pilot, row.id, "transfer.reject", {});
      return this.toDto(updated);
    }

    // APPROVE
    if (row.status === "AWAITING_ORIGIN" && row.fromChurchId === pilot.churchId) {
      const updated = await this.prisma.membershipTransfer.update({
        where: { id: row.id },
        data: {
          status: "AWAITING_DESTINATION",
          approvedOriginAt: new Date(),
        },
      });
      await this.audit(actor, pilot, row.id, "transfer.approve_origin", {});
      return this.toDto(updated);
    }

    if (
      row.status === "AWAITING_DESTINATION" &&
      (row.toChurchId === pilot.churchId || row.fromChurchId === pilot.churchId)
    ) {
      // Piloto single-church: secretaria do piloto pode concluir destino demo.
      return this.completeTransfer(actor, row);
    }

    throw new ConflictException({
      message: "Etapa de transferência inválida para este ator/igreja",
      code: "TRANSFER_STEP_LOCKED",
    });
  }

  private async completeTransfer(
    actor: AuthUser,
    row: {
      id: string;
      personId: string;
      organizationId: string;
      fromChurchId: string;
      toChurchId: string;
      fromMembershipId: string;
    },
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.churchMembership.update({
        where: { id: row.fromMembershipId },
        data: { status: "TRANSFERRED", leftAt: new Date() },
      });
      await tx.memberCredential.updateMany({
        where: {
          membershipId: row.fromMembershipId,
          status: "ACTIVE",
        },
        data: { status: "REVOKED", revokedAt: new Date() },
      });

      const destMembership = await tx.churchMembership.upsert({
        where: {
          personId_churchId: {
            personId: row.personId,
            churchId: row.toChurchId,
          },
        },
        update: {
          status: "ACTIVE",
          leftAt: null,
        },
        create: {
          personId: row.personId,
          churchId: row.toChurchId,
          organizationId: row.organizationId,
          status: "ACTIVE",
        },
      });

      await tx.person.update({
        where: { id: row.personId },
        data: { homeChurchId: row.toChurchId },
      });

      return tx.membershipTransfer.update({
        where: { id: row.id },
        data: {
          status: "COMPLETED",
          approvedDestAt: new Date(),
          completedAt: new Date(),
          toMembershipId: destMembership.id,
        },
      });
    });

    await this.audit(actor, {
      organizationId: row.organizationId,
      churchId: row.fromChurchId,
    }, row.id, "transfer.complete", {
      personId: row.personId,
      toMembershipId: result.toMembershipId,
    });

    return this.toDto(result);
  }

  private async audit(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    resourceId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId,
        action,
        resourceType: "membership_transfer",
        resourceId,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        metadata: metadata as object,
      },
    });
  }

  private toDto(row: {
    id: string;
    personId: string;
    organizationId: string;
    fromChurchId: string;
    toChurchId: string;
    fromMembershipId: string;
    toMembershipId: string | null;
    status: string;
    notes: string | null;
    rejectionReason: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }) {
    return {
      id: row.id,
      personId: row.personId,
      organizationId: row.organizationId,
      fromChurchId: row.fromChurchId,
      toChurchId: row.toChurchId,
      fromMembershipId: row.fromMembershipId,
      toMembershipId: row.toMembershipId,
      status: row.status,
      notes: row.notes,
      rejectionReason: row.rejectionReason,
      createdAt: row.createdAt.toISOString(),
      completedAt: row.completedAt?.toISOString() ?? null,
    };
  }
}
