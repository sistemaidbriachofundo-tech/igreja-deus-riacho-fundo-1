import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { ROLE_CODES, type OperationalScopeKind } from "@idbrf/shared";
import type { AuthUser } from "../auth/types/auth-user";
import { PrismaService } from "../prisma/prisma.service";
import { PilotService } from "../pilot/pilot.service";
import { assertChurchRole } from "./church";

const KINDS = ["MINISTRY", "MODULE", "GROUP", "TRACK"] as const;

@Injectable()
export class AccessScopesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
  ) {}

  async list(actor: AuthUser, userId: string) {
    const pilot = await this.admin(actor);
    const grants = await this.prisma.grant.findMany({
      where: { userId, organizationId: pilot.organizationId, churchId: pilot.churchId },
      select: { id: true, role: { select: { code: true } } },
    });
    const bindings = await this.prisma.accessScopeBinding.findMany({
      where: { grantId: { in: grants.map(grant => grant.id) } },
      orderBy: { createdAt: "asc" },
    });
    return {
      bindings: bindings.map(binding => ({
        id: binding.id, grantId: binding.grantId, kind: binding.kind, scopeId: binding.scopeId,
        roleCode: grants.find(grant => grant.id === binding.grantId)?.role.code ?? null,
      })),
    };
  }

  async bind(actor: AuthUser, input: { grantId: string; kind: string; scopeId: string }) {
    const pilot = await this.admin(actor);
    if (!KINDS.includes(input.kind as typeof KINDS[number])) throw new BadRequestException("Escopo inválido.");
    const grant = await this.prisma.grant.findFirst({
      where: { id: input.grantId, organizationId: pilot.organizationId, churchId: pilot.churchId },
      select: { id: true },
    });
    if (!grant) throw new NotFoundException("Perfil não encontrado nesta congregação.");
    await this.assertTarget(pilot, input.kind as OperationalScopeKind, input.scopeId);
    try {
      const saved = await this.prisma.accessScopeBinding.create({
        data: { grantId: grant.id, kind: input.kind as OperationalScopeKind, scopeId: input.scopeId },
      });
      await this.prisma.auditLog.create({
        data: {
          actorUserId: actor.userId, action: "access.scope.bind", resourceType: "grant", resourceId: grant.id,
          organizationId: pilot.organizationId, churchId: pilot.churchId,
          metadata: { kind: input.kind, scopeId: input.scopeId },
        },
      });
      return { id: saved.id, grantId: saved.grantId, kind: saved.kind, scopeId: saved.scopeId };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
        throw new ConflictException("Este escopo já está vinculado.");
      }
      throw error;
    }
  }

  async remove(actor: AuthUser, bindingId: string) {
    const pilot = await this.admin(actor);
    const binding = await this.prisma.accessScopeBinding.findUnique({
      where: { id: bindingId },
      select: { id: true, grantId: true },
    });
    const grant = binding
      ? await this.prisma.grant.findFirst({
        where: { id: binding.grantId, organizationId: pilot.organizationId, churchId: pilot.churchId },
        select: { id: true },
      })
      : null;
    if (!binding || !grant) throw new NotFoundException("Vínculo não encontrado.");
    await this.prisma.accessScopeBinding.delete({ where: { id: binding.id } });
    await this.prisma.auditLog.create({
      data: {
        actorUserId: actor.userId, action: "access.scope.remove", resourceType: "grant", resourceId: binding.grantId,
        organizationId: pilot.organizationId, churchId: pilot.churchId, metadata: { bindingId },
      },
    });
    return { removed: true };
  }

  private async admin(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    assertChurchRole(actor, pilot, [ROLE_CODES.PLATFORM_ADMIN]);
    return pilot;
  }

  private async assertTarget(pilot: { organizationId: string; churchId: string }, kind: OperationalScopeKind, scopeId: string) {
    const found = kind === "MINISTRY"
      ? await this.prisma.ministry.count({ where: { id: scopeId, churchId: pilot.churchId } })
      : kind === "MODULE"
        ? await this.prisma.ministryRosterModule.count({ where: { id: scopeId, ministry: { churchId: pilot.churchId } } })
        : kind === "GROUP"
          ? await this.prisma.smallGroup.count({ where: { id: scopeId, churchId: pilot.churchId } })
          : await this.prisma.discipleshipTrack.count({ where: { id: scopeId, churchId: pilot.churchId } });
    if (!found) throw new NotFoundException("O escopo não pertence a esta congregação.");
  }
}
