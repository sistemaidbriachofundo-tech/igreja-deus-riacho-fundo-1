import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Header, NotFoundException, Optional, Patch, Post, Query, Param, ServiceUnavailableException } from "@nestjs/common";
import { AuthService } from "./auth.service";
import { Prisma } from "@prisma/client";
import { Type } from "class-transformer";
import { hasAccess, ROLE_CODES, sortByName } from "@idbrf/shared";
import { IsEmail, IsIn, IsObject, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from "class-validator";
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
  ROLE_CODES.MEMBRO, ROLE_CODES.EDITOR_SITE, ROLE_CODES.PUBLICADOR_SITE, CHURCH_ADMINISTRATIVE_ROLE, "LIDER_MODULO",
] as const;
const accessPageSize = 25;

/** QA isolada: nunca ofereça este provisionador na produção da igreja. */
export const QA_PRESETS = [
  { slug: "pastora", name: "Pastora - ambiente de teste", role: ROLE_CODES.PASTOR },
  { slug: "secretaria1", name: "Secretaria 1 - ambiente de teste", role: ROLE_CODES.SECRETARIA },
  { slug: "secretaria2", name: "Secretaria 2 - ambiente de teste", role: ROLE_CODES.SECRETARIA },
  { slug: "louvor", name: "Lider do Louvor - ambiente de teste", role: ROLE_CODES.LIDER_MINISTERIO, ministrySlug: "louvor-demo" },
  { slug: "atmosfera", name: "Lider Atmosfera - ambiente de teste", role: ROLE_CODES.LIDER_MINISTERIO, ministrySlug: "atmosfera" },
  { slug: "homens", name: "Lider de Homens - ambiente de teste", role: ROLE_CODES.LIDER_MINISTERIO, ministrySlug: "homens" },
  { slug: "mentor", name: "Mentor da Conexao - ambiente de teste", role: ROLE_CODES.MEMBRO, mentor: true },
  { slug: "midia", name: "Equipe Midia - ambiente de teste", role: ROLE_CODES.EDITOR_SITE },
] as const;

export function qaTesterProvisionEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.IDBRF_RUNTIME_STAGE === "qa" &&
    env.F11_QA_TESTER_PASSWORD_ONLY === "true" &&
    env.ACCESS_INVITE_DELIVERY === "preview";
}



type ChurchScope = { organizationId: string; churchId: string };

class AccessProfileInput {
  @IsIn(assignableRoles)
  role!: typeof assignableRoles[number];

  @IsOptional()
  @IsString()
  @MaxLength(80)
  ministryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  moduleId?: string;
}

class CreateChurchLogin extends AccessProfileInput {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  personId!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;
}

class ChangeAccessProfile {
  @IsOptional()
  @IsString()
  @MaxLength(80)
  grantId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  moduleId?: string;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AccessProfileInput)
  profile?: AccessProfileInput;
}

const profileGrant = {
  id: true, churchId: true, organizationId: true, ministryId: true,
  role: { select: { code: true } },
  ministry: { select: { name: true, leaderPersonId: true } },
} satisfies Prisma.GrantSelect;

const profileLink = {
  moduleId: true, ministryId: true,
  module: { select: { name: true } },
} satisfies Prisma.MinistryRosterModuleLeaderSelect;

type ProfileGrant = Prisma.GrantGetPayload<{ select: typeof profileGrant }>;
type ProfileLink = Prisma.MinistryRosterModuleLeaderGetPayload<{ select: typeof profileLink }>;

type DisplayedProfile = {
  grantId: string; role: string; editable: boolean;
  ministryId: string | null; ministry: string | null; moduleId: string | null; module: string | null;
};

function visibleProfiles(grants: ProfileGrant[], links: ProfileLink[], personId: string, scope: ChurchScope) {
  return grants.flatMap<DisplayedProfile>(grant => {
    const isLeader = grant.role.code === ROLE_CODES.LIDER_MINISTERIO;
    const isTitular = isLeader && grant.ministry?.leaderPersonId === personId;
    const editable = grant.organizationId === scope.organizationId && grant.churchId === scope.churchId
      && assignableRoles.some(role => role === grant.role.code) && !isTitular;
    const base = { grantId: grant.id, ministryId: grant.ministryId, ministry: grant.ministry?.name ?? null, editable };
    const modules = isLeader && !isTitular ? links.filter(link => link.ministryId === grant.ministryId) : [];
    return modules.length ? modules.map(link => ({
      ...base, role: "LIDER_MODULO", moduleId: link.moduleId, module: link.module.name,
    })) : [{ ...base, role: grant.role.code, moduleId: null, module: null }];
  });
}


