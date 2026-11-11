import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from "@nestjs/common";
import { canManageSpecificMinistry } from "@idbrf/shared";
import type { AuthUser } from "../../auth/types/auth-user";
import { requireMinistryInPilot } from "../../common/ministry-access";
import { PilotService } from "../../pilot/pilot.service";
import { PrismaService } from "../../prisma/prisma.service";
import {
  MINISTRY_AGENDA_MODEL_BLOCKED,
  MINISTRY_FINANCE_CONTRACT_BLOCKED,
  MINISTRY_INTEREST_CONVERSION_BLOCKED,
  MINISTRY_INTEREST_NOT_IN_SCOPE,
  MINISTRY_INTEREST_WITHOUT_PERSON,
  MINISTRY_MEMBERSHIP_ALREADY_ACTIVE,
  MINISTRY_MEMBERSHIP_ALREADY_ENDED,
  MINISTRY_MEMBERSHIP_NOT_IN_SCOPE,
  MINISTRY_MEMBERSHIP_PERSIST_REJECTED,
  MINISTRY_MEMBERSHIP_READY,
  MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED,
  MINISTRY_REQUEST_MODEL_BLOCKED,
  MINISTRY_SCOPE_FORBIDDEN,
  PERSON_NOT_IN_MINISTRY_SCOPE,
} from "./ministry-membership.contract";
import { isFormalRole, type MembershipScope } from "./ministry-membership.model";
import type { MinistryMembershipRepository } from "./ministry-membership.repository";
import {
  assertRepositoryCompatible,
  PrismaMinistryMembershipRepository,
} from "./prisma-ministry-membership.repository";
import { MinistryTeamService, type TeamWrite } from "./ministry-team.service";

/**
 * Porta HTTP do vínculo formal.
 * Confere org/igreja/ministério antes de qualquer leitura.
 * Sem a tabela ministry_memberships, o escopo autorizado termina em 501.
 */
