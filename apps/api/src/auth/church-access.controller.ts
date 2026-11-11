import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Post, Query } from "@nestjs/common";
import { hasAccess, ROLE_CODES } from "@idbrf/shared";
import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { PilotService } from "../pilot/pilot.service";
import { PrismaService } from "../prisma/prisma.service";
import { hashPassword } from "./auth.service";
import { CurrentUser } from "./decorators/current-user.decorator";
import { Roles } from "./decorators/roles.decorator";
import type { AuthUser } from "./types/auth-user";

const assignableRoles = [
  ROLE_CODES.SECRETARIA, ROLE_CODES.PASTOR, ROLE_CODES.TESOURARIA, ROLE_CODES.LIDER_MINISTERIO,
  ROLE_CODES.MEMBRO, ROLE_CODES.EDITOR_SITE, ROLE_CODES.PUBLICADOR_SITE,
] as const;

class CreateChurchLogin {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  personId!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(14)
  @MaxLength(128)
  password!: string;

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
  constructor(private readonly prisma: PrismaService, private readonly pilot: PilotService) {}

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
        person: { select: { id: true, displayName: true } },
        grants: {
          where: { AND: [{ OR: [{ organizationId }, { organizationId: null }] }, { OR: [{ churchId }, { churchId: null }] }] },
          select: { role: { select: { code: true } }, ministry: { select: { name: true } } },
        },
      },
    });
    return {
      accounts: rows.slice(0, 25).map(({ grants, ...row }) => ({
        ...row, profiles: grants.map(grant => ({ role: grant.role.code, ministry: grant.ministry?.name ?? null })),
      })),
      hasMore: rows.length > 25,
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
    if (!assignableRoles.includes(input.role)) throw new BadRequestException("Perfil inválido.");
    const isLeader = input.role === ROLE_CODES.LIDER_MINISTERIO;
    const ministryId = isLeader ? input.ministryId?.trim() : undefined;
    if (isLeader && !ministryId) throw new BadRequestException("Selecione o ministério que a pessoa lidera.");

    const email = input.email.trim().toLowerCase();
    if (!input.password.trim() || input.password.length < 14 || input.password.toLowerCase().includes(email)) {
      throw new BadRequestException("Crie uma senha de pelo menos 14 caracteres, diferente do e-mail.");
    }
    const passwordHash = await hashPassword(input.password);
    try {
      return await this.prisma.$transaction(async tx => {
        const person = await tx.person.findFirst({
          where: { id: input.personId, organizationId, homeChurchId: churchId, status: "ACTIVE" },
          select: { id: true, displayName: true },
        });
        if (!person) throw new NotFoundException("Pessoa ativa não encontrada nesta congregação.");
        if (ministryId && !(await tx.ministry.findFirst({ where: { id: ministryId, organizationId, churchId }, select: { id: true } }))) {
          throw new NotFoundException("Ministério não encontrado nesta congregação.");
        }
        const role = await tx.role.findUnique({ where: { code: input.role }, select: { id: true } });
        if (!role) throw new BadRequestException("Este perfil não está disponível.");
        const user = await tx.user.create({
          data: {
            personId: person.id, email, passwordHash,
            grants: { create: { roleId: role.id, organizationId, churchId, ministryId } },
          },
          select: { id: true, email: true, status: true },
        });
        await tx.auditLog.create({ data: {
          actorUserId: actor.userId, action: "access.create", resourceType: "user", resourceId: user.id,
          organizationId, churchId, metadata: { role: input.role, ministryId: ministryId ?? null },
        } });
        return { ...user, person, profiles: [{ role: input.role, ministryId }] };
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
        throw new ConflictException("Esta pessoa ou e-mail já tem acesso, ou outro cadastro está sendo salvo. Atualize a lista.");
      }
      throw error;
    }
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
