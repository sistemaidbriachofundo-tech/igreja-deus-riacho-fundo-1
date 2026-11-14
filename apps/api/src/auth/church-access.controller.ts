import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, NotFoundException, Optional, Post, Query, Param, ServiceUnavailableException } from "@nestjs/common";
import { hasAccess, ROLE_CODES } from "@idbrf/shared";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";
import { AccessInvitationService, inviteEmailConfig } from "./access-invitation.service";
import { Public } from "./decorators/public.decorator";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Roles } from "./decorators/roles.decorator";
import type { AuthUser } from "./types/auth-user";

/** O convite administrativo sempre grava um grant da congregação. */
export const CHURCH_ADMINISTRATIVE_ROLE = ROLE_CODES.PLATFORM_ADMIN;

function canDelegateChurchAdministration(actor: AuthUser, organizationId: string) {
  return actor.grants.some(grant =>
    grant.roleCode === ROLE_CODES.PLATFORM_ADMIN &&
    (!grant.organizationId || grant.organizationId === organizationId) &&
    !grant.churchId && !grant.ministryId,
  );
}

const assignableRoles = [
  ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.TESOURARIA, ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.MEMBRO, ROLE_CODES.EDITOR_SITE, ROLE_CODES.PUBLICADOR_SITE, CHURCH_ADMINISTRATIVE_ROLE,
] as const;

class CreateChurchLogin {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  personId!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn(assignableRoles)
  role!: typeof assignableRoles[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ministryId?: string;
}

@Controller("admin/access")
@Roles(ROLE_CODES.PLATFORM_ADMIN)
export class ChurchAccessController {
  constructor(private readonly prisma: PrismaService, private readonly pilot: PilotService, @Optional() private readonly invitations?: AccessInvitationService) {}

  @Get()
  async list(@CurrentUser() actor: AuthUser, @Query("q") query = "", @Query("page") pageParam = "1") {
    const { organizationId, churchId } = await this.scope(actor);
    const page = Number(pageParam);
    if (!Number.isInteger(page) || page < 1 || page > 10000 || typeof query !== "string" || query.length > 100) {
      throw new BadRequestException("Busca de acessos inválida.");
    }
    const q = query.trim();
    const rows = await this.prisma.user.findMany({
      where: {
        person: { organizationId, homeChurchId: churchId },
        ...(q ? { OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { person: { displayName: { contains: q, mode: "insensitive" as const } } },
        ] } : {}),
      },
      orderBy: [{ person: { displayName: "asc" } }, { id: "asc" }],
      skip: (page - 1) * 25,
      take: 26,
      select: {
        id: true, email: true, status: true,
        accessInvitations: { where: { purpose: "ACTIVATION" }, take: 1, orderBy: { createdAt: "desc" }, select: { sentAt: true, consumedAt: true, revokedAt: true, expiresAt: true } },
        person: { select: { id: true, displayName: true } },
        grants: {
          where: { AND: [{ OR: [{ organizationId }, { organizationId: null }] }, { OR: [{ churchId }, { churchId: null }] }] },
          select: { role: { select: { code: true } }, ministry: { select: { name: true } } },
        },
      },
    });
    return {
      accounts: rows.slice(0, 25).map(({ grants, accessInvitations, ...row }) => ({
        invitationStatus: row.status === "DISABLED" && accessInvitations[0] && !accessInvitations[0].consumedAt
          ? (accessInvitations[0].sentAt ? "INVITED" : "PENDING_EMAIL") : null,
        ...row, profiles: grants.map(grant => ({ role: grant.role.code, ministry: grant.ministry?.name ?? null })),
      })),
      hasMore: rows.length > 25,
      canInviteAdministrator: canDelegateChurchAdministration(actor, organizationId),
    };
  }