@Injectable()
export class MinistryMembershipGateService {
  private readonly team: MinistryTeamService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly pilot: PilotService,
    @Optional() @Inject("MINISTRY_MEMBERSHIP_REPOSITORY") repository?: MinistryMembershipRepository,
  ) {
    const store =
      repository ??
      new PrismaMinistryMembershipRepository(assertRepositoryCompatible(prisma));
    this.team = new MinistryTeamService(store);
  }

  async readMemberships(actor: AuthUser, ministryId: string) {
    const scope = await this.scope(actor, ministryId);
    const result = await this.team.read(scope);
    if (result.outcome === "schema_blocked") {
      this.blocked(MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED, {
        dependency: "schema.prisma",
        issue: 97,
        members: null,
        message:
          "O cadastro formal de integrante ainda não tem tabela. Interesse de voluntariado não ocupa este lugar.",
      });
    }
    return {
      blocked: false,
      code: MINISTRY_MEMBERSHIP_READY,
      members: result.members,
    };
  }

  async readPerson(actor: AuthUser, ministryId: string, membershipId: string) {
    const scope = await this.scope(actor, ministryId);
    const member = await this.prisma.ministryMembership.findFirst({
      where: { ...scope, id: membershipId, endedAt: null, status: { not: "ENCERRADO" }, person: { organizationId: scope.organizationId } },
      select: { person: { select: { id: true, displayName: true, email: true, address: true } } },
    });
    if (!member) throw new NotFoundException("Integrante não encontrado na equipe autorizada.");
    return { person: member.person };
  }

  async admit(actor: AuthUser, ministryId: string, personId: string, role: string) {
    const scope = await this.scope(actor, ministryId);
    if (!personId?.trim() || !isFormalRole(role)) {
      throw new BadRequestException("personId e role formal são obrigatórios");
    }
    const result = await this.team.admit(scope, actor.userId, personId, role);
    const body = this.written(result, MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED, {
      createdMembership: null,
      message:
        "Incluir integrante ainda não persiste. A tabela ministry_memberships não existe.",
    });
    if (!("createdMembership" in body)) {
      throw new ConflictException({
        code: MINISTRY_MEMBERSHIP_PERSIST_REJECTED,
        message: "O vínculo não foi gravado neste escopo.",
      });
    }
    return body;
  }

  async convertInterest(actor: AuthUser, ministryId: string, volunteerInterestId: string) {
    const scope = await this.scope(actor, ministryId);
    const interestId = volunteerInterestId?.trim();
    if (!interestId) {
      throw new BadRequestException("volunteerInterestId é obrigatório");
    }
    const result = await this.team.convert(scope, actor.userId, interestId);
    const body = this.written(result, MINISTRY_INTEREST_CONVERSION_BLOCKED, {
      volunteerInterestId: interestId,
      createdMembership: null,
      message:
        "Converter interesse em integrante é uma ação separada e ainda não persiste. A etapa do voluntariado não cria vínculo.",
    });
    if (!("createdMembership" in body)) {
      throw new ConflictException({
        code: MINISTRY_MEMBERSHIP_PERSIST_REJECTED,
        message: "O vínculo não foi gravado neste escopo.",
      });
    }
    return body;
  }

  async endMembership(actor: AuthUser, ministryId: string, membershipId: string) {
    const scope = await this.scope(actor, ministryId);
    if (!membershipId?.trim()) {
      throw new BadRequestException("membershipId é obrigatório");
    }
    const result = await this.team.end(scope, actor.userId, membershipId);
    const body = this.written(result, MINISTRY_MEMBERSHIP_SCHEMA_BLOCKED, {
      member: null,
      message: "Encerrar vínculo ainda não persiste. A tabela ministry_memberships não existe.",
    });
    if (!("member" in body)) {
      throw new ConflictException({
        code: MINISTRY_MEMBERSHIP_PERSIST_REJECTED,
        message: "O vínculo não foi gravado neste escopo.",
      });
    }
    return body;
  }

  async readAgenda(actor: AuthUser, ministryId: string) {
    const ministry = await this.assertScope(actor, ministryId);
    this.blocked(MINISTRY_AGENDA_MODEL_BLOCKED, {
      dependency: "schema.prisma",
      issue: 97,
      scheduleText: ministry.scheduleText ?? null,
      items: null,
      message:
        "Há apenas o horário livre do perfil. A agenda estruturada não existe e as escalas globais ficam de fora deste escopo.",
    });
  }

  async readRequests(actor: AuthUser, ministryId: string) {
    await this.assertScope(actor, ministryId);
    this.blocked(MINISTRY_REQUEST_MODEL_BLOCKED, {
      dependency: "schema.prisma",
      issue: 97,
      requests: null,
      message: "Solicitações do ministério ainda não têm modelo. Nenhuma fila foi inventada.",
    });
  }

  async readCostCenterBalance(actor: AuthUser, ministryId: string) {
    const ministry = await this.assertScope({
      ...actor,
      grants: actor.grants.filter(grant =>
        grant.roleCode === "PLATFORM_ADMIN" || grant.roleCode === "LIDER_MINISTERIO"
      ),
    }, ministryId);

    // The cost center code points to the immutable ministry ID, even if its name changes.
    const rows = await this.prisma.$queryRaw<Array<{
      incomeCents: number;
      expenseCents: number;
      balanceCents: number;
    }>>`
      SELECT COALESCE(SUM(CASE WHEN account.type = 'REVENUE' THEN
        CASE WHEN line.side = 'CREDIT' THEN line.amount_cents ELSE -line.amount_cents END END), 0)::float8 AS "incomeCents",
        COALESCE(SUM(CASE WHEN account.type = 'EXPENSE' THEN
          CASE WHEN line.side = 'DEBIT' THEN line.amount_cents ELSE -line.amount_cents END END), 0)::float8 AS "expenseCents",
        COALESCE(SUM(CASE WHEN account.type = 'ASSET' THEN
          CASE WHEN line.side = 'DEBIT' THEN line.amount_cents ELSE -line.amount_cents END END), 0)::float8 AS "balanceCents"
      FROM cost_centers center
      LEFT JOIN ledger_entries entry ON entry.organization_id = center.organization_id
        AND entry.church_id = center.church_id AND entry.status IN ('APPROVED', 'REVERSED')
        AND (entry.cost_center_id = center.id OR (entry.cost_center_id IS NULL AND EXISTS (
          SELECT 1 FROM ledger_entries original
          WHERE original.id = entry.reversal_of_entry_id AND original.cost_center_id = center.id
        )))
      LEFT JOIN ledger_entry_lines line ON line.entry_id = entry.id
      LEFT JOIN ledger_accounts account ON account.id = line.account_id
        AND account.organization_id = center.organization_id AND account.church_id = center.church_id
      WHERE center.organization_id = ${ministry.organizationId}
        AND center.church_id = ${ministry.churchId} AND center.code = ${"MIN:" + ministry.id}
      GROUP BY center.id
    `;
    const totals = rows[0];
    if (!totals) {
      this.blocked(MINISTRY_FINANCE_CONTRACT_BLOCKED, {
        dependency: "issue-96",
        balance: null,
        message: "Ainda não há um centro de custo associado a este ministério.",
      });
    }
    return { ministryId: ministry.id, currency: "BRL", ...totals };
  }

  private async scope(actor: AuthUser, ministryId: string): Promise<MembershipScope> {
    const ministry = await this.assertScope(actor, ministryId);
    return {
      organizationId: ministry.organizationId,
      churchId: ministry.churchId,
      ministryId: ministry.id,
    };
  }

  private async assertScope(actor: AuthUser, ministryId: string) {
    const pilot = await this.pilot.getPilotChurch();
    const ministry = await requireMinistryInPilot(
      this.prisma,
      ministryId,
      pilot,
      "notFound",
    );
    const allowed = canManageSpecificMinistry(actor.grants, actor.personId, {
      organizationId: pilot.organizationId,
      churchId: pilot.churchId,
      ministryId: ministry.id,
      leaderPersonId: ministry.leaderPersonId,
    });
    if (!allowed) {
      throw new ForbiddenException({
        statusCode: 403,
        error: "Forbidden",
        code: MINISTRY_SCOPE_FORBIDDEN,
        message: "Líder só visualiza dados do ministério autorizado.",
      });
    }
    return ministry;
  }

  private written(
    result: TeamWrite,
    blockedCode: string,
    blockedBody: Record<string, unknown>,
  ) {
    if (result.outcome === "schema_blocked") {
      this.blocked(blockedCode, {
        dependency: "schema.prisma",
        issue: 97,
        ...blockedBody,
      });
    }
    if (result.outcome === "created" || result.outcome === "reactivated") {
      return {
        blocked: false,
        code: result.outcome === "created" ? "MINISTRY_MEMBERSHIP_CREATED" : "MINISTRY_MEMBERSHIP_REACTIVATED",
        createdMembership: result.member,
        auditId: result.auditId,
      };
    }
    if (result.outcome === "ended") {
      return {
        blocked: false,
        code: "MINISTRY_MEMBERSHIP_ENDED",
        member: result.member,
        auditId: result.auditId,
      };
    }
    if (result.outcome === "conflict") {
      throw new ConflictException({
        code: MINISTRY_MEMBERSHIP_ALREADY_ACTIVE,
        message: "Esta pessoa já possui vínculo aberto neste ministério.",
      });
    }
    if (result.outcome === "already_ended") {
      throw new ConflictException({
        code: MINISTRY_MEMBERSHIP_ALREADY_ENDED,
        message: "Este vínculo já está encerrado.",
      });
    }
    if (result.outcome === "not_found") {
      throw new NotFoundException({
        code: MINISTRY_MEMBERSHIP_NOT_IN_SCOPE,
        message: "Vínculo não encontrado neste ministério.",
      });
    }
    if (result.outcome === "person_not_in_scope") {
      throw new NotFoundException({
        code: PERSON_NOT_IN_MINISTRY_SCOPE,
        message: "Pessoa não encontrada neste escopo.",
      });
    }
    if (result.outcome === "interest_not_found" || result.outcome === "interest_other_ministry") {
      throw new NotFoundException({
        code: MINISTRY_INTEREST_NOT_IN_SCOPE,
        createdMembership: null,
        message: "Interesse não encontrado neste ministério.",
      });
    }
    if (result.outcome === "interest_without_person") {
      throw new UnprocessableEntityException({
        code: MINISTRY_INTEREST_WITHOUT_PERSON,
        createdMembership: null,
        message:
          "O interesse não está ligado a uma pessoa deste escopo. Nenhum integrante foi criado.",
      });
    }
    if (result.outcome === "invalid_role") {
      throw new BadRequestException("personId e role formal são obrigatórios");
    }
    throw new ConflictException({
      code: MINISTRY_MEMBERSHIP_PERSIST_REJECTED,
      message: "O vínculo não foi gravado neste escopo.",
    });
  }

  private blocked(code: string, body: Record<string, unknown>): never {
    throw new HttpException(
      {
        statusCode: 501,
        error: "Not Implemented",
        code,
        blocked: true,
        ...body,
      },
      HttpStatus.NOT_IMPLEMENTED,
    );
  }
}