@Controller("admin/access")
@Roles(ROLE_CODES.PLATFORM_ADMIN)
export class ChurchAccessController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    @Optional() private readonly invitations?: AccessInvitationService,
    @Optional() private readonly auth?: AuthService,
  ) {}

  @Get()
  async list(@CurrentUser() actor: AuthUser, @Query("q") query = "", @Query("page") pageParam = "1", @Query("status") status = "") {
    const { organizationId, churchId } = await this.scope(actor);
    const page = Number(pageParam);
    if (!Number.isInteger(page) || page < 1 || page > 10000 || typeof query !== "string" || query.length > 100 || !["", "ACTIVE", "DISABLED"].includes(status)) {
      throw new BadRequestException("Busca de acessos inválida.");
    }
    const q = query.trim();
    const where: Prisma.UserWhereInput = {
      person: { organizationId, homeChurchId: churchId },
      ...(status === "ACTIVE" || status === "DISABLED" ? { status } : {}),
      ...(q ? { OR: [
        { email: { contains: q, mode: "insensitive" } },
        { person: { displayName: { contains: q, mode: "insensitive" } } },
      ] } : {}),
    };
    const offset = (page - 1) * accessPageSize;
    const { rows, hasMore } = await this.prisma.$transaction(async tx => {
      const names = await tx.user.findMany({
        where,
        orderBy: { id: "asc" },
        select: { id: true, person: { select: { displayName: true } } },
      });
      const pageIds = sortByName(names, account => account.person.displayName)
        .slice(offset, offset + accessPageSize).map(account => account.id);
      const hasMore = names.length > offset + accessPageSize;
      if (!pageIds.length) return { rows: [], hasMore };
      const accounts = await tx.user.findMany({
        where: { ...where, id: { in: pageIds } },
        select: {
          id: true, email: true, status: true,
          accessInvitations: { where: { purpose: "ACTIVATION" }, take: 1, orderBy: { createdAt: "desc" }, select: { sentAt: true, consumedAt: true, revokedAt: true, expiresAt: true } },
          person: { select: { id: true, displayName: true, status: true, rosterModuleLeaders: {
            where: { organizationId, churchId }, select: profileLink,
          } } },
          grants: { select: profileGrant },
        },
      });
      const byId = new Map(accounts.map(account => [account.id, account]));
      return { rows: pageIds.flatMap(id => byId.get(id) ?? []), hasMore };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
    const canInviteAdministrator = canDelegateChurchAdministration(actor, organizationId);
    return {
      accounts: rows.map(({ grants, accessInvitations, person, ...row }) => ({
        invitationStatus: row.status === "DISABLED" && accessInvitations[0] && !accessInvitations[0].consumedAt
          ? (accessInvitations[0].sentAt ? "INVITED" : "PENDING_EMAIL") : null,
        ...row,
        person: { id: person.id, displayName: person.displayName },
        profiles: visibleProfiles(grants.filter(grant => (!grant.organizationId || grant.organizationId === organizationId)
          && (!grant.churchId || grant.churchId === churchId)), person.rosterModuleLeaders ?? [], person.id, { organizationId, churchId }),
        canEditProfiles: person.status === "ACTIVE" && row.id !== actor.userId && !grants.some(grant => grant.role.code === ROLE_CODES.CONVIDADO
          || (!canInviteAdministrator && grant.role.code === CHURCH_ADMINISTRATIVE_ROLE)),
      })),
      hasMore,
      canInviteAdministrator,
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

  @Get("profile-options")
  async profileOptions(@CurrentUser() actor: AuthUser) {
    const { organizationId, churchId } = await this.scope(actor);
    const ministries = await this.prisma.ministry.findMany({
      where: { organizationId, churchId },
      select: { id: true, name: true, slug: true, rosterModules: {
        select: { id: true, name: true }, orderBy: { name: "asc" },
      } },
      orderBy: { name: "asc" },
    });
    return { ministries: ministries.map(({ id, name, slug, rosterModules }) => ({
      id, name, modules: slug === "atmosfera" ? rosterModules : [],
    })) };
  }


  /**
   * Provisionamento EXCLUSIVO do projeto de QA, disparado por administrador
   * autenticado com MFA recente. Não define nem mostra senhas: o próprio
   * testador ativa a conta com um link de uso único retornado no painel.
   * E-mails @example.test nunca correspondem a contas pessoais reais.
   */
  @Post("qa-testers")
  @Header("Cache-Control", "no-store")
  async createQaTesters(@CurrentUser() actor: AuthUser) {
    const { organizationId, churchId } = await this.scope(actor);
    if (!qaTesterProvisionEnabled() || !this.invitations || !this.auth) {
      throw new ForbiddenException("Provisionamento fictício desativado fora da QA isolada.");
    }
    const deliveryConfig = inviteEmailConfig();
    if (!deliveryConfig.preview) throw new ForbiddenException("Esta operação exige entrega privada em modo preview.");
    await this.auth.requireRecentMfa(actor);

    const result: Array<{ label: string; email: string; role: string; ministry: string | null; status: string; previewUrl?: string }> = [];
    for (const preset of QA_PRESETS) {
      const email = "qa.rf1.tester." + preset.slug + "@example.test";
      const personId = "qa_rf1_tester_person_" + preset.slug;
      const userId = "qa_rf1_tester_user_" + preset.slug;
      const role = await this.prisma.role.findUnique({ where: { code: preset.role }, select: { id: true } });
      if (!role) throw new ServiceUnavailableException("Perfil de QA ainda não cadastrado.");
      const ministrySlug = "ministrySlug" in preset ? preset.ministrySlug : null;
      const ministry = ministrySlug ? await this.prisma.ministry.findFirst({
        where: { organizationId, churchId, slug: ministrySlug }, select: { id: true, name: true },
      }) : null;
      if (ministrySlug && !ministry) throw new ServiceUnavailableException("Ministério QA não cadastrado: " + ministrySlug);
      const track = "mentor" in preset ? await this.prisma.discipleshipTrack.findFirst({
        where: { organizationId, churchId, name: "Trilha da Conexão" }, select: { id: true },
      }) : null;
      if ("mentor" in preset && !track) throw new ServiceUnavailableException("Trilha QA para mentor ausente.");

      const existing = await this.prisma.user.findUnique({
        where: { email }, select: { id: true, personId: true, status: true, passwordHash: true,
          grants: { select: { roleId: true, organizationId: true, churchId: true, ministryId: true } } },
      });
      if (existing && (existing.id !== userId || existing.personId !== personId ||
          !existing.grants.some(g => g.roleId === role.id && g.organizationId === organizationId &&
            g.churchId === churchId && g.ministryId === (ministry?.id ?? null)))) {
        throw new ConflictException("A conta de teste existente possui escopo diferente; intervenção administrativa necessária.");
      }
      if (existing?.status === "ACTIVE" && existing.passwordHash) {
        result.push({ label: preset.name, email, role: preset.role, ministry: ministry?.name ?? null, status: "ACTIVE" });
        continue;
      }
      if (existing && existing.status !== "DISABLED") throw new ConflictException("Conta QA em situação incompatível.");
      const issued = this.invitations.newToken();
      const created = await this.prisma.$transaction(async tx => {
        if (!existing) {
          await tx.person.create({ data: {
            id: personId, organizationId, homeChurchId: churchId,
            displayName: preset.name, email, status: "ACTIVE", kind: "MEMBER",
          } });
          await tx.user.create({ data: {
            id: userId, personId, email, status: "DISABLED", passwordHash: null, mfaRequired: false,
            grants: { create: { roleId: role.id, organizationId, churchId, ministryId: ministry?.id ?? null } },
          } });
          await tx.churchMembership.create({ data: {
            id: "qa_rf1_tester_membership_" + preset.slug,
            personId, organizationId, churchId, status: "ACTIVE",
            notes: "Cadastro sintético de QA; não representa membro real.",
          } });
          if (ministry) await tx.ministryMembership.create({ data: {
            id: "qa_rf1_tester_ministry_" + preset.slug, organizationId, churchId,
            ministryId: ministry.id, personId, role: "LIDER", status: "ATIVO", source: "DIRETO",
          } });
          if (track) await tx.discipleshipMentorRegistration.create({
            data: { trackId: track.id, personId },
          });
        }
        if (existing) {
          // Nenhum reset silencioso nem alteração de grants/senhas de contas ativadas.
          await tx.accessInvitation.updateMany({
            where: { userId, purpose: "ACTIVATION", consumedAt: null, revokedAt: null },
            data: { revokedAt: new Date() },
          });
        }
        const invite = await tx.accessInvitation.create({ data: {
          userId, tokenHash: issued.tokenHash, email, expiresAt: issued.expiresAt,
        }, select: { id: true } });
        await tx.auditLog.create({ data: {
          actorUserId: actor.userId, organizationId, churchId,
          action: "qa.access.persona_invited",
          resourceType: "user", resourceId: userId,
          metadata: { role: preset.role, ministryId: ministry?.id ?? null, synthetic: true },
        } });
        return invite;
      }, { isolationLevel: "Serializable" });
      const delivery = await this.invitations.deliver({
        inviteId: created.id, token: issued.token, email, name: preset.name,
      });
      result.push({
        label: preset.name, email, role: preset.role,
        ministry: ministry?.name ?? null, status: "ACTIVATION_REQUIRED",
        previewUrl: delivery.previewUrl,
      });
    }
    return { testOnly: true, adminMfaRequired: true, accounts: result };
  }

  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() input: CreateChurchLogin) {
    const { organizationId, churchId } = await this.scope(actor);
    if (!this.invitations) throw new ServiceUnavailableException("Envio de convites indisponível.");
    // Falha fechada: evita contas órfãs quando a entrega por e-mail está desconfigurada.
    const deliveryConfig = inviteEmailConfig();
    if (!assignableRoles.includes(input.role)) throw new BadRequestException("Perfil inválido.");
    if (input.role === CHURCH_ADMINISTRATIVE_ROLE) {
      if (!canDelegateChurchAdministration(actor, organizationId)) {
        throw new ForbiddenException("Somente a administração da organização pode conceder este perfil.");
      }
      if (!this.auth) throw new ServiceUnavailableException("A verificação do autenticador está indisponível.");
      await this.auth.requireRecentMfa(actor);
    }
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
        const { roleId, ministryId, moduleId } = await this.resolveProfile(tx, input, { organizationId, churchId }, person.id);
        const user = await tx.user.create({
          data: {
            personId: person.id, email, passwordHash: null, status: "DISABLED",
            grants: { create: { roleId, organizationId, churchId, ministryId } },
          },
          select: { id: true, email: true, status: true },
        });
        if (moduleId && ministryId) {
          await this.linkModule(tx, { organizationId, churchId, ministryId, moduleId, personId: person.id });
        }
        const invite = await tx.accessInvitation.create({
          data: { userId: user.id, tokenHash: issued.tokenHash, email, expiresAt: issued.expiresAt },
          select: { id: true },
        });
        await tx.auditLog.create({ data: {
          actorUserId: actor.userId, action: "access.invite.create", resourceType: "user", resourceId: user.id,
          organizationId, churchId, metadata: { role: input.role, ministryId, moduleId, expiresAt: issued.expiresAt.toISOString() },
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

  @Patch(":userId/profiles")
  async changeProfile(@CurrentUser() actor: AuthUser, @Param("userId") userId: string, @Body() input: ChangeAccessProfile) {
    const { organizationId, churchId } = await this.scope(actor);
    const scope = { organizationId, churchId };
    const canDelegate = canDelegateChurchAdministration(actor, organizationId);
    if (actor.userId === userId) throw new ForbiddenException("Outro administrador precisa alterar seu acesso.");
    if ((!input.grantId && !input.profile) || (input.moduleId && !input.grantId)) throw new BadRequestException("Escolha o perfil que deseja alterar.");

    try {
      return await this.prisma.$transaction(async tx => {
        const target = await tx.user.findFirst({
          where: { id: userId, person: { organizationId, homeChurchId: churchId, status: "ACTIVE" } },
          select: { personId: true, grants: { select: profileGrant }, person: { select: {
            rosterModuleLeaders: { where: scope, select: profileLink },
          } } },
        });
        if (!target) throw new NotFoundException("Conta não encontrada para uma pessoa ativa desta congregação.");
        if (target.grants.some(grant => grant.role.code === ROLE_CODES.CONVIDADO)) {
          throw new ForbiddenException("Acesse o cadastro de convidados para gerenciar esta conta.");
        }
        const selectsAdmin = input.profile?.role === CHURCH_ADMINISTRATIVE_ROLE;
        const targetIsAdmin = target.grants.some(grant => grant.role.code === CHURCH_ADMINISTRATIVE_ROLE);
        if (selectsAdmin || targetIsAdmin) {
          if (!canDelegate) throw new ForbiddenException("Somente a administração da organização pode alterar este acesso.");
          if (!this.auth) throw new ServiceUnavailableException("A verificação do autenticador está indisponível.");
          await this.auth.requireRecentMfa(actor);
        }

        const links = target.person.rosterModuleLeaders;
        const previous = input.grantId ? visibleProfiles(target.grants, links, target.personId, scope)
          .find(profile => profile.grantId === input.grantId && profile.moduleId === (input.moduleId ?? null)) : undefined;
        if (input.grantId && !previous) throw new ConflictException("O perfil mudou. Atualize a lista de acessos e tente novamente.");
        if (previous && !previous.editable) throw new ForbiddenException("Altere este perfil no cadastro do ministério ou na administração da organização.");

        const profile = input.profile;
        const next = profile ? await this.resolveProfile(tx, profile, scope, target.personId) : null;
        if (previous && next && previous.role === profile?.role && previous.ministryId === next.ministryId
          && previous.moduleId === next.moduleId) return { changed: false };

        if (previous?.moduleId) {
          await tx.ministryRosterModuleLeader.deleteMany({
            where: { ...scope, personId: target.personId, ministryId: previous.ministryId!, moduleId: previous.moduleId },
          });
        }
        const remainingLinks = links.filter(link => link.moduleId !== previous?.moduleId);
        const keepsGrant = previous?.moduleId && remainingLinks.some(link => link.ministryId === previous.ministryId);
        if (previous && !keepsGrant) await tx.grant.delete({ where: { id: previous.grantId } });

        if (next) {
          const existing = await tx.grant.findFirst({
            where: { ...scope, userId, roleId: next.roleId }, select: { ministryId: true },
          });
          if (existing && existing.ministryId !== next.ministryId) {
            throw new ConflictException("Esta conta já tem um perfil de liderança em outro ministério. Edite o perfil existente.");
          }
          if (existing && !next.moduleId) throw new ConflictException("Este perfil já está vinculado à conta.");
          if (existing && !remainingLinks.some(link => link.ministryId === next.ministryId)) {
            throw new ConflictException("Use Editar no perfil de líder de ministério para trocar seu acesso por um módulo.");
          }
          if (next.moduleId && remainingLinks.some(link => link.moduleId === next.moduleId) && existing) {
            throw new ConflictException("Este módulo já está vinculado à conta.");
          }
          if (!existing) await tx.grant.create({
            data: { ...scope, userId, roleId: next.roleId, ministryId: next.ministryId },
          });
          if (next.ministryId && next.moduleId) {
            await this.linkModule(tx, { ...scope, ministryId: next.ministryId, moduleId: next.moduleId, personId: target.personId });
          }
        }

        await tx.authSession.updateMany({
          where: { userId, revokedAt: null }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "ROLE_CHANGED" },
        });
        await tx.auditLog.create({ data: {
          ...scope, actorUserId: actor.userId, action: "access.profile.change", resourceType: "user", resourceId: userId,
          metadata: {
            previous: previous ? { role: previous.role, ministryId: previous.ministryId, moduleId: previous.moduleId } : null,
            next: profile && next ? { role: profile.role, ministryId: next.ministryId, moduleId: next.moduleId } : null,
          },
        } });
        return { changed: true };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034" || error.code === "P2025")) {
        throw new ConflictException("O acesso mudou enquanto você editava. Atualize a lista e tente novamente.");
      }
      throw error;
    }
  }

  private async resolveProfile(tx: Prisma.TransactionClient, input: AccessProfileInput, scope: ChurchScope, personId: string) {
    if (!assignableRoles.includes(input.role)) throw new BadRequestException("Perfil inválido.");
    const isModule = input.role === "LIDER_MODULO";
    const isLeader = isModule || input.role === ROLE_CODES.LIDER_MINISTERIO;
    const ministryId = isLeader ? input.ministryId?.trim() || null : null;
    const moduleId = isModule ? input.moduleId?.trim() || null : null;
    if (isLeader && !ministryId) throw new BadRequestException("Selecione o ministério.");
    if (isModule && !moduleId) throw new BadRequestException("Selecione o módulo.");
    if (ministryId) {
      const ministry = await tx.ministry.findFirst({
        where: { id: ministryId, ...scope }, select: { slug: true, leaderPersonId: true },
      });
      if (!ministry) throw new NotFoundException("Ministério não encontrado nesta congregação.");
      if (isModule) {
        if (ministry.slug !== "atmosfera" || !(await tx.ministryRosterModule.findFirst({
          where: { id: moduleId!, ministryId }, select: { id: true },
        }))) throw new NotFoundException("Módulo não encontrado neste ministério.");
        if (ministry.leaderPersonId === personId) {
          throw new ConflictException("Esta pessoa é responsável pelo ministério. Altere primeiro o responsável no cadastro do ministério.");
        }
      } else if (ministry.slug === "atmosfera" && ministry.leaderPersonId !== personId) {
        throw new ConflictException("Defina esta pessoa como responsável no cadastro do Atmosfera ou escolha Líder de módulo.");
      }
    }
    const role = await tx.role.findUnique({ where: { code: isModule ? ROLE_CODES.LIDER_MINISTERIO : input.role }, select: { id: true } });
    if (!role) throw new BadRequestException("Este perfil não está disponível.");
    return { roleId: role.id, ministryId, moduleId };
  }

  private async linkModule(tx: Prisma.TransactionClient, data: ChurchScope & { ministryId: string; moduleId: string; personId: string }) {
    const { moduleId, personId } = data;
    await tx.ministryRosterModuleLeader.upsert({
      where: { moduleId_personId: { moduleId, personId } }, create: data, update: data,
    });
  }

  @Post(":userId/administrator")
  async grantAdministrator(@CurrentUser() actor: AuthUser, @Param("userId") userId: string) {
    const { organizationId, churchId } = await this.scope(actor);
    if (actor.userId === userId || !canDelegateChurchAdministration(actor, organizationId)) {
      throw new ForbiddenException("Somente a administração da organização pode conceder este perfil a outra pessoa.");
    }
    if (!this.auth) throw new ServiceUnavailableException("A verificação do autenticador está indisponível.");
    await this.auth.requireRecentMfa(actor);
    const grant = async (tx: Prisma.TransactionClient) => {
      const target = await tx.user.findFirst({
        where: {
          id: userId, status: "ACTIVE", person: { organizationId, homeChurchId: churchId, status: "ACTIVE" },
          grants: { none: { role: { code: ROLE_CODES.CONVIDADO } } },
        },
        select: { id: true },
      });
      if (!target) throw new NotFoundException("Conta ativa não encontrada nesta congregação.");
      const role = await tx.role.findUnique({ where: { code: CHURCH_ADMINISTRATIVE_ROLE }, select: { id: true } });
      if (!role) throw new ServiceUnavailableException("Perfil de administrador indisponível.");
      const scope = { userId, roleId: role.id, organizationId, churchId, ministryId: null };
      if (await tx.grant.findFirst({ where: scope, select: { id: true } })) return { granted: false };
      await tx.grant.create({ data: scope });
      await tx.authSession.updateMany({ where: { userId, revokedAt: null }, data: { status: "REVOKED", revokedAt: new Date(), revokeReason: "ROLE_CHANGED" } });
      await tx.auditLog.create({ data: {
        actorUserId: actor.userId, action: "access.administrator.grant", resourceType: "user",
        resourceId: userId, organizationId, churchId,
      } });
      return { granted: true };
    };
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.prisma.$transaction(grant, { isolationLevel: "Serializable" });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 2) throw error;
      }
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
    const issued = await this.invitations.issueToken(purpose);
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
      expiresInHours: reset ? Math.max(1, Math.round((issued.expiresAt.getTime() - Date.now()) / 3600_000)) : undefined,
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