  @Get("people")
  async people(@CurrentUser() actor: AuthUser, @Query("q") query = "") {
    const { organizationId, churchId } = await this.scope(actor);
    if (typeof query !== "string" || query.length > 100) throw new BadRequestException("Busca de pessoas inválida.");
    const q = query.trim();
    if (q.length < 2) return { people: [] };
    const people = await this.prisma.person.findMany({
      where: {
        organizationId, homeChurchId: churchId, status: "ACTIVE", user: null,
        OR: [{ displayName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }],
      },
      orderBy: { displayName: "asc" },
      take: 20,
      select: { id: true, displayName: true, email: true },
    });
    return { people };
  }

  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() input: CreateChurchLogin) {
    const { organizationId, churchId } = await this.scope(actor);
    if (!this.invitations) throw new ServiceUnavailableException("Envio de convites indisponível.");
    // Falha fechada: evita contas órfãs quando a entrega por e-mail está desconfigurada.
    const deliveryConfig = inviteEmailConfig();
    if (!assignableRoles.includes(input.role)) throw new BadRequestException("Perfil inválido.");
    if (input.role === CHURCH_ADMINISTRATIVE_ROLE && !canDelegateChurchAdministration(actor, organizationId)) {
      throw new ForbiddenException("Somente a administração da organização pode conceder este perfil.");
    }
    const isLeader = input.role === ROLE_CODES.LIDER_MINISTERIO;
    const ministryId = isLeader ? input.ministryId?.trim() : undefined;
    if (isLeader && !ministryId) throw new BadRequestException("Selecione o ministério que a pessoa lidera.");
    const email = input.email.trim().toLowerCase();
    assertTestRecipient(email, deliveryConfig.preview || deliveryConfig.transport === "test");
    const issued = this.invitations.newToken();
    try {
      const created = await this.prisma.$transaction(async tx => {
        const person = await tx.person.findFirst({
          where: { id: input.personId, organizationId, homeChurchId: churchId, status: "ACTIVE" },
          select: { id: true, displayName: true, email: true },
        });
        if (!person) throw new NotFoundException("Pessoa ativa não encontrada nesta congregação.");
        if (!person.email || person.email.trim().toLowerCase() !== email) {
          throw new BadRequestException("O convite deve ser enviado ao e-mail validado na ficha da pessoa. Atualize o cadastro na Secretaria.");
        }
        if (ministryId && !(await tx.ministry.findFirst({ where: { id: ministryId, organizationId, churchId }, select: { id: true } }))) {
          throw new NotFoundException("Ministério não encontrado nesta congregação.");
        }
        const role = await tx.role.findUnique({ where: { code: input.role }, select: { id: true } });
        if (!role) throw new BadRequestException("Este perfil não está disponível.");
        const user = await tx.user.create({
          data: {
            personId: person.id, email, passwordHash: null, status: "DISABLED",
            grants: { create: { roleId: role.id, organizationId, churchId, ministryId } },
          },
          select: { id: true, email: true, status: true },
        });
        const invite = await tx.accessInvitation.create({
          data: { userId: user.id, tokenHash: issued.tokenHash, email, expiresAt: issued.expiresAt },
          select: { id: true },
        });
        await tx.auditLog.create({ data: {
          actorUserId: actor.userId, action: "access.invite.create", resourceType: "user", resourceId: user.id,
          organizationId, churchId, metadata: { role: input.role, ministryId: ministryId ?? null, expiresAt: issued.expiresAt.toISOString() },
        } });
        return { user, invite, person };
      }, { isolationLevel: "Serializable" });
      const delivery = await this.invitations.deliver({
        inviteId: created.invite.id, token: issued.token, email, name: created.person.displayName,
      });
      return { ...created.user, person: { id: created.person.id, displayName: created.person.displayName }, invite: delivery, invitationStatus: delivery.sent ? "INVITED" : "PENDING_EMAIL" };
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
        throw new ConflictException("Esta pessoa ou e-mail já tem acesso, ou outro cadastro está sendo salvo. Atualize a lista.");
      }
      throw error;
    }
  }

  @Post(":userId/invite/resend")
  async resend(@CurrentUser() actor: AuthUser, @Param("userId") userId: string) {
    return this.issueExistingAccountLink(actor, userId, "ACTIVATION");
  }

  @Post(":userId/password/reset")
  resetPassword(@CurrentUser() actor: AuthUser, @Param("userId") userId: string) {
    return this.issueExistingAccountLink(actor, userId, "PASSWORD_RESET");
  }

  private async issueExistingAccountLink(
    actor: AuthUser,
    userId: string,
    purpose: "ACTIVATION" | "PASSWORD_RESET",
  ) {
    const { organizationId, churchId } = await this.scope(actor);
    const reset = purpose === "PASSWORD_RESET";
    if (!this.invitations) throw new ServiceUnavailableException("Envio de convites indisponível.");
    const deliveryConfig = inviteEmailConfig();
    const issued = this.invitations.newToken(purpose);
    const created = await this.prisma.$transaction(async tx => {
      const user = await tx.user.findFirst({
        where: { id: userId, person: { organizationId, homeChurchId: churchId } },
        select: { id: true, email: true, status: true, passwordHash: true, person: { select: { displayName: true, email: true } } },
      });
      if (!user || (reset ? user.status !== "ACTIVE" || !user.passwordHash
        : user.status !== "DISABLED" || Boolean(user.passwordHash))) {
        throw new ConflictException(reset ? "Somente uma conta ativa pode recuperar a senha."
          : "Este usuário não possui um convite pendente para ativação.");
      }
      if (user.person.email?.trim().toLowerCase() !== user.email) {
        throw new BadRequestException("O endereço de e-mail mudou. Confira a ficha antes de reenviar o convite.");
      }
      assertTestRecipient(user.email, deliveryConfig.preview || deliveryConfig.transport === "test");
      const recent = await tx.accessInvitation.findFirst({
        where: { userId, purpose, revokedAt: null, createdAt: { gte: new Date(Date.now() - 60000) } },
        select: { id: true },
      });
      if (recent) throw new ConflictException("Aguarde ao menos um minuto antes de solicitar outro link.");
      const invite = await tx.accessInvitation.create({
        data: { userId, purpose, tokenHash: issued.tokenHash, email: user.email, expiresAt: issued.expiresAt },
        select: { id: true },
      });
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: reset ? "access.password.reset.request" : "access.invite.resend", resourceType: "user", resourceId: userId,
        organizationId, churchId,
      } });
      return { user, invite };
    }, { isolationLevel: "Serializable" }).catch(error => {
      if (error && typeof error === "object" && "code" in error && error.code === "P2034") {
        throw new ConflictException("Outro link está sendo criado para esta conta.");
      }
      throw error;
    });
    const delivery = await this.invitations.deliver({
      inviteId: created.invite.id, token: issued.token, email: created.user.email, name: created.user.person.displayName, purpose,
    });
    await this.prisma.accessInvitation.updateMany({
      where: { userId, purpose, id: { not: created.invite.id }, consumedAt: null, revokedAt: null,
        expiresAt: { lt: issued.expiresAt } },
      data: { revokedAt: new Date() },
    });
    return delivery;
  }

  private async scope(actor: AuthUser) {
    const pilot = await this.pilot.getPilotChurch();
    if (!hasAccess(actor.grants, { roleCodes: [ROLE_CODES.PLATFORM_ADMIN], organizationId: pilot.organizationId, churchId: pilot.churchId })
      || (actor.churchId && actor.churchId !== pilot.churchId)
      || (actor.organizationId && actor.organizationId !== pilot.organizationId)) {
      throw new ForbiddenException("Sem permissão para administrar acessos nesta congregação.");
    }
    return pilot;
  }
}

function assertTestRecipient(email: string, preview: boolean) {
  if (preview && !email.endsWith("@example.test")) {
    throw new BadRequestException("A entrega de teste é restrita a contas fictícias.");
  }
}

class ActivateInviteBody {
  @IsString()
  @MinLength(43)
  @MaxLength(43)
  token!: string;

  @IsString()
  @MinLength(14)
  @MaxLength(128)
  password!: string;
}

/** Endpoint público só consome convite de uso único, não registra usuários nem concede perfis. */
@Controller("auth")
export class AccessActivationController {
  constructor(private readonly invitations: AccessInvitationService) {}

  @Public()
  @Header("Cache-Control", "no-store")
  @Post("activate-invite")
  activate(@Body() body: ActivateInviteBody) {
    return this.invitations.accept(body);
  }

  @Public()
  @Header("Cache-Control", "no-store")
  @Post("reset-password")
  reset(@Body() body: ActivateInviteBody) {
    return this.invitations.accept(body, "PASSWORD_RESET");
  }
}
