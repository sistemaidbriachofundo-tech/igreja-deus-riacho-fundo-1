import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  canAdministerMinistries,
  canManageSpecificMinistry,
} from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";

const STAGES = [
  "INTERESSE",
  "AVALIACAO",
  "APROVACAO",
  "EQUIPE",
  "DISPONIBILIDADE",
  "ESCALA",
] as const;

type Stage = (typeof STAGES)[number];

const STAGE_ORDER: Record<Stage, number> = {
  INTERESSE: 0,
  AVALIACAO: 1,
  APROVACAO: 2,
  EQUIPE: 3,
  DISPONIBILIDADE: 4,
  ESCALA: 5,
};

@Injectable()
export class VolunteersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  /**
   * POST público — privacy: não ecoa email/telefone; só ack.
   * Defaults ministry slug `atmosfera` se omitido.
   */
  async submitPublicInterest(input: {
    displayName: string;
    email: string;
    phone?: string | null;
    message?: string | null;
    ministrySlug?: string;
  }) {
    const pilot = await this.pilot.getPilotChurch();
    const displayName = input.displayName?.trim();
    const email = input.email?.trim().toLowerCase();
    if (!displayName || displayName.length < 2) {
      throw new BadRequestException("displayName inválido");
    }
    if (!email || !email.includes("@") || email.length > 200) {
      throw new BadRequestException("email inválido");
    }
    // Privacy: não aceitar campos pastorais / docs / menor.
    const forbiddenKeys = Object.keys(input as object).filter((k) =>
      ["cpf", "document", "birthDate", "isMinor", "phoneHome"].includes(k),
    );
    if (forbiddenKeys.length) {
      throw new BadRequestException("Campos não permitidos no formulário público");
    }

    const slug = (input.ministrySlug ?? "atmosfera").trim().toLowerCase();
    const ministry = await this.prisma.ministry.findFirst({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        slug,
        publishStatus: "PUBLISHED",
        visibility: "PUBLIC",
      },
    });
    if (!ministry) {
      throw new BadRequestException("Ministério de voluntariado indisponível");
    }

    const phone = input.phone?.trim() || null;
    if (phone && phone.length > 40) {
      throw new BadRequestException("phone inválido");
    }

    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.volunteerInterest.create({
        data: {
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          ministryId: ministry.id,
          displayName,
          email,
          phone,
          message: (() => {
            const msg = input.message?.trim();
            return msg ? msg.slice(0, 1000) : null;
          })(),
          stage: "INTERESSE",
          status: "OPEN",
        },
      });
      await tx.auditLog.create({
        data: {
          actorUserId: null,
          action: "volunteer_interest.create_public",
          resourceType: "volunteer_interest",
          resourceId: created.id,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            ministrySlug: slug,
            // sem email em audit metadata pública
            hasPhone: Boolean(phone),
          },
        },
      });
      return created;
    });

    return {
      received: true,
      id: row.id,
      stage: row.stage,
      ministrySlug: slug,
    };
  }

  async listAdmin(actor: AuthUser, ministryId?: string) {
    const pilot = await this.pilot.getPilotChurch();
    const admin = canAdministerMinistries(actor.grants, pilot);
    const isLider = actor.grants.some(
      (g) =>
        g.roleCode === "LIDER_MINISTERIO" &&
        (!g.organizationId || g.organizationId === pilot.organizationId) &&
        (!g.churchId || g.churchId === pilot.churchId),
    );
    if (!admin && !isLider) {
      throw new ForbiddenException("Sem permissão para listar interesses");
    }
    if (ministryId && !admin) {
      this.assertStaff(actor, pilot, ministryId);
    }

    const rows = await this.prisma.volunteerInterest.findMany({
      where: {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ...(ministryId ? { ministryId } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const visible = admin
      ? rows
      : rows.filter((row) =>
          canManageSpecificMinistry(actor.grants, actor.personId, {
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            ministryId: row.ministryId,
          }),
        );

    return {
      churchId: pilot.churchId,
      interests: visible.map((r) => this.toAdminDto(r)),
    };
  }

  async getAdmin(actor: AuthUser, interestId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const row = await this.requireInterest(interestId, pilot);
    this.assertStaff(actor, pilot, row.ministryId);
    return this.toAdminDto(row);
  }

  async advance(
    actor: AuthUser,
    interestId: string,
    input: {
      stage?: Stage;
      status?: "OPEN" | "REJECTED" | "CLOSED";
      personId?: string | null;
      rosterId?: string | null;
      notesInternal?: string | null;
    },
  ) {
    const pilot = await this.pilot.getPilotChurch();
    const existing = await this.requireInterest(interestId, pilot);
    this.assertStaff(actor, pilot, existing.ministryId);

    const data: Record<string, unknown> = {};
    if (input.status !== undefined) {
      if (!["OPEN", "REJECTED", "CLOSED"].includes(input.status)) {
        throw new BadRequestException("status inválido");
      }
      data.status = input.status;
    }
    if (input.notesInternal !== undefined) {
      data.notesInternal = input.notesInternal;
    }
    if (input.personId !== undefined) {
      if (input.personId) {
        const person = await this.prisma.person.findFirst({
          where: {
            id: input.personId,
            organizationId: pilot.organizationId,
          },
        });
        if (!person) {
          throw new BadRequestException("personId fora do escopo");
        }
      }
      data.personId = input.personId;
    }
    if (input.rosterId !== undefined) {
      if (input.rosterId) {
        const roster = await this.prisma.roster.findFirst({
          where: {
            id: input.rosterId,
            organizationId: pilot.organizationId,
            churchId: pilot.churchId,
            OR: [
              { ministryId: existing.ministryId },
              { ministryId: null },
            ],
          },
        });
        if (!roster) {
          throw new BadRequestException(
            "rosterId inválido para este ministério/igreja",
          );
        }
      }
      data.rosterId = input.rosterId;
    }
    if (input.stage !== undefined) {
      if (!STAGES.includes(input.stage)) {
        throw new BadRequestException("stage inválido");
      }
      const from = STAGE_ORDER[existing.stage as Stage];
      const to = STAGE_ORDER[input.stage];
      if (to < from - 1) {
        throw new BadRequestException(
          "Não é permitido retroceder mais de um estágio",
        );
      }
      if (to > from + 1) {
        throw new BadRequestException(
          "Avance a jornada um estágio por vez (Interesse→…→Escala)",
        );
      }
      // Ligação Person/Roster nas etapas finais
      if (
        (input.stage === "EQUIPE" ||
          input.stage === "DISPONIBILIDADE" ||
          input.stage === "ESCALA") &&
        !(input.personId ?? existing.personId)
      ) {
        throw new BadRequestException(
          "personId obrigatório a partir de EQUIPE (reusa Person)",
        );
      }
      if (input.stage === "ESCALA" && !(input.rosterId ?? existing.rosterId)) {
        throw new BadRequestException(
          "rosterId obrigatório na etapa ESCALA (reusa Roster)",
        );
      }
      data.stage = input.stage;
      if (input.stage === "APROVACAO" && !data.status) {
        data.status = "OPEN";
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const row = await tx.volunteerInterest.update({
        where: { id: interestId },
        data,
      });
      await tx.auditLog.create({
        data: {
          actorUserId: actor.userId,
          action: "volunteer_interest.advance",
          resourceType: "volunteer_interest",
          resourceId: interestId,
          organizationId: pilot.organizationId,
          churchId: pilot.churchId,
          metadata: {
            stage: row.stage,
            status: row.status,
            personId: row.personId,
            rosterId: row.rosterId,
          },
        },
      });
      return this.toAdminDto(row);
    });
  }

  private assertStaff(
    actor: AuthUser,
    pilot: { organizationId: string; churchId: string },
    ministryId: string | null,
  ): void {
    if (canAdministerMinistries(actor.grants, pilot)) return;
    if (!ministryId) {
      throw new ForbiddenException("Informe ministryId ou use papel admin");
    }
    if (
      !canManageSpecificMinistry(actor.grants, actor.personId, {
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
        ministryId,
      })
    ) {
      throw new ForbiddenException(
        "Líder só revisa interesses do próprio ministério",
      );
    }
  }

  private async requireInterest(
    id: string,
    pilot: { organizationId: string; churchId: string },
  ) {
    const row = await this.prisma.volunteerInterest.findFirst({
      where: {
        id,
        organizationId: pilot.organizationId,
        churchId: pilot.churchId,
      },
    });
    if (!row) throw new NotFoundException("Interesse não encontrado");
    return row;
  }

  /** Admin DTO — inclui contato; nunca usar em /public. */
  private toAdminDto(row: {
    id: string;
    organizationId: string;
    churchId: string;
    ministryId: string;
    displayName: string;
    email: string;
    phone: string | null;
    message: string | null;
    personId: string | null;
    stage: string;
    status: string;
    notesInternal: string | null;
    rosterId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: row.id,
      organizationId: row.organizationId,
      churchId: row.churchId,
      ministryId: row.ministryId,
      displayName: row.displayName,
      email: row.email,
      phone: row.phone,
      message: row.message,
      personId: row.personId,
      stage: row.stage,
      status: row.status,
      notesInternal: row.notesInternal,
      rosterId: row.rosterId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
